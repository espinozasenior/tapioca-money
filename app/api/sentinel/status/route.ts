/**
 * GET /api/sentinel/status
 *
 * Returns sentinel vault safety statuses for the dashboard.
 * Includes a dead-man switch: if last_check_at on any vault is > 5 min old,
 * returns sentinel_status: "DOWN".
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth/middleware";

const DEADMAN_SWITCH_MS = 5 * 60 * 1000; // 5 minutes

export async function GET(request: NextRequest) {
  // SECURITY: Require authentication. The sentinel_status field reveals when
  // the circuit breaker is offline, which is sensitive operational data —
  // exposing it publicly would let an attacker know exactly when emergency
  // exits are disabled.
  const authResult = await authenticateRequest(request);
  if (!authResult.authenticated) {
    return unauthorizedResponse();
  }

  try {
    const vaults = await sql`
      SELECT
        vault_address,
        protocol,
        status,
        last_check_at,
        share_price,
        tvl,
        depeg_delta,
        max_redeem_zero,
        metadata,
        updated_at
      FROM sentinel_vault_status
      ORDER BY vault_address
    `;

    // Dead-man switch: check if any vault's last_check_at is stale
    const now = Date.now();
    let sentinelStatus: "OK" | "DOWN" = "OK";

    if (vaults.length === 0) {
      sentinelStatus = "DOWN"; // No data = worker hasn't run yet
    } else {
      for (const vault of vaults) {
        if (!vault.last_check_at) {
          sentinelStatus = "DOWN";
          break;
        }
        const lastCheck = new Date(vault.last_check_at as string).getTime();
        if (now - lastCheck > DEADMAN_SWITCH_MS) {
          sentinelStatus = "DOWN";
          break;
        }
      }
    }

    return NextResponse.json({
      sentinel_status: sentinelStatus,
      vaults: vaults.map((v) => ({
        vault_address: v.vault_address,
        protocol: v.protocol,
        status: v.status,
        last_check_at: v.last_check_at,
        share_price: v.share_price ? parseFloat(v.share_price as string) : null,
        tvl: v.tvl ? parseFloat(v.tvl as string) : null,
        depeg_delta: v.depeg_delta ? parseFloat(v.depeg_delta as string) : null,
        max_redeem_zero: v.max_redeem_zero,
      })),
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Sentinel API] Status query failed:", (error as Error).message);
    return NextResponse.json(
      {
        sentinel_status: "DOWN",
        vaults: [],
        error: "Failed to query sentinel status",
        checked_at: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
