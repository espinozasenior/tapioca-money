/**
 * VaultOperationService
 *
 * Extracted from app/api/vault/deposit/route.ts and app/api/vault/redeem/route.ts
 * (Phase 4, DDD refactoring).
 *
 * Handles:
 *   - Deposit/redeem delegation to VaultExecutor (Phase 3)
 *   - Action logging to agent_actions table (Phase 6 coverage)
 *   - Error classification for user-facing messages
 *
 * Routes delegate here after: auth -> parse -> validate.
 */

import { sql } from "@/lib/db";
import {
  type ExecutorContext,
  type DepositResult,
  type RedeemResult,
  getExecutor,
  DepositError,
} from "@/lib/agent/vault-executor";
import { incrementUserOpCount } from "@/lib/redis/rate-limiter";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DepositRequest {
  /** Authenticated wallet address (for rate limiting / logging) */
  userWalletAddress: string;
  /** Vault to deposit into */
  vaultAddress: `0x${string}`;
  /** Human-readable amount, e.g. "10.50" */
  amount: string;
  /** Protocol: "morpho" | "yo" */
  protocol: string;
  /** Executor context from resolved registration */
  ctx: ExecutorContext;
}

export interface RedeemRequest {
  /** Authenticated wallet address */
  userWalletAddress: string;
  /** Vault to redeem from */
  vaultAddress: `0x${string}`;
  /** Shares to redeem (bigint as string for transport) */
  shares: bigint;
  /** Protocol: "morpho" | "yo" */
  protocol: string;
  /** Executor context from resolved registration */
  ctx: ExecutorContext;
}

export interface DepositResponse {
  success: true;
  txHash?: string;
  userOpHash?: string;
}

export interface RedeemResponse {
  success: true;
  txHash?: string;
  userOpHash?: string;
  redeemStatus?: "instant" | "queued";
}

// ---------------------------------------------------------------------------
// Deposit
// ---------------------------------------------------------------------------

/**
 * Execute a vault deposit and log the action.
 *
 * Throws `DepositError` for protocol-level validation failures (400).
 * Throws `VaultOperationError` for execution failures (500).
 */
export async function deposit(req: DepositRequest): Promise<DepositResponse> {
  const { userWalletAddress, vaultAddress, amount, protocol, ctx } = req;

  console.log("[Vault Deposit] Calling deposit with:", {
    smartAccountAddress: ctx.smartAccountAddress,
    vaultAddress,
    amount,
    protocol,
    hasSerialized: !!ctx.serializedAccount,
    approvedVaultsCount: ctx.approvedVaults.length,
  });

  const depositStartTime = Date.now();

  const executor = getExecutor(protocol);
  let result: DepositResult;
  try {
    result = await executor.deposit(ctx, { vaultAddress, amount });
  } catch (err) {
    if (err instanceof DepositError) {
      await logDepositAction(
        userWalletAddress,
        vaultAddress,
        amount,
        protocol,
        undefined,
        "failed",
        err.message
      );
      throw err;
    }
    throw err;
  }

  const depositDuration = Date.now() - depositStartTime;

  if (!result.success) {
    console.error("[Vault Deposit] Execution failed after", depositDuration, "ms:", result.error);
    await logDepositAction(
      userWalletAddress,
      vaultAddress,
      amount,
      protocol,
      undefined,
      "failed",
      result.error
    );
    throw new VaultOperationError(result.error || "Vault deposit failed");
  }

  console.log("[Vault Deposit] Success after", depositDuration, "ms:", result.txHash);

  // Log successful deposit
  await logDepositAction(
    userWalletAddress,
    vaultAddress,
    amount,
    protocol,
    result.txHash,
    "success"
  );

  return {
    success: true,
    txHash: result.txHash,
    userOpHash: result.userOpHash,
  };
}

// ---------------------------------------------------------------------------
// Redeem
// ---------------------------------------------------------------------------

/**
 * Execute a vault redeem, log the action, and increment rate limit counter.
 *
 * Throws `VaultOperationError` with a user-friendly message on failure.
 */
