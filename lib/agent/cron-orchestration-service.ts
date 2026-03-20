/**
 * CronOrchestrationService
 *
 * Extracted from app/api/agent/cron/route.ts (Phase 4, DDD refactoring).
 * Contains all business logic for the autonomous rebalancing + reward claiming cron job.
 *
 * The route handler delegates to this service after auth verification.
 * The service owns the CronSummary and returns it for the route to format.
 */

import { sql } from "@/lib/db";
import { yieldDecisionEngine } from "@/lib/agent/decision-engine";
import type { RebalanceDecision } from "@/lib/agent/decision-engine";
import type { MorphoVault } from "@/lib/morpho/api-client";
import type { YoVault } from "@/lib/yo/types";
import { executeRebalance } from "@/lib/agent/rebalance-executor";
import { formatUnits } from "viem";
import { decryptAuthorization } from "@/lib/security/session-encryption";
import { isSessionRevoked } from "@/lib/security/session-revocation";
import { AgentSession } from "@/lib/agent/agent-session";
import { acquireUserLock, releaseUserLock } from "@/lib/redis/distributed-lock";
import { getUserOpCount, incrementUserOpCount } from "@/lib/redis/rate-limiter";
import { fetchClaimableRewards } from "@/lib/yo/rewards-client";
import { executeYoRewardsClaim } from "@/lib/zerodev/yo-rewards-executor";
import { invalidateYoRewards } from "@/lib/redis/yo-cache";
import { verifyVaultApproval } from "@/lib/agent/resolve-registration";
import { MERKL_DISTRIBUTOR_ADDRESS_BASE } from "@/lib/yo/constants";
import { CHAIN_CONFIG } from "@/lib/config";
import type { DecryptedAuthorization } from "@/lib/zerodev/client-secure-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PrefetchedVaults = { morpho: MorphoVault[]; yo: YoVault[] };

export interface CronSummary {
  processed: number;
  rebalanced: number;
  claimed: number;
  skipped: number;
  errors: number;
  details: Array<{
    address: string;
    action: "rebalanced" | "claimed" | "skipped" | "error";
    reason: string;
    apyImprovement?: number;
    taskId?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BATCH_SIZE = parseInt(process.env.CRON_BATCH_SIZE || "50", 10);
const CONCURRENCY = parseInt(process.env.CRON_CONCURRENCY || "10", 10);
const USEROP_DAILY_LIMIT = 90;
const CRON_USEROP_RESERVE = 3;
const MERKL_CLAIM_THRESHOLD_USD = parseFloat(process.env.MERKL_CLAIM_THRESHOLD_USD || "2");
const MERKL_CLAIM_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Strip URLs, file paths, and connection strings from error messages
 * to prevent information leakage in cron summaries.
 */
export function sanitizeErrorMessage(message: string): string {
  return (
    message
      // Remove URLs (http/https/postgres/redis)
      .replace(/(?:https?|postgres(?:ql)?|redis(?:s)?|wss?):\/\/[^\s)]+/gi, "[REDACTED_URL]")
      // Remove file paths (/Users/..., /home/..., /app/..., C:\...)
      .replace(/(?:\/[\w.-]+){2,}/g, "[REDACTED_PATH]")
      .replace(/[A-Z]:\\[\w\\.-]+/gi, "[REDACTED_PATH]")
      // Remove connection strings (user:pass@host patterns)
      .replace(/\w+:\/\/[^@]+@[^\s]+/g, "[REDACTED_CONNECTION]")
  );
}

function isSessionValid(expiry: number): boolean {
  return expiry > Math.floor(Date.now() / 1000);
}

function createEmptySummary(): CronSummary {
  return {
    processed: 0,
    rebalanced: 0,
    claimed: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };
}

// ---------------------------------------------------------------------------
// Parallel batch processing
// ---------------------------------------------------------------------------

/**
 * Process users in parallel batches.
 * Reduces processing time from 83 min to ~8 min for 10k users.
 */
async function processUsersInParallel(
  users: Record<string, unknown>[],
  processFn: (
    user: Record<string, unknown>,
    summary: CronSummary,
    targetedVaults?: string[] | null,
    prefetchedVaults?: PrefetchedVaults
  ) => Promise<void>,
  summary: CronSummary,
  targetedVaults?: string[] | null,
  prefetchedVaults?: PrefetchedVaults
): Promise<void> {
  console.log(
    `[Cron] Processing ${users.length} users in batches of ${BATCH_SIZE} with concurrency ${CONCURRENCY}`
  );

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(users.length / BATCH_SIZE);

    console.log(`[Cron] Processing batch ${batchNum}/${totalBatches} (${batch.length} users)`);

    const chunks: Record<string, unknown>[][] = [];
    for (let j = 0; j < batch.length; j += CONCURRENCY) {
      chunks.push(batch.slice(j, j + CONCURRENCY));
    }

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (user) => {
          const lock = await acquireUserLock(user.wallet_address as string);
          if (!lock.acquired) {
            summary.skipped++;
            summary.details.push({
              address: user.wallet_address as string,
              action: "skipped",
              reason: "Rebalance already in progress (locked)",
            });
            return;
          }

          try {
            summary.processed++;
            await processFn(user, summary, targetedVaults, prefetchedVaults);
          } catch (error: any) {
            summary.errors++;
            summary.details.push({
              address: user.wallet_address as string,
              action: "error",
              reason: sanitizeErrorMessage(error.message || "Unknown error during processing"),
            });
            console.error(`[Cron] Error processing user ${user.wallet_address}:`, error.message);
          } finally {
            await releaseUserLock(user.wallet_address as string, lock.lockId!);
          }
        })
      );
    }
  }
}

