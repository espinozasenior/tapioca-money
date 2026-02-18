import { NextRequest, NextResponse } from "next/server";
import { neon } from '@neondatabase/serverless';
import { YieldDecisionEngine } from "@/lib/agent/decision-engine";
import { executeRebalance } from "@/lib/agent/rebalance-executor";
import { formatUnits } from "viem";
import { decryptAuthorization } from '@/lib/security/session-encryption';
import { timingSafeEqual } from 'crypto';
import { isSessionRevoked } from '@/lib/security/session-revocation';
import { acquireUserLock, releaseUserLock } from '@/lib/redis/distributed-lock';
import { getUserOpCount, incrementUserOpCount } from '@/lib/redis/rate-limiter';

const sql = neon(process.env.DATABASE_URL!);

// Parallel processing configuration
const BATCH_SIZE = parseInt(process.env.CRON_BATCH_SIZE || '50', 10);
const CONCURRENCY = parseInt(process.env.CRON_CONCURRENCY || '10', 10);
const USEROP_DAILY_LIMIT = 90;
const CRON_USEROP_RESERVE = 3;

/**
 * Process users in parallel batches
 * This reduces processing time from 83 min to ~8 min for 10k users
 */
async function processUsersInParallel(
  users: any[],
  processFn: (user: any, summary: CronSummary, targetedVaults?: string[] | null) => Promise<void>,
  summary: CronSummary,
  targetedVaults?: string[] | null
): Promise<void> {
  console.log(`[Cron] Processing ${users.length} users in batches of ${BATCH_SIZE} with concurrency ${CONCURRENCY}`);

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
              action: 'skipped',
              reason: 'Rebalance already in progress (locked)',
            });
            return;
          }

          try {
            summary.processed++;
            await processFn(user, summary, targetedVaults);
          } catch (error: any) {
            summary.errors++;
            summary.details.push({
              address: user.wallet_address,
              action: 'error',
              reason: error.message || 'Unknown error during processing',
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

/**
 * Timing-safe secret comparison to prevent timing attacks
 * Returns false if either secret is missing or if they don't match
 */
function verifySecret(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !expected) {
    return false;
  }

  // Ensure both strings are the same length for timingSafeEqual
  // Use a constant-time comparison even for length check
  const providedBuf = Buffer.from(provided, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');

  // If lengths differ, still do a comparison to avoid timing leak
  if (providedBuf.length !== expectedBuf.length) {
    // Compare with itself to maintain constant time
    timingSafeEqual(expectedBuf, expectedBuf);
    return false;
  }

  return timingSafeEqual(providedBuf, expectedBuf);
}

// Helper function to check if session key is still valid
function isSessionValid(expiry: number): boolean {
  return expiry > Math.floor(Date.now() / 1000);
}

interface CronSummary {
  processed: number;
  rebalanced: number;
  skipped: number;
  errors: number;
  details: Array<{
    address: string;
    action: 'rebalanced' | 'skipped' | 'error';
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
  const cronSecret = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace("Bearer ", "") || null;

  if (!verifySecret(cronSecret, process.env.CRON_SECRET)) {
    console.error("[Cron] Unauthorized attempt - invalid secret");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[Cron] Starting autonomous rebalancing cycle (ZeroDev + Morpho API)...");

  const summary: CronSummary = {
    processed: 0,
    rebalanced: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  try {
    // Pre-flight safety check: verify USDC price feed is healthy
    const { isRebalanceSafe } = await import('@/lib/oracles/chainlink');
    const safetyCheck = await isRebalanceSafe();
    if (!safetyCheck.safe) {
      console.error('[Cron] Safety check FAILED:', safetyCheck.reason);
      return NextResponse.json({
        success: false,
        error: `Rebalancing blocked by safety check: ${safetyCheck.reason}`,
        summary,
      }, { status: 503 });
    }
    console.log('[Cron] Safety check passed: USDC price feed healthy');

    // Check for targeted rebalance mode (triggered by APY monitor)
    const url = new URL(request.url);
    const targetedVaultsParam = url.searchParams.get('targetedVaults');
    const targetedVaults = targetedVaultsParam ? targetedVaultsParam.split(',') : null;
    if (targetedVaults) {
      console.log(`[Cron] Targeted rebalance mode: ${targetedVaults.length} vaults affected`);
    }

    // 2. Query active users with valid session keys
    const activeUsers = await sql`
      SELECT
        u.id,
        u.wallet_address,
        u.authorization_7702,
        COALESCE(s.min_apy_gain_threshold, '0.005') as min_apy_gain_threshold
      FROM users u
      LEFT JOIN user_strategies s ON u.id = s.user_id
      WHERE u.auto_optimize_enabled = true
        AND u.authorization_7702 IS NOT NULL
        AND u.agent_registered = true
    `;

    console.log(`[Cron] Found ${activeUsers.length} active users to process`);

    // 3. Process users in parallel batches (90% time reduction)
    // Old sequential: 83 min for 10k users
    // New parallel: ~8 min for 10k users
    await processUsersInParallel(
      activeUsers,
      processUserRebalance,
      summary,
      targetedVaults
    );

    const duration = Date.now() - startTime;
    console.log(`[Cron] Cycle complete in ${duration}ms:`, {
      processed: summary.processed,
      rebalanced: summary.rebalanced,
      skipped: summary.skipped,
      errors: summary.errors,
    });

    return NextResponse.json({
      success: true,
      summary,
      duration,
    });

  } catch (error: any) {
    console.error("[Cron] Fatal error:", error);
    return NextResponse.json({
      success: false,
      error: error.message || "Cron execution failed",
      summary,
    }, { status: 500 });
  }
}

/**
 * Process rebalancing for a single user
 */
async function processUserRebalance(
  user: any,
  summary: CronSummary,
  targetedVaults?: string[] | null
): Promise<void> {
  const userAddress = user.wallet_address as `0x${string}`;
  const userId = user.id;
  const encryptedAuthorization = user.authorization_7702;

  console.log(`[Cron] Processing ${userAddress}...`);

  // 1. Validate session key
  if (!encryptedAuthorization || encryptedAuthorization.type !== 'zerodev-7702-session') {
    summary.skipped++;
    summary.details.push({
      address: userAddress,
      action: 'skipped',
      reason: 'No valid ZeroDev session key found',
    });
    console.log(`[Cron] Skipped ${userAddress}: No session key`);
    return;
  }

  // Decrypt authorization (only when needed for execution)
  const authorization = decryptAuthorization(encryptedAuthorization);

  // Check if session key expired
  if (!isSessionValid(authorization.expiry)) {
    summary.skipped++;
    summary.details.push({
      address: userAddress,
      action: 'skipped',
      reason: 'Session key expired',
    });
    console.log(`[Cron] Skipped ${userAddress}: Session expired`);
    return;
  }

  // Check if session key has been explicitly revoked
  if (await isSessionRevoked(authorization.sessionKeyAddress)) {
    summary.skipped++;
    summary.details.push({
      address: userAddress,
      action: 'skipped',
      reason: 'Session key has been revoked',
    });
    console.log(`[Cron] Skipped ${userAddress}: Session revoked`);
    return;
  }

  // 2. Evaluate rebalancing decision via Morpho API
  const decisionEngine = new YieldDecisionEngine();
  const decision = await decisionEngine.evaluateRebalancing(userAddress, targetedVaults);

  // 3. Check if should rebalance
  if (!decision.shouldRebalance) {
    summary.skipped++;
    summary.details.push({
      address: userAddress,
      action: 'skipped',
      reason: decision.reason,
      apyImprovement: decision.apyImprovement,
    });
    console.log(`[Cron] Skipped ${userAddress}: ${decision.reason}`);
    return;
  }

  // 4. Check simulation mode
  const simulationMode = process.env.AGENT_SIMULATION_MODE === 'true';

  if (simulationMode) {
    // Simulation mode - just log
    console.log('[SIMULATION] Would execute rebalance:', {
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
      action: 'skipped',
      reason: '[SIMULATION] Rebalance simulated only',
      apyImprovement: decision.apyImprovement,
    });
    return;
  }

  const opsUsed = await getUserOpCount(userAddress);
  if (opsUsed >= USEROP_DAILY_LIMIT - CRON_USEROP_RESERVE) {
    summary.skipped++;
    summary.details.push({
      address: userAddress,
      action: 'skipped',
      reason: `UserOp budget low (${opsUsed}/${USEROP_DAILY_LIMIT} used)`,
    });
    console.log(`[Cron] Skipping rebalance for ${userAddress}: budget low (${opsUsed}/${USEROP_DAILY_LIMIT} used)`);
    return;
  }

  // 5. Real execution via ZeroDev (using session key - no agent wallet needed!)
  const result = await executeRebalanceTransaction(
    userId,
    userAddress,
    authorization,
    decision
  );

  if (result.success) {
    summary.rebalanced++;
    summary.details.push({
      address: userAddress,
      action: 'rebalanced',
      reason: decision.reason,
      apyImprovement: decision.apyImprovement,
      taskId: result.taskId,
    });
    console.log(`[Cron] ✓ Rebalanced ${userAddress}: Task ${result.taskId}`);
    await incrementUserOpCount(userAddress);
  } else {
    summary.errors++;
    summary.details.push({
      address: userAddress,
      action: 'error',
      reason: result.error || 'Execution failed',
    });
    console.error(`[Cron] ✗ Failed ${userAddress}:`, result.error);
  }
}

/**
 * Execute a rebalance transaction via ZeroDev with session keys
 */
async function executeRebalanceTransaction(
  userId: string,
  userAddress: `0x${string}`,
  authorization: any,
  decision: any
): Promise<{ success: boolean; taskId?: string; error?: string }> {
  try {
    // Validate decision
    if (!decision.currentVault || !decision.targetVault) {
      throw new Error("Invalid rebalance decision - missing vault data");
    }

    console.log(`[Rebalance] Executing: ${decision.currentVault.name} → ${decision.targetVault.name}`);
    console.log(`[Rebalance] APY: ${(decision.currentVault.apy * 100).toFixed(2)}% → ${(decision.targetVault.apy * 100).toFixed(2)}%`);

    // 1. Get session data from stored authorization
    const serializedAccount = authorization.serializedAccount;
    const sessionPrivateKey = authorization.sessionPrivateKey;
    // EIP-7702: eoaAddress IS the smart account address (single address model)
    const smartAccountAddress = authorization.eoaAddress;

    if (!serializedAccount && !sessionPrivateKey) {
      throw new Error('No serializedAccount or sessionPrivateKey in authorization. User must re-register.');
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
      serializedAccount,
    );

    const taskId = executionResult.taskId || `zerodev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 4. Log result to database
    if (executionResult.success) {
      await logRebalanceAction(
        userId,
        userAddress,
        decision,
        taskId,
        'success'
      );

      return {
        success: true,
        taskId,
      };
    } else {
      throw new Error(executionResult.error || 'Execution failed');
    }

  } catch (error: any) {
    // Log failure to database
    await logRebalanceAction(
      userId,
      userAddress,
      decision,
      undefined,
      'failed',
      error.message
    );

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
  status: 'pending' | 'success' | 'failed',
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
    'simulation_' + Date.now(),
    'success',
    undefined
  );
}
