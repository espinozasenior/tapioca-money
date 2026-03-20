import { NextRequest, NextResponse } from "next/server";
import { verifySecret } from "@/lib/security/verify-secret";
import {
  runCronCycle,
  CronSafetyError,
  type CronSummary,
} from "@/lib/agent/cron-orchestration-service";

/**
 * POST /api/agent/cron
 * Autonomous rebalancing cron job using ZeroDev Kernel smart accounts and session keys
 *
 * Security: Verifies CRON_SECRET from request headers
 * Process:
 * 1. Query all users with auto_optimize_enabled=true AND valid session keys
 * 2. For each user, evaluate rebalancing via YieldDecisionEngine (Morpho API)
 * 3. If profitable, execute via ZeroDev with session key permissions
 * 4. Auto-claim Merkl rewards (threshold-gated, rate-limited)
 * 5. Log all actions to agent_actions table
 */
export async function POST(request: NextRequest) {
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

  try {
    // 2. Parse targeted vaults (triggered by APY monitor)
    const url = new URL(request.url);
    const targetedVaultsParam = url.searchParams.get("targetedVaults");
    const targetedVaults = targetedVaultsParam ? targetedVaultsParam.split(",") : null;

    // 3. Run full cron cycle (rebalance + claim phases)
    const { summary, duration } = await runCronCycle(targetedVaults);

    // 4. Return only aggregate counts in the HTTP response — no wallet addresses
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
    if (error instanceof CronSafetyError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          summary: emptySummary(),
        },
        { status: 503 }
      );
    }

    console.error("[Cron] Fatal error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Cron execution failed",
        summary: emptySummary(),
      },
      { status: 500 }
    );
  }
}

function emptySummary(): Omit<CronSummary, "details"> {
  return { processed: 0, rebalanced: 0, claimed: 0, skipped: 0, errors: 0 };
}
