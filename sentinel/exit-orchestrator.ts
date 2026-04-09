/**
 * Sentinel v0 — Exit Orchestrator
 *
 * Batch processes emergency exits for all users with positions in an
 * affected vault. Reuses existing VaultExecutor.redeem() and distributed
 * lock infrastructure from the cron orchestration service.
 */

import { createPublicClient, http, parseAbi } from "viem";
import { base } from "viem/chains";
import type { Action, ExitResult } from "./types";
import { THRESHOLDS } from "./config";
import { getSql } from "./db";
import { acquireUserLock, releaseUserLock } from "@/lib/redis/distributed-lock";
import { decryptAuthorization } from "@/lib/security/session-encryption";
import { getExecutor } from "@/lib/agent/vault-executor";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CONCURRENT_EXITS = 10;
const RETRY_DELAY_MS = 30_000;
const MAX_RETRIES = 1;
const IDEMPOTENCY_WINDOW_SQL = "1 hour";

const BALANCE_OF_ABI = parseAbi(["function balanceOf(address account) view returns (uint256)"]);

// ---------------------------------------------------------------------------
// Types (local to orchestrator)
// ---------------------------------------------------------------------------

interface UserPosition {
  user: UserRecord;
  agentAddress: `0x${string}`;
  shares: bigint;
}

interface UserRecord {
  id: string;
  wallet_address: string;
  session_type: string;
  authorization_7702: unknown;
  smart_wallet_address?: string;
}

// ---------------------------------------------------------------------------
// Exit Orchestrator
// ---------------------------------------------------------------------------

export class ExitOrchestrator {
  private erpcUrl: string;

  constructor(erpcUrl: string) {
    this.erpcUrl = erpcUrl;
  }

