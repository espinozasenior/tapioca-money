/**
 * Transfer History API.
 *
 * GET /api/transfer/history?address=0x...&limit=10&unique=recipient
 *   Returns the authenticated user's recent customer-paid sends.
 *   `unique=recipient` dedupes by recipient address, keeping the most recent
 *   row per recipient — used by the Recent Recipients strip.
 *
 * See tasks/architecture-usdc-send.md §14.3 for the data contract.
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import {
  requireAuthForAddress,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth/middleware";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");

    if (!address) {
      return NextResponse.json({ error: "Address required" }, { status: 400 });
    }

    const authResult = await requireAuthForAddress(request, address);
    if (!authResult.authenticated) {
      if (authResult.error === "Address does not belong to authenticated user") {
        return forbiddenResponse(authResult.error);
      }
      return unauthorizedResponse(authResult.error);
    }

    const rawLimit = parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(1, rawLimit), MAX_LIMIT)
      : DEFAULT_LIMIT;
    const unique = searchParams.get("unique") === "recipient";

    const users = await sql`
      SELECT id FROM users WHERE LOWER(wallet_address) = LOWER(${address})
    `;
    if (users.length === 0) {
      return NextResponse.json({ history: [] });
    }
    const userId = users[0].id as string;

    // DISTINCT ON keeps the most recent row per recipient_addr. The outer
    // wrapper re-orders by created_at desc since DISTINCT ON orders by its
    // first column internally.
    const rows = unique
      ? await sql`
          SELECT * FROM (
            SELECT DISTINCT ON (recipient_addr)
              id, tx_hash, user_op_hash, recipient_addr, recipient_label,
              amount, fee_paid, created_at
            FROM transfer_history
            WHERE user_id = ${userId}
            ORDER BY recipient_addr, created_at DESC
          ) recent
          ORDER BY created_at DESC
          LIMIT ${limit}
        `
      : await sql`
          SELECT id, tx_hash, user_op_hash, recipient_addr, recipient_label,
                 amount, fee_paid, created_at
          FROM transfer_history
          WHERE user_id = ${userId}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;

    return NextResponse.json({
      history: rows.map((r) => ({
        id: r.id,
        txHash: r.tx_hash,
        userOpHash: r.user_op_hash,
        recipientAddress: r.recipient_addr,
        recipientLabel: r.recipient_label,
        amount: r.amount,
        feePaid: r.fee_paid,
        createdAt: r.created_at,
      })),
    });
  } catch (error: any) {
    console.error("[API] Transfer history fetch failed:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        ...(process.env.NODE_ENV === "development" && { details: error.message }),
      },
      { status: 500 }
    );
  }
}
