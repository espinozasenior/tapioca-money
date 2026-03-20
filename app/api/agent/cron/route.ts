import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { yieldDecisionEngine } from "@/lib/agent/decision-engine";
import { executeRebalance } from "@/lib/agent/rebalance-executor";
import { formatUnits } from "viem";
import { decryptAuthorization } from "@/lib/security/session-encryption";
import { isSessionRevoked } from "@/lib/security/session-revocation";
import { verifySecret } from "@/lib/security/verify-secret";
import { AgentSession } from "@/lib/agent/agent-session";
import { acquireUserLock, releaseUserLock } from "@/lib/redis/distributed-lock";
import { getUserOpCount, incrementUserOpCount } from "@/lib/redis/rate-limiter";
import { fetchClaimableRewards } from "@/lib/yo/rewards-client";
import { executeYoRewardsClaim } from "@/lib/zerodev/yo-rewards-executor";
import { invalidateYoRewards } from "@/lib/redis/yo-cache";
import { verifyVaultApproval } from "@/lib/agent/resolve-registration";
import { MERKL_DISTRIBUTOR_ADDRESS_BASE } from "@/lib/yo/constants";
import { CHAIN_CONFIG } from "@/lib/config";

/**
 * Strip URLs, file paths, and connection strings from error messages
 * to prevent information leakage in cron summaries.
 */
function sanitizeErrorMessage(message: string): string {
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

// Parallel processing configuration
const BATCH_SIZE = parseInt(process.env.CRON_BATCH_SIZE || "50", 10);
const CONCURRENCY = parseInt(process.env.CRON_CONCURRENCY || "10", 10);
const USEROP_DAILY_LIMIT = 90;
const CRON_USEROP_RESERVE = 3;

/**
 * Process users in parallel batches
 * This reduces processing time from 83 min to ~8 min for 10k users
 */
async function processUsersInParallel(
  users: any[],
  processFn: (
    user: any,
    summary: CronSummary,
    targetedVaults?: string[] | null,
    prefetchedVaults?: { morpho: any[]; yo: any[] }
  ) => Promise<void>,
  summary: CronSummary,
  targetedVaults?: string[] | null,
  prefetchedVaults?: { morpho: any[]; yo: any[] }
): Promise<void> {
  console.log(
    `[Cron] Processing ${users.length} users in batches of ${BATCH_SIZE} with concurrency ${CONCURRENCY}`
  );

  // Process in batches
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(users.length / BATCH_SIZE);

    console.log(`[Cron] Processing batch ${batchNum}/${totalBatches} (${batch.length} users)`);

    // Process batch with limited concurrency
    const chunks: any[][] = [];
    for (let j = 0; j < batch.length; j += CONCURRENCY) {
      chunks.push(batch.slice(j, j + CONCURRENCY));
    }

    for (const chunk of chunks) {
      // Process chunk in parallel with distributed locking
      await Promise.all(
        chunk.map(async (user) => {
          // Acquire per-user lock to prevent concurrent rebalances
          const lock = await acquireUserLock(user.wallet_address);
          if (!lock.acquired) {
            summary.skipped++;
            summary.details.push({
              address: user.wallet_address,
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
              address: user.wallet_address,
              action: "error",
              reason: sanitizeErrorMessage(error.message || "Unknown error during processing"),
            });
            console.error(`[Cron] Error processing user ${user.wallet_address}:`, error.message);
          } finally {
            await releaseUserLock(user.wallet_address, lock.lockId!);
          }
        })
      );
    }
  }
}

// Helper function to check if session key is still valid
function isSessionValid(expiry: number): boolean {
  return expiry > Math.floor(Date.now() / 1000);
}