  /**
   * Execute emergency exits for all users with positions in the affected vault.
   */
  async execute(action: Action): Promise<ExitResult[]> {
    const sql = getSql();
    const results: ExitResult[] = [];

    // 1. Query affected users
    const users = (await sql`
      SELECT id, wallet_address, session_type, authorization_7702,
             authorization_7702->>'smartWalletAddress' as smart_wallet_address
      FROM users
      WHERE auto_optimize_enabled = true
        AND agent_registered = true
        AND authorization_7702 IS NOT NULL
    `) as UserRecord[];

    if (users.length === 0) {
      console.log("[Sentinel] No active users to process for exit");
      return results;
    }

    // 2. Fetch shares via multicall for all users
    const userPositions = await this.fetchUserPositions(users, action.vaultAddress);

    if (userPositions.length === 0) {
      console.log("[Sentinel] No users have positions in affected vault");
      return results;
    }

    // 3. Sort by shares descending (largest positions first)
    userPositions.sort((a, b) => (b.shares > a.shares ? 1 : -1));

    console.log(
      `[Sentinel] Processing ${userPositions.length} user exits for vault ${action.vaultAddress}`
    );

    // 4. Process in parallel batches
    for (let i = 0; i < userPositions.length; i += MAX_CONCURRENT_EXITS) {
      const batch = userPositions.slice(i, i + MAX_CONCURRENT_EXITS);
      const batchResults = await Promise.allSettled(
        batch.map((pos) => this.executeUserExit(pos, action))
      );

      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          results.push(result.value);
        } else {
          results.push({
            userAddress: "unknown",
            status: "FAILED",
            error: result.reason?.message || "Unknown batch error",
          });
        }
      }
    }

    return results;
  }

  /**
   * Fetch balanceOf for each user in the affected vault.
   */
  private async fetchUserPositions(
    users: UserRecord[],
    vaultAddress: `0x${string}`
  ): Promise<UserPosition[]> {
    const client = createPublicClient({
      chain: base,
      transport: http(`${this.erpcUrl}/main/evm/8453`),
    });

    const positions: UserPosition[] = [];

    for (const user of users) {
      try {
        const agentAddress = this.resolveAgentAddress(user);
        const shares = await client.readContract({
          address: vaultAddress,
          abi: BALANCE_OF_ABI,
          functionName: "balanceOf",
          args: [agentAddress],
        });

        if (shares > 0n) {
          positions.push({ user, agentAddress, shares });
        }
      } catch (error) {
        console.error(
          `[Sentinel] Failed to fetch balance for ${user.wallet_address}:`,
          (error as Error).message
        );
      }
    }

    return positions;
  }

  /**
   * Execute exit for a single user with idempotency check, lock, and retry.
   */
  private async executeUserExit(position: UserPosition, action: Action): Promise<ExitResult> {
    const { user, agentAddress, shares } = position;
    const sql = getSql();

    // --- Idempotency check: skip if already exited recently ---
    const recentExit = await sql`
      SELECT 1 FROM sentinel_incidents
      WHERE user_address = ${user.wallet_address}
        AND vault_address = ${action.vaultAddress}
        AND action_taken = 'exit'
        AND created_at > now() - interval ${IDEMPOTENCY_WINDOW_SQL}
      LIMIT 1
    `;

    if (recentExit.length > 0) {
      console.log(`[Sentinel] Skipping ${user.wallet_address}: already exited in last hour`);
      return {
        userAddress: user.wallet_address,
        status: "SKIPPED",
        reason: "IDEMPOTENT",
      };
    }

    // --- Distributed lock ---
    let lockResult: { acquired: boolean; lockId?: string };
    try {
      lockResult = await acquireUserLock(user.wallet_address, 120);
    } catch {
      // If Redis is unavailable, proceed without lock (fail-open for exits)
      console.warn(
        `[Sentinel] Could not acquire lock for ${user.wallet_address}, proceeding anyway`
      );
      lockResult = { acquired: true, lockId: undefined };
    }

    if (!lockResult.acquired) {
      console.warn(`[Sentinel] Lock held for ${user.wallet_address}, skipping`);
      return {
        userAddress: user.wallet_address,
        status: "SKIPPED",
        reason: "LOCKED",
      };
    }

    try {
      // --- Decrypt session ---
      const decryptedAuth = decryptAuthorization(user.authorization_7702 as any);

      // --- Build executor context ---
      const executor = getExecutor(action.protocol || "morpho");

      const ctx = {
        smartAccountAddress: agentAddress,
        serializedAccount: (decryptedAuth as any).serializedAccount || "",
        decryptedAuth: decryptedAuth as any,
        approvedVaults: (decryptedAuth as any).approvedVaults || [],
      };

      // --- Execute redeem with retry ---
      let txHash: string | undefined;
      let lastError: Error | undefined;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const result = await executor.redeem(ctx, {
            vaultAddress: action.vaultAddress,
            shares,
            receiver: agentAddress,
          });

          if (result.success) {
            txHash = result.txHash;
            break;
          } else {
            lastError = new Error(result.error || "Redeem returned failure");
          }
        } catch (error) {
          lastError = error as Error;
          if (attempt < MAX_RETRIES) {
            console.warn(
              `[Sentinel] Retry ${attempt + 1} for ${user.wallet_address}: ${lastError.message}`
            );
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          }
        }
      }

      if (!txHash) {
        await this.logIncident(
          user.wallet_address,
          action,
          "exit_failed",
          null,
          shares.toString(),
          user.session_type
        );

        return {
          userAddress: user.wallet_address,
          status: "FAILED",
          error: lastError?.message || "Max retries exhausted",
        };
      }

      // --- Log successful exit ---
      await this.logIncident(
        user.wallet_address,
        action,
        "exit",
        txHash,
        shares.toString(),
        user.session_type
      );

      return {
        userAddress: user.wallet_address,
        status: "SUCCESS",
        txHash,
        shares: shares.toString(),
      };
    } catch (error) {
      console.error(`[Sentinel] Exit failed for ${user.wallet_address}:`, (error as Error).message);

      return {
        userAddress: user.wallet_address,
        status: "FAILED",
        error: (error as Error).message,
      };
    } finally {
      if (lockResult.lockId) {
        try {
          await releaseUserLock(user.wallet_address, lockResult.lockId);
        } catch {
          // Non-critical: lock will auto-expire
        }
      }
    }
  }

  /**
   * Resolve the correct agent address based on session type.
   */
  private resolveAgentAddress(user: UserRecord): `0x${string}` {
    if (user.session_type === "zerodev-erc4337-session" && user.smart_wallet_address) {
      return user.smart_wallet_address as `0x${string}`;
    }
    return user.wallet_address as `0x${string}`;
  }

  /**
   * Log incident to the sentinel_incidents table.
   */
  private async logIncident(
    userAddress: string,
    action: Action,
    actionTaken: string,
    txHash: string | null,
    amountRedeemed: string | null,
    sessionType: string | null
  ): Promise<void> {
    const sql = getSql();
    try {
      await sql`
        INSERT INTO sentinel_incidents (
          user_address, vault_address, protocol, signal_type,
          signal_value, threshold, action_taken, tx_hash,
          amount_redeemed, session_type
        ) VALUES (
          ${userAddress},
          ${action.vaultAddress},
          ${action.protocol || "unknown"},
          ${action.signalType},
          ${typeof action.value === "number" ? action.value : null},
          ${this.getThreshold(action.reason)},
          ${actionTaken},
          ${txHash},
          ${amountRedeemed},
          ${sessionType}
        )
      `;
    } catch (error) {
      console.error("[Sentinel] Failed to log incident:", (error as Error).message);
    }
  }

  private getThreshold(reason: string): number | null {
    switch (reason) {
      case "DEPEG":
        return THRESHOLDS.DEPEG_EXIT_PCT;
      case "BANK_RUN":
        return THRESHOLDS.TVL_DROP_EXIT_PCT;
      case "SHARE_PRICE_DROP":
        return THRESHOLDS.SHARE_PRICE_DROP_PCT;
      case "MAX_REDEEM_ZERO":
        return 0;
      default:
        return null;
    }
  }
}
