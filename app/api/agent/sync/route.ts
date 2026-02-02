import { NextRequest, NextResponse } from "next/server";
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

/**
 * POST /api/agent/sync
 * Ensures a user record exists in the Postgres database upon login.
 * This handles "legacy" users who logged in before the DB was created.
 */
export async function POST(request: NextRequest) {
  try {
    const { address, email } = await request.json();

    if (!address) {
      return NextResponse.json({ error: "Missing wallet address" }, { status: 400 });
    }

    // 1. Ensure user record exists
    // We use ON CONFLICT DO NOTHING to avoid overwriting existing data (like 7702 authorizations)
    await sql`
      INSERT INTO users (wallet_address)
      VALUES (${address})
      ON CONFLICT (wallet_address) DO NOTHING
    `;

    // 2. Ensure user has a strategy entry
    await sql`
      INSERT INTO user_strategies (user_id)
      SELECT id FROM users WHERE wallet_address = ${address}
      ON CONFLICT (user_id) DO NOTHING
    `;

    return NextResponse.json({
      message: "User synchronized successfully",
      address
    });
  } catch (error: any) {
    console.error("Agent sync error:", error);
    return NextResponse.json({ error: error.message || "Failed to sync user" }, { status: 500 });
  }
}