// ---------------------------------------------------------------------------
// User rebalance processing
// ---------------------------------------------------------------------------

/**
 * Process rebalancing for a single user.
 *
 * Optimized flow (P0-2 + P2-1):
 * 1. Check session type from lightweight SQL field (no authorization blob)
 * 2. Evaluate rebalancing decision FIRST (most users won't need it)
 * 3. Only fetch + decrypt authorization_7702 for users that WILL rebalance
 */
async function processUserRebalance(
  user: Record<string, unknown>,
  summary: CronSummary,
  targetedVaults?: string[] | null,
  prefetchedVaults?: PrefetchedVaults
): Promise<void> {
  const userAddress = user.wallet_address as `0x${string}`;
  const userId = user.id as string;
  const sessionType = user.session_type as string;

  console.log(`[Cron] Processing ${userAddress}...`);

  // 1. Validate session type from lightweight field (no decryption needed)
  const sessionProbe = AgentSession.fromRaw({ type: sessionType });
  if (!sessionProbe || !sessionProbe.isValidType()) {
    summary.skipped++;
    summary.details.push({
      address: userAddress,
      action: "skipped",
      reason: "No valid ZeroDev session key found",
    });
    console.log(`[Cron] Skipped ${userAddress}: No session key`);
    return;
  }

  // 2. Evaluate rebalancing decision FIRST — before fetching/decrypting authorization (P2-1 fix)
  const decision = await yieldDecisionEngine.evaluateRebalancing(
    userAddress,
    targetedVaults,
    prefetchedVaults
  );

  // 3. Check if should rebalance — skip BEFORE expensive decrypt
  if (!decision.shouldRebalance) {
    summary.skipped++;
    summary.details.push({
      address: userAddress,
      action: "skipped",
      reason: decision.reason,
      apyImprovement: decision.apyImprovement,
    });
    console.log(`[Cron] Skipped ${userAddress}: ${decision.reason}`);
    return;
  }

  // 4. Only NOW fetch the full authorization_7702 blob (P0-2 fix: deferred fetch)
  const authRows = await sql`
    SELECT authorization_7702
    FROM users
    WHERE id = ${userId}
  `;
  const encryptedAuthorization = authRows[0]?.authorization_7702;
  if (!encryptedAuthorization) {
    summary.errors++;
    summary.details.push({
      address: userAddress,
      action: "error",
      reason: "Could not fetch authorization for rebalancing user",
    });
    return;
  }

  // 5. Decrypt authorization AFTER decision check (P2-1 fix: no wasted CPU)
  const authorization = decryptAuthorization(encryptedAuthorization);

  // Check if session key expired
  if (!isSessionValid(authorization.expiry)) {
    summary.skipped++;
    summary.details.push({
      address: userAddress,
      action: "skipped",
      reason: "Session key expired",
    });
    console.log(`[Cron] Skipped ${userAddress}: Session expired`);
    return;
  }

  // Check if session key has been explicitly revoked
  if (await isSessionRevoked(authorization.sessionKeyAddress)) {
    summary.skipped++;
    summary.details.push({
      address: userAddress,
      action: "skipped",
      reason: "Session key has been revoked",
    });
    console.log(`[Cron] Skipped ${userAddress}: Session revoked`);
    return;
  }

  // 6. Check simulation mode
  const simulationMode = process.env.AGENT_SIMULATION_MODE === "true";

  if (simulationMode) {
    console.log("[SIMULATION] Would execute rebalance:", {
      user: userAddress,
      from: decision.currentVault?.name,
      to: decision.targetVault?.name,
      apyImprovement: `${(decision.apyImprovement * 100).toFixed(2)}%`,
      estimatedGain: `$${decision.estimatedAnnualGain.toFixed(2)}/year`,
    });
    await logSimulatedAction(userId, userAddress, decision);
    summary.skipped++;
    summary.details.push({
      address: userAddress,
      action: "skipped",
      reason: "[SIMULATION] Rebalance simulated only",
      apyImprovement: decision.apyImprovement,
    });
    return;
  }

  const opsUsed = await getUserOpCount(userAddress);
  if (opsUsed >= USEROP_DAILY_LIMIT - CRON_USEROP_RESERVE) {
    summary.skipped++;
    summary.details.push({
      address: userAddress,
      action: "skipped",
      reason: `UserOp budget low (${opsUsed}/${USEROP_DAILY_LIMIT} used)`,
    });
    console.log(
      `[Cron] Skipping rebalance for ${userAddress}: budget low (${opsUsed}/${USEROP_DAILY_LIMIT} used)`
    );
    return;
  }

  // 7. Real execution via ZeroDev
  const result = await executeRebalanceTransaction(userId, userAddress, authorization, decision);

  if (result.success) {
    summary.rebalanced++;
    summary.details.push({
      address: userAddress,
      action: "rebalanced",
      reason: decision.reason,
      apyImprovement: decision.apyImprovement,
      taskId: result.taskId,
    });
    console.log(`[Cron] Rebalanced ${userAddress}: Task ${result.taskId}`);
    await incrementUserOpCount(userAddress);
  } else {
    summary.errors++;
    summary.details.push({
      address: userAddress,
      action: "error",
      reason: result.error || "Execution failed",
    });
    console.error(`[Cron] Failed ${userAddress}:`, result.error);
  }
}

