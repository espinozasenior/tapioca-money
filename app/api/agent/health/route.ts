import { NextRequest, NextResponse } from "next/server";
import { neon } from '@neondatabase/serverless';
import { ErrorTracker } from "@/lib/monitoring/error-tracker";

const sql = neon(process.env.DATABASE_URL!);

type HealthStatus = 'healthy' | 'degraded' | 'down';
type ServiceStatus = 'up' | 'down';

/**
 * GET /api/agent/health
 * System health check endpoint for monitoring agent operations
 */
export async function GET(request: NextRequest) {
  const checks: {
    database: ServiceStatus;
    zerodev: ServiceStatus;
    morphoApi: ServiceStatus;
  } = {
    database: 'down',
    zerodev: 'down',
    morphoApi: 'down',
  };

  let overallStatus: HealthStatus = 'healthy';
  const startTime = Date.now();

  try {
    // 1. Check Database
    try {
      await sql`SELECT 1 as test`;
      checks.database = 'up';
    } catch (error) {
      console.error('[Health] Database check failed:', error);
      checks.database = 'down';
      overallStatus = 'down';
    }

    // 2. Check ZeroDev Bundler API
    try {
      const projectId = process.env.ZERODEV_PROJECT_ID;
      if (projectId) {
        // Simple bundler availability check
        const bundlerUrl = process.env.ZERODEV_BUNDLER_URL ||
          `https://rpc.zerodev.app/api/v3/${projectId}/chain/8453`;
        const response = await fetch(bundlerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_chainId',
            params: []
          }),
          signal: AbortSignal.timeout(5000), // 5 second timeout
        });
        checks.zerodev = response.ok ? 'up' : 'down';
        if (!response.ok) {
          overallStatus = overallStatus === 'down' ? 'down' : 'degraded';
        }
      } else {
        checks.zerodev = 'down';
        overallStatus = 'degraded';
      }
    } catch (error) {
      console.error('[Health] ZeroDev check failed:', error);
      checks.zerodev = 'down';
      overallStatus = overallStatus === 'down' ? 'down' : 'degraded';
    }

    // 3. Check Morpho API
    try {
      const response = await fetch('https://blue-api.morpho.org/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: '{ __typename }',
        }),
        signal: AbortSignal.timeout(5000),
      });
      checks.morphoApi = response.ok ? 'up' : 'down';
      if (!response.ok) {
        overallStatus = overallStatus === 'down' ? 'down' : 'degraded';
      }
    } catch (error) {
      console.error('[Health] Morpho API check failed:', error);
      checks.morphoApi = 'down';
      overallStatus = overallStatus === 'down' ? 'down' : 'degraded';
    }

    // 4. Get metrics (if database is up)
    let metrics = {
      activeUsers: 0,
      rebalancesLast24h: 0,
      successRate: 0,
      averageLatency: 0,
    };

    if (checks.database === 'up') {
      try {
        // Active users
        const activeUsersResult = await sql`
          SELECT COUNT(*) as count
          FROM users
          WHERE auto_optimize_enabled = true
            AND authorization_7702 IS NOT NULL
        `;
        metrics.activeUsers = parseInt(activeUsersResult[0].count);

        // Rebalances in last 24 hours
        const rebalancesResult = await sql`
          SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'success') as successful
          FROM agent_actions
          WHERE action_type = 'rebalance'
            AND created_at >= NOW() - INTERVAL '24 hours'
        `;

        const total = parseInt(rebalancesResult[0].total || '0');
        const successful = parseInt(rebalancesResult[0].successful || '0');

        metrics.rebalancesLast24h = total;
        metrics.successRate = total > 0 ? (successful / total) * 100 : 100;

        // Last cron run time
        const lastCronResult = await sql`
          SELECT MAX(created_at) as last_run
          FROM agent_actions
          WHERE action_type = 'rebalance'
        `;
        const lastCronRun = lastCronResult[0]?.last_run || null;

        // Delegation metrics
        const delegationResult = await sql`
          SELECT
            COUNT(*) FILTER (WHERE authorization_7702 IS NOT NULL) as delegated,
            COUNT(*) FILTER (WHERE authorization_7702 IS NULL AND agent_registered = true) as expired
          FROM users
          WHERE auto_optimize_enabled = true
        `;
        const delegationMetrics = {
          activeDelegations: parseInt(delegationResult[0]?.delegated ?? '0'),
          expiredDelegations: parseInt(delegationResult[0]?.expired ?? '0'),
        };

        // Persisted error metrics (survives cold starts)
        const errorMetricsResult = await sql`
          SELECT
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour') as errors_1h,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as errors_24h,
            COUNT(*) FILTER (
              WHERE created_at >= NOW() - INTERVAL '24 hours'
              AND metadata->>'severity' = 'critical'
            ) as critical_24h
          FROM agent_actions
          WHERE action_type LIKE 'error_%'
        `;
        const errorMetrics = {
          errorsLastHour: parseInt(errorMetricsResult[0]?.errors_1h ?? '0'),
          errorsLast24h: parseInt(errorMetricsResult[0]?.errors_24h ?? '0'),
          criticalLast24h: parseInt(errorMetricsResult[0]?.critical_24h ?? '0'),
        };

        // Average latency (mock for now)
        metrics.averageLatency = Date.now() - startTime;

        // Get error rate
        const errorRate = await ErrorTracker.getErrorRate(60);

        return NextResponse.json({
          status: overallStatus,
          uptime: process.uptime(),
          lastCronRun,
          metrics: {
            ...metrics,
            errorRate: errorRate.toFixed(2),
            delegation: delegationMetrics,
            errors: errorMetrics,
          },
          services: checks,
          timestamp: new Date().toISOString(),
        });

      } catch (error) {
        console.error('[Health] Metrics calculation failed:', error);
        // Return basic health without metrics
      }
    }

    return NextResponse.json({
      status: overallStatus,
      uptime: process.uptime(),
      lastCronRun: null,
      metrics,
      services: checks,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('[Health] Health check failed:', error);
    return NextResponse.json({
      status: 'down' as HealthStatus,
      error: error.message,
      services: checks,
      timestamp: new Date().toISOString(),
    }, { status: 503 });
  }
}
