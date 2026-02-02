import { NextRequest, NextResponse } from "next/server";
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

/**
 * GET /api/agent/activity?address=0x...&limit=50&offset=0
 * Returns agent activity log with stats for a user
 */
export async function GET(request: NextRequest) {
  try {
    const address = request.nextUrl.searchParams.get("address");
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "50");
    const offset = parseInt(request.nextUrl.searchParams.get("offset") || "0");

    if (!address) {
      return NextResponse.json({ error: "Missing address parameter" }, { status: 400 });
    }

    // Validate limits
    if (limit < 1 || limit > 100) {
      return NextResponse.json({ error: "Limit must be between 1 and 100" }, { status: 400 });
    }

    // 1. Get user ID
    const users = await sql`
      SELECT id FROM users WHERE wallet_address = ${address}
    `;

    if (users.length === 0) {
      return NextResponse.json({
        activities: [],
        total: 0,
        stats: {
          totalRebalances: 0,
          successfulRebalances: 0,
          failedRebalances: 0,
          totalSaved: 0,
        },
      });
    }

    const userId = users[0].id;

    // 2. Get paginated activities
    const activities = await sql`
      SELECT
        id,
        action_type,
        status,
        from_protocol,
        to_protocol,
        amount_usdc,
        tx_hash,
        error_message,
        metadata,
        created_at
      FROM agent_actions
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    // 3. Get total count
    const countResult = await sql`
      SELECT COUNT(*) as total
      FROM agent_actions
      WHERE user_id = ${userId}
    `;
    const total = parseInt(countResult[0].total);

    // 4. Calculate statistics
    const statsResult = await sql`
      SELECT
        COUNT(*) FILTER (WHERE action_type = 'rebalance') as total_rebalances,
        COUNT(*) FILTER (WHERE action_type = 'rebalance' AND status = 'success') as successful_rebalances,
        COUNT(*) FILTER (WHERE action_type = 'rebalance' AND status = 'failed') as failed_rebalances,
        SUM(
          CASE
            WHEN action_type = 'rebalance' AND status = 'success' AND metadata IS NOT NULL
            THEN CAST((metadata->>'estimatedYearlyGain')::numeric AS DECIMAL)
            ELSE 0
          END
        ) as total_saved
      FROM agent_actions
      WHERE user_id = ${userId}
    `;

    const stats = {
      totalRebalances: parseInt(statsResult[0].total_rebalances || '0'),
      successfulRebalances: parseInt(statsResult[0].successful_rebalances || '0'),
      failedRebalances: parseInt(statsResult[0].failed_rebalances || '0'),
      totalSaved: parseFloat(statsResult[0].total_saved || '0'),
    };

    // 5. Format activities for response
    const formattedActivities = activities.map((activity: any) => ({
      id: activity.id,
      actionType: activity.action_type,
      status: activity.status,
      fromProtocol: activity.from_protocol,
      toProtocol: activity.to_protocol,
      amountUsdc: activity.amount_usdc,
      txHash: activity.tx_hash,
      errorMessage: activity.error_message,
      metadata: activity.metadata,
      createdAt: activity.created_at,
    }));

    return NextResponse.json({
      activities: formattedActivities,
      total,
      limit,
      offset,
      stats,
    });

  } catch (error: any) {
    console.error("[Agent Activity] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch activity" },
      { status: 500 }
    );
  }
}