// ---------------------------------------------------------------------------
// Rebalance transaction execution
// ---------------------------------------------------------------------------

async function executeRebalanceTransaction(
  userId: string,
  userAddress: `0x${string}`,
  authorization: DecryptedAuthorization,
  decision: RebalanceDecision
): Promise<{ success: boolean; taskId?: string; error?: string }> {
  try {
    if (!decision.currentVault || !decision.targetVault) {
      throw new Error("Invalid rebalance decision - missing vault data");
    }

    console.log(
      `[Rebalance] Executing: ${decision.currentVault.name} → ${decision.targetVault.name}`
    );
    console.log(
      `[Rebalance] APY: ${(decision.currentVault.apy * 100).toFixed(2)}% → ${(decision.targetVault.apy * 100).toFixed(2)}%`
    );

    const serializedAccount = authorization.serializedAccount;
    const sessionPrivateKey = authorization.sessionPrivateKey;
    const smartAccountAddress = (
      authorization.type === "zerodev-erc4337-session"
        ? authorization.smartWalletAddress
        : authorization.eoaAddress
    ) as `0x${string}`;

    if (!serializedAccount && !sessionPrivateKey) {
      throw new Error(
        "No serializedAccount or sessionPrivateKey in authorization. User must re-register."
      );
    }

    const rebalanceParams = {
      fromVault: decision.currentVault.address,
      toVault: decision.targetVault.address,
      shares: BigInt(decision.currentVault.shares),
      userAddress,
    };

    console.log(`[Rebalance] Executing for account: ${smartAccountAddress}`);
    console.log(`[Rebalance] Params:`, rebalanceParams);

    const approvedVaults = authorization.approvedVaults as `0x${string}`[] | undefined;
    const eip7702SignedAuth = authorization.eip7702SignedAuth;
    const executionResult = await executeRebalance(
      smartAccountAddress,
      rebalanceParams,
      sessionPrivateKey as `0x${string}`,
      approvedVaults,
      eip7702SignedAuth,
      serializedAccount
    );

    const taskId =
      executionResult.taskId || `zerodev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (executionResult.success) {
      await logRebalanceAction(userId, userAddress, decision, taskId, "success");
      return { success: true, taskId };
    } else {
      throw new Error(executionResult.error || "Execution failed");
    }
  } catch (error: any) {
    await logRebalanceAction(userId, userAddress, decision, undefined, "failed", error.message);
    return { success: false, error: error.message };
  }
}

// ---------------------------------------------------------------------------
// User reward claim processing
// ---------------------------------------------------------------------------

/**
 * Process Merkl reward claiming for a single user.
 * Threshold-gated ($2 USD) and rate-limited (once per 24h).
 */
async function processUserRewardClaim(
  user: Record<string, unknown>,
  summary: CronSummary,
  _targetedVaults?: string[] | null,
  _prefetchedVaults?: PrefetchedVaults
): Promise<void> {
  const userAddress = user.wallet_address as `0x${string}`;
  const userId = user.id as string;
  const sessionType = user.session_type as string;

  // 1. Validate session type
  const sessionProbe = AgentSession.fromRaw({ type: sessionType });
  if (!sessionProbe || !sessionProbe.isValidType()) {
    summary.skipped++;
    return;
  }

  // 2. Check 24h cooldown
  const recentClaims = await sql`
    SELECT created_at FROM agent_actions
    WHERE user_id = ${userId}
      AND action_type = 'merkl_claim'
      AND status = 'success'
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (recentClaims.length > 0) {
    const lastClaimTime = new Date(recentClaims[0].created_at as string).getTime();
    if (Date.now() - lastClaimTime < MERKL_CLAIM_COOLDOWN_MS) {
      summary.skipped++;
      return;
    }
  }

  // 3. Fetch + decrypt authorization
  const authRows = await sql`
    SELECT authorization_7702 FROM users WHERE id = ${userId}
  `;
  const encryptedAuthorization = authRows[0]?.authorization_7702;
  if (!encryptedAuthorization) {
    summary.skipped++;
    return;
  }

  const authorization = decryptAuthorization(encryptedAuthorization);

  if (!isSessionValid(authorization.expiry)) {
    summary.skipped++;
    return;
  }

  if (await isSessionRevoked(authorization.sessionKeyAddress)) {
    summary.skipped++;
    return;
  }

  // 4. Verify Merkl Distributor is in approvedVaults
  const approvedVaults = authorization.approvedVaults || [];
  const approval = verifyVaultApproval(approvedVaults, MERKL_DISTRIBUTOR_ADDRESS_BASE, "merkl");
  if (!approval.approved) {
    summary.skipped++;
    return;
  }

  if (!authorization.serializedAccount) {
    summary.skipped++;
    return;
  }

  // 5. Check UserOp budget
  const opsUsed = await getUserOpCount(userAddress);
  if (opsUsed >= USEROP_DAILY_LIMIT - CRON_USEROP_RESERVE) {
    summary.skipped++;
    return;
  }

  // 6. Resolve smartAccountAddress
  const smartAccountAddress = (
    authorization.type === "zerodev-erc4337-session"
      ? authorization.smartWalletAddress
      : authorization.eoaAddress
  ) as `0x${string}`;

  // 7. Fetch claimable rewards
  let rewards;
  try {
    rewards = await fetchClaimableRewards(smartAccountAddress, true);
  } catch (error: any) {
    console.warn(`[Cron] Merkl rewards fetch failed for ${userAddress}:`, error.message);
    summary.skipped++;
    return;
  }

  if (!rewards || !rewards.hasClaimable) {
    summary.skipped++;
    return;
  }

  // 8. Check USD threshold
  const claimableTokens = parseFloat(rewards.totalClaimableFormatted);
  const estimatedUsd = claimableTokens;
  if (estimatedUsd < MERKL_CLAIM_THRESHOLD_USD) {
    summary.skipped++;
    return;
  }

  // 9. Check simulation mode
  if (process.env.AGENT_SIMULATION_MODE === "true") {
    console.log(
      `[SIMULATION] Would claim ${rewards.totalClaimableFormatted} $YO for ${userAddress}`
    );
    await logClaimAction(
      userId,
      userAddress,
      rewards.totalClaimableFormatted,
      "simulation",
      "success"
    );
    summary.skipped++;
    return;
  }

  // 10. Execute claim
  const result = await executeYoRewardsClaim({
    smartAccountAddress,
    serializedAccount: authorization.serializedAccount,
    userAddress: smartAccountAddress,
    chainRewards: rewards.rawChainRewards,
  });

  if (result.success) {
    summary.claimed++;
    summary.details.push({
      address: userAddress,
      action: "claimed",
      reason: `Claimed ${rewards.totalClaimableFormatted} $YO (~$${estimatedUsd.toFixed(2)})`,
    });
    await logClaimAction(
      userId,
      userAddress,
      rewards.totalClaimableFormatted,
      result.txHash,
      "success"
    );
    await invalidateYoRewards(smartAccountAddress, CHAIN_CONFIG.chainId);
    await incrementUserOpCount(userAddress);
    console.log(`[Cron] Claimed ${rewards.totalClaimableFormatted} $YO for ${userAddress}`);
  } else {
    summary.errors++;
    summary.details.push({
      address: userAddress,
      action: "error",
      reason: result.error || "Merkl claim failed",
    });
    await logClaimAction(
      userId,
      userAddress,
      rewards.totalClaimableFormatted,
      undefined,
      "failed",
      result.error
    );
    console.error(`[Cron] Merkl claim failed for ${userAddress}:`, result.error);
  }
}

// ---------------------------------------------------------------------------
// Action logging
// ---------------------------------------------------------------------------

async function logRebalanceAction(
  userId: string,
  userAddress: string,
  decision: RebalanceDecision,
  taskId: string | undefined,
  status: "pending" | "success" | "failed",
  errorMessage?: string
): Promise<void> {
  const metadata = {
    fromVault: decision.currentVault?.address,
    toVault: decision.targetVault?.address,
    fromApy: decision.currentVault?.apy || 0,
    toApy: decision.targetVault?.apy || 0,
    apyImprovement: decision.apyImprovement,
    estimatedAnnualGain: decision.estimatedAnnualGain,
    breakEvenDays: decision.breakEvenDays,
    reason: decision.reason,
    shares: decision.currentVault?.shares,
    assets: decision.currentVault?.assets,
  };

  await sql`
    INSERT INTO agent_actions (
      user_id,
      action_type,
      status,
      from_protocol,
      to_protocol,
      amount_usdc,
      tx_hash,
      error_message,
      metadata
    ) VALUES (
      ${userId},
      'rebalance',
      ${status},
      ${decision.currentVault?.name || null},
      ${decision.targetVault?.name || null},
      ${decision.currentVault?.assets ? formatUnits(BigInt(decision.currentVault.assets), 6) : null},
      ${taskId || null},
      ${errorMessage || null},
      ${JSON.stringify(metadata)}::jsonb
    )
  `;
}

async function logSimulatedAction(
  userId: string,
  userAddress: string,
  decision: RebalanceDecision
): Promise<void> {
  await logRebalanceAction(
    userId,
    userAddress,
    decision,
    "simulation_" + Date.now(),
    "success",
    undefined
  );
}

export async function logClaimAction(
  userId: string,
  userAddress: string,
  claimableAmount: string,
  txHash: string | undefined,
  status: "success" | "failed",
  errorMessage?: string
): Promise<void> {
  await sql`
    INSERT INTO agent_actions (
      user_id,
      action_type,
      status,
      from_protocol,
      to_protocol,
      amount_usdc,
      tx_hash,
      error_message,
      metadata
    ) VALUES (
      ${userId},
      'merkl_claim',
      ${status},
      'merkl',
      'yo',
      ${claimableAmount},
      ${txHash || null},
      ${errorMessage || null},
      ${JSON.stringify({ claimableAmount, userAddress })}::jsonb
    )
  `;
}

// ---------------------------------------------------------------------------
// Main orchestration entry point
// ---------------------------------------------------------------------------

export interface CronRunResult {
  summary: CronSummary;
  duration: number;
}

/**
 * Run the full cron orchestration cycle:
 *   Phase 1: rebalance all active users
 *   Phase 2: auto-claim Merkl rewards for all active users
 *
 * Returns the merged summary for the route to format.
 */
export async function runCronCycle(targetedVaults: string[] | null): Promise<CronRunResult> {
  const startTime = Date.now();
  const summary = createEmptySummary();

  // Pre-flight safety check: verify USDC price feed is healthy
  const { isRebalanceSafe } = await import("@/lib/oracles/chainlink");
  const safetyCheck = await isRebalanceSafe();
  if (!safetyCheck.safe) {
    console.error("[Cron] Safety check FAILED:", safetyCheck.reason);
    throw new CronSafetyError(`Rebalancing blocked by safety check: ${safetyCheck.reason}`);
  }
  console.log("[Cron] Safety check passed: USDC price feed healthy");

  if (targetedVaults) {
    console.log(`[Cron] Targeted rebalance mode: ${targetedVaults.length} vaults affected`);
  }

  // Query active users — lightweight query without authorization_7702 blob
  const activeUsers = await sql`
    SELECT
      u.id,
      u.wallet_address,
      COALESCE(s.min_apy_gain_threshold, '0.005') as min_apy_gain_threshold,
      u.authorization_7702->>'type' as session_type
    FROM users u
    LEFT JOIN user_strategies s ON u.id = s.user_id
    WHERE u.auto_optimize_enabled = true
      AND u.authorization_7702 IS NOT NULL
      AND u.agent_registered = true
  `;

  console.log(`[Cron] Found ${activeUsers.length} active users to process`);

  // Pre-fetch vault lists ONCE before the user loop (P0 fix)
  const [prefetchedMorphoVaults, prefetchedYoVaults] = await Promise.all([
    yieldDecisionEngine.getAvailableMorphoVaults(),
    yieldDecisionEngine.getAvailableYoVaults(),
  ]);
  const prefetchedVaults = { morpho: prefetchedMorphoVaults, yo: prefetchedYoVaults };
  console.log(
    `[Cron] Pre-fetched ${prefetchedMorphoVaults.length} Morpho + ${prefetchedYoVaults.length} YO vaults`
  );

  // Phase 1: Rebalance
  await processUsersInParallel(
    activeUsers,
    processUserRebalance,
    summary,
    targetedVaults,
    prefetchedVaults
  );

  // Phase 2: Auto-claim Merkl rewards
  console.log("[Cron] Starting Merkl reward auto-claim phase...");
  const claimSummary = createEmptySummary();
  await processUsersInParallel(activeUsers, processUserRewardClaim, claimSummary);
  summary.claimed = claimSummary.claimed;
  summary.details.push(
    ...claimSummary.details.filter((d) => d.action === "claimed" || d.action === "error")
  );
  console.log(
    `[Cron] Merkl claim phase: ${claimSummary.claimed} claimed, ${claimSummary.skipped} skipped`
  );

  const duration = Date.now() - startTime;
  console.log(`[Cron] Cycle complete in ${duration}ms:`, {
    processed: summary.processed,
    rebalanced: summary.rebalanced,
    claimed: summary.claimed,
    skipped: summary.skipped,
    errors: summary.errors,
    details: summary.details,
  });

  return { summary, duration };
}

/**
 * Typed error for safety check failures (maps to 503 in the route).
 */
export class CronSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CronSafetyError";
  }
}
