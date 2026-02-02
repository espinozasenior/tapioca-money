import { NextRequest, NextResponse } from "next/server";
import { neon } from '@neondatabase/serverless';
import { YieldDecisionEngine } from "@/lib/agent/decision-engine";
import { executeRebalance } from "@/lib/agent/rebalance-executor";
import { formatUnits } from "viem";
import { decryptAuthorization } from '@/lib/security/session-encryption';

const sql = neon(process.env.DATABASE_URL!);

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

  // 1. Verify CRON_SECRET
  const cronSecret = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace("Bearer ", "");

  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
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

    // 3. Process each user
    for (const user of activeUsers) {
      summary.processed++;

      try {
        await processUserRebalance(user, summary);
      } catch (error: any) {
        summary.errors++;
        summary.details.push({
          address: user.wallet_address,
          action: 'error',
          reason: error.message || 'Unknown error during processing',
        });
        console.error(`[Cron] Error processing user ${user.wallet_address}:`, error);
        // Continue processing other users
      }
    }

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
  summary: CronSummary
): Promise<void> {
  const userAddress = user.wallet_address as `0x${string}`;
  const userId = user.id;
  const encryptedAuthorization = user.authorization_7702;

  console.log(`[Cron] Processing ${userAddress}...`);

  // 1. Validate session key
  if (!encryptedAuthorization || encryptedAuthorization.type !== 'zerodev-session-key') {
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

  // 2. Evaluate rebalancing decision via Morpho API
  const decisionEngine = new YieldDecisionEngine();
  const decision = await decisionEngine.evaluateRebalancing(userAddress);

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

    // 1. Get session key from stored authorization
    const sessionPrivateKey = authorization.sessionPrivateKey;
    const smartAccountAddress = authorization.smartAccountAddress;

    if (!sessionPrivateKey) {
      throw new Error('Session private key not found in authorization');
    }

    // 2. Build rebalance parameters
    const rebalanceParams = {
      fromVault: decision.currentVault.address,
      toVault: decision.targetVault.address,
      shares: BigInt(decision.currentVault.shares),
      userAddress,
    };

    console.log(`[Rebalance] Executing with session key for account: ${smartAccountAddress}`);
    console.log(`[Rebalance] Params:`, rebalanceParams);

    // 3. Execute via ZeroDev using session key
    const executionResult = await executeRebalance(
      smartAccountAddress,
      rebalanceParams,
      sessionPrivateKey as `0x${string}`
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