export async function redeem(req: RedeemRequest): Promise<RedeemResponse> {
  const { userWalletAddress, vaultAddress, shares, protocol, ctx } = req;

  console.log("[Vault Redeem] Processing redeem request", {
    wallet: userWalletAddress,
    vault: vaultAddress,
    shares: shares.toString(),
  });

  const executor = getExecutor(protocol);
  const result = await executor.redeem(ctx, {
    vaultAddress,
    shares,
    receiver: ctx.smartAccountAddress,
  });

  if (!result.success) {
    const userMessage = classifyRedeemError(result.error);
    console.error("[Vault Redeem] Execution failed:", result.error);
    await logRedeemAction(
      userWalletAddress,
      vaultAddress,
      shares.toString(),
      protocol,
      undefined,
      "failed",
      result.error
    );
    throw new VaultOperationError(userMessage);
  }

  console.log("[Vault Redeem] Success:", result.txHash);

  // Log successful redeem and increment rate limit
  await logRedeemAction(
    userWalletAddress,
    vaultAddress,
    shares.toString(),
    protocol,
    result.txHash,
    "success"
  );
  await incrementUserOpCount(userWalletAddress);

  return {
    success: true,
    txHash: result.txHash,
    userOpHash: result.userOpHash,
    redeemStatus: result.redeemStatus,
  };
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

/**
 * Classify redeem errors into user-friendly messages.
 * Preserves all existing error detection (0xace2a47e, AA23, rate limit).
 */
function classifyRedeemError(error: string | undefined): string {
  if (!error) return "Vault redeem failed";

  if (error.includes("0xace2a47e")) {
    return (
      "This vault rejected the redeem (error 0xace2a47e). " +
      "The vault may restrict access to agent-operated accounts. " +
      "Please redeem directly from your wallet."
    );
  }

  const isRateLimit = error.includes("operation limit") || error.includes("0x3e4983f6");
  if (isRateLimit) {
    return (
      "Agent daily operation limit reached. " +
      "Please re-register your agent to reset the limit, or try again tomorrow."
    );
  }

  const isValidationFailure = error.includes("AA23") || error.includes("validateUserOp");
  if (isValidationFailure) {
    return "Session key validation failed. Please re-register your agent.";
  }

  return error;
}

export class VaultOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultOperationError";
  }
}

// ---------------------------------------------------------------------------
// Action logging (Phase 6: deposit/redeem logging to agent_actions)
// ---------------------------------------------------------------------------

async function logDepositAction(
  walletAddress: string,
  vaultAddress: string,
  amount: string,
  protocol: string,
  txHash: string | undefined,
  status: "success" | "failed",
  errorMessage?: string
): Promise<void> {
  try {
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
        (SELECT id FROM users WHERE wallet_address = ${walletAddress.toLowerCase()} LIMIT 1),
        'deposit',
        ${status},
        'wallet',
        ${protocol},
        ${amount},
        ${txHash || null},
        ${errorMessage || null},
        ${JSON.stringify({ vaultAddress, amount, protocol, walletAddress })}::jsonb
      )
    `;
  } catch (err) {
    // Logging failures should not break the deposit flow
    console.error("[VaultOperationService] Failed to log deposit action:", err);
  }
}

async function logRedeemAction(
  walletAddress: string,
  vaultAddress: string,
  shares: string,
  protocol: string,
  txHash: string | undefined,
  status: "success" | "failed",
  errorMessage?: string
): Promise<void> {
  try {
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
        (SELECT id FROM users WHERE wallet_address = ${walletAddress.toLowerCase()} LIMIT 1),
        'redeem',
        ${status},
        ${protocol},
        'wallet',
        ${shares},
        ${txHash || null},
        ${errorMessage || null},
        ${JSON.stringify({ vaultAddress, shares, protocol, walletAddress })}::jsonb
      )
    `;
  } catch (err) {
    // Logging failures should not break the redeem flow
    console.error("[VaultOperationService] Failed to log redeem action:", err);
  }
}