interface CronSummary {
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

/**
 * POST /api/agent/cron
 * Autonomous rebalancing cron job using ZeroDev Kernel smart accounts and session keys
 *
 * Security: Verifies CRON_SECRET from request headers
 * Process:
 * 1. Query all users with auto_optimize_enabled=true AND valid session keys
 * 2. For each user, evaluate rebalancing via YieldDecisionEngine (Morpho API)
 * 3. If profitable, execute via ZeroDev with session key permissions
 * 4. Log all actions to agent_actions table
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  // 1. Verify CRON_SECRET using timing-safe comparison
  const cronSecret =
    request.headers.get("x-cron-secret") ||
    request.headers.get("authorization")?.replace("Bearer ", "") ||
    null;

  if (!verifySecret(cronSecret, process.env.CRON_SECRET)) {
    console.error("[Cron] Unauthorized attempt - invalid secret");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[Cron] Starting autonomous rebalancing cycle (ZeroDev + Morpho API)...");

  const summary: CronSummary = {
    processed: 0,
    rebalanced: 0,
    claimed: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  try {
    // Pre-flight safety check: verify USDC price feed is healthy
    const { isRebalanceSafe } = await import("@/lib/oracles/chainlink");
    const safetyCheck = await isRebalanceSafe();
    if (!safetyCheck.safe) {
      console.error("[Cron] Safety check FAILED:", safetyCheck.reason);
      return NextResponse.json(
        {
          success: false,
          error: `Rebalancing blocked by safety check: ${safetyCheck.reason}`,
          summary,
        },
        { status: 503 }
      );
    }
    console.log("[Cron] Safety check passed: USDC price feed healthy");

    // Check for targeted rebalance mode (triggered by APY monitor)
    const url = new URL(request.url);
    const targetedVaultsParam = url.searchParams.get("targetedVaults");
    const targetedVaults = targetedVaultsParam ? targetedVaultsParam.split(",") : null;
    if (targetedVaults) {
      console.log(`[Cron] Targeted rebalance mode: ${targetedVaults.length} vaults affected`);
    }

    // 2. Query active users -- lightweight query without authorization_7702 blob (P0-2 fix)
    // The session type is extracted via SQL JSON operator to filter invalid sessions
    // without fetching the full 2-10KB authorization blob per user.
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

    // 2b. Pre-fetch vault lists ONCE before the user loop (P0 fix)
    // Eliminates ~2,000 redundant API/Redis round-trips per 1,000 users
    const [prefetchedMorphoVaults, prefetchedYoVaults] = await Promise.all([
      yieldDecisionEngine.getAvailableMorphoVaults(),
      yieldDecisionEngine.getAvailableYoVaults(),
    ]);
    const prefetchedVaults = { morpho: prefetchedMorphoVaults, yo: prefetchedYoVaults };
    console.log(
      `[Cron] Pre-fetched ${prefetchedMorphoVaults.length} Morpho + ${prefetchedYoVaults.length} YO vaults`
    );

    // 3. Process users in parallel batches (90% time reduction)
    // Old sequential: 83 min for 10k users
    // New parallel: ~8 min for 10k users
    await processUsersInParallel(
      activeUsers,
      processUserRebalance,
      summary,
      targetedVaults,
      prefetchedVaults
    );

    // Phase 2: Auto-claim Merkl rewards for active users
    console.log("[Cron] Starting Merkl reward auto-claim phase...");
    const claimSummary: CronSummary = {
      processed: 0,
      rebalanced: 0,
      claimed: 0,
      skipped: 0,
      errors: 0,
      details: [],
    };
    await processUsersInParallel(activeUsers, processUserRewardClaim, claimSummary);
    summary.claimed = claimSummary.claimed;
    summary.details.push(
      ...claimSummary.details.filter((d) => d.action === "claimed" || d.action === "error")
    );
    console.log(
      `[Cron] Merkl claim phase: ${claimSummary.claimed} claimed, ${claimSummary.skipped} skipped`
    );

    const duration = Date.now() - startTime;
    // Log full details server-side only (includes wallet addresses)
    console.log(`[Cron] Cycle complete in ${duration}ms:`, {
      processed: summary.processed,
      rebalanced: summary.rebalanced,
      claimed: summary.claimed,
      skipped: summary.skipped,
      errors: summary.errors,
      details: summary.details,
    });

    // Return only aggregate counts in the HTTP response — no wallet addresses
    return NextResponse.json({
      success: true,
      summary: {
        processed: summary.processed,
        rebalanced: summary.rebalanced,
        claimed: summary.claimed,
        skipped: summary.skipped,
        errors: summary.errors,
      },
      duration,
    });
  } catch (error: any) {
    console.error("[Cron] Fatal error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Cron execution failed",
        summary,
      },
      { status: 500 }
    );
  }
}

/**
 * Process rebalancing for a single user
 *
 * Optimized flow (P0-2 + P2-1):
 * 1. Check session type from lightweight SQL field (no authorization blob)
 * 2. Evaluate rebalancing decision FIRST (most users won't need it)
 * 3. Only fetch + decrypt authorization_7702 for users that WILL rebalance
 */
async function processUserRebalance(
  user: any,
  summary: CronSummary,
  targetedVaults?: string[] | null,
  prefetchedVaults?: { morpho: any[]; yo: any[] }
): Promise<void> {
  const userAddress = user.wallet_address as `0x${string}`;
  const userId = user.id;
  // session_type comes from lightweight SQL: authorization_7702->>'type'
  const sessionType = user.session_type;

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

  // 2. Evaluate rebalancing decision FIRST -- before fetching/decrypting authorization (P2-1 fix)
  // Uses singleton engine instead of new instance per user (P1-1 fix)
  // Pass pre-fetched vaults to avoid redundant API calls per user (P0 fix)
  const decision = await yieldDecisionEngine.evaluateRebalancing(
    userAddress,
    targetedVaults,
    prefetchedVaults
  );

  // 3. Check if should rebalance -- skip BEFORE expensive decrypt
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

  // 7. Real execution via ZeroDev (using session key - no agent wallet needed!)
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

/**
 * Execute a rebalance transaction via ZeroDev with session keys
 */
async function executeRebalanceTransaction(
  userId: string,
  userAddress: `0x${string}`,
  authorization: import("@/lib/zerodev/client-secure").DecryptedAuthorization,
  decision: any
): Promise<{ success: boolean; taskId?: string; error?: string }> {
  try {
    // Validate decision
    if (!decision.currentVault || !decision.targetVault) {
      throw new Error("Invalid rebalance decision - missing vault data");
    }

    console.log(
      `[Rebalance] Executing: ${decision.currentVault.name} → ${decision.targetVault.name}`
    );
    console.log(
      `[Rebalance] APY: ${(decision.currentVault.apy * 100).toFixed(2)}% → ${(decision.targetVault.apy * 100).toFixed(2)}%`
    );

    // 1. Get session data from stored authorization
    const serializedAccount = authorization.serializedAccount;
    const sessionPrivateKey = authorization.sessionPrivateKey;
    // EIP-7702: eoaAddress IS the smart account address (single address model)
    // ERC-4337: smartWalletAddress is the Privy Kernel smart wallet (separate address)
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

    // 2. Build rebalance parameters
    const rebalanceParams = {
      fromVault: decision.currentVault.address,
      toVault: decision.targetVault.address,
      shares: BigInt(decision.currentVault.shares),
      userAddress,
    };

    console.log(`[Rebalance] Executing for account: ${smartAccountAddress}`);
    console.log(`[Rebalance] Params:`, rebalanceParams);

    // 3. Execute via ZeroDev — prefer serialized account (new pattern)
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

    // 4. Log result to database
    if (executionResult.success) {
      await logRebalanceAction(userId, userAddress, decision, taskId, "success");

      return {
        success: true,
        taskId,
      };
    } else {
      throw new Error(executionResult.error || "Execution failed");
    }
  } catch (error: any) {
    // Log failure to database
    await logRebalanceAction(userId, userAddress, decision, undefined, "failed", error.message);

    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Log rebalance action to database
 */
async function logRebalanceAction(
  userId: string,
  userAddress: string,
  decision: any,
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

/**
 * Log simulated action (for testing)
 */
async function logSimulatedAction(
  userId: string,
  userAddress: string,
  decision: any
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

// Auto-claim threshold: rewards must exceed $2 USD value to justify claim
const MERKL_CLAIM_THRESHOLD_USD = parseFloat(process.env.MERKL_CLAIM_THRESHOLD_USD || "2");
// Cooldown: skip users who claimed within the last 24 hours
const MERKL_CLAIM_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Process Merkl reward claiming for a single user.
 * Threshold-gated ($2 USD) and rate-limited (once per 24h).
 */
async function processUserRewardClaim(user: any, summary: CronSummary): Promise<void> {
  const userAddress = user.wallet_address as `0x${string}`;
  const userId = user.id;
  const sessionType = user.session_type;

  // 1. Validate session type
  const sessionProbe = AgentSession.fromRaw({ type: sessionType });
  if (!sessionProbe || !sessionProbe.isValidType()) {
    summary.skipped++;
    return;
  }

  // 2. Check 24h cooldown — skip if claimed recently
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

  // 3. Fetch + decrypt authorization BEFORE rewards fetch
  //    (needed to resolve smartAccountAddress for ERC-4337 users)
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

  // 6. Resolve smartAccountAddress BEFORE fetching rewards
  //    ERC-4337: rewards accrue to smartWalletAddress (Privy Kernel smart wallet)
  //    EIP-7702: rewards accrue to eoaAddress (EOA = smart account)
  const smartAccountAddress = (
    authorization.type === "zerodev-erc4337-session"
      ? authorization.smartWalletAddress
      : authorization.eoaAddress
  ) as `0x${string}`;

  // 7. Fetch claimable rewards using the correct address
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

  // 8. Check USD threshold — skip if rewards < $2
  const claimableTokens = parseFloat(rewards.totalClaimableFormatted);
  const estimatedUsd = claimableTokens; // 1:1 conservative estimate until price feed exists
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

/**
 * Log Merkl claim action to agent_actions table
 */
async function logClaimAction(
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
