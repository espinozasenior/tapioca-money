import { NextRequest, NextResponse } from "next/server";
import { neon } from '@neondatabase/serverless';
import { calculateTotalGains, formatApyPct, formatUsd } from "@/lib/yield-optimizer/apy-calculator";

const sql = neon(process.env.DATABASE_URL!);

type Period = 'day' | 'week' | 'month' | 'year' | 'all';

/**
 * GET /api/agent/gains?address=0x...&period=week
 * Calculates historical APY gains for a user across all rebalances
 */
export async function GET(request: NextRequest) {
  try {
    const address = request.nextUrl.searchParams.get("address");
    const period = (request.nextUrl.searchParams.get("period") || 'all') as Period;

    if (!address) {
      return NextResponse.json({ error: "Missing address parameter" }, { status: 400 });
    }

    // 1. Get user ID
    const users = await sql`
      SELECT id FROM users WHERE wallet_address = ${address}
    `;

    if (users.length === 0) {
      return NextResponse.json({
        totalGain: 0,
        averageApyImprovement: 0,
        rebalanceCount: 0,
        periodStart: null,
        periodEnd: null,
        breakdown: [],
      });
    }

    const userId = users[0].id;

    // 2. Calculate date range based on period
    const now = new Date();
    let periodStart: Date;

    switch (period) {
      case 'day':
        periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        periodStart = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
      default:
        periodStart = new Date(0); // Beginning of time
        break;
    }

    // 3. Query successful rebalances in period
    const rebalances = await sql`
      SELECT
        action_type,
        status,
        from_protocol,
        to_protocol,
        amount_usdc,
        metadata,
        created_at
      FROM agent_actions
      WHERE user_id = ${userId}
        AND action_type = 'rebalance'
        AND status = 'success'
        AND created_at >= ${periodStart.toISOString()}
      ORDER BY created_at DESC
    `;

    // 4. Parse metadata and calculate gains
    const breakdown = rebalances.map((action: any) => {
      const metadata = action.metadata || {};
      const amount = parseFloat(action.amount_usdc || '0');
      const fromApy = metadata.fromApy || 0;
      const toApy = metadata.toApy || 0;
      const apyImprovement = metadata.apyImprovement || (toApy - fromApy);
      const estimatedGain = metadata.estimatedYearlyGain || (amount * apyImprovement);

      return {
        date: action.created_at,
        fromProtocol: action.from_protocol,
        toProtocol: action.to_protocol,
        amount,
        fromApy,
        toApy,
        apyImprovement,
        estimatedGain,
      };
    });

    // 5. Calculate totals
    const rebalanceData = breakdown.map(b => ({
      amount: b.amount,
      fromApy: b.fromApy,
      toApy: b.toApy,
      timestamp: new Date(b.date).getTime(),
    }));

    const totals = calculateTotalGains(rebalanceData);

    return NextResponse.json({
      totalGain: totals.totalYearlyGain,
      totalGainFormatted: formatUsd(totals.totalYearlyGain),
      averageApyImprovement: totals.averageApyImprovement,
      averageApyImprovementFormatted: formatApyPct(totals.averageApyImprovement),
      rebalanceCount: rebalances.length,
      periodStart: periodStart.toISOString(),
      periodEnd: now.toISOString(),
      breakdown,
      summary: {
        totalYearlyGain: totals.totalYearlyGain,
        totalMonthlyGain: totals.totalMonthlyGain,
        totalCompoundedGain: totals.totalCompoundedGain,
      },
    });

  } catch (error: any) {
    console.error("[Agent Gains] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to calculate gains" },
      { status: 500 }
    );
  }
}
