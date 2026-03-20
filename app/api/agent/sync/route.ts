import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import {
  requireAuthForAddress,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth/middleware";

/**
 * POST /api/agent/sync
 * Ensures a user record exists in the Postgres database upon login.
 * This handles "legacy" users who logged in before the DB was created.
 */
export async function POST(request: NextRequest) {
  try {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid or empty request body" }, { status: 400 });
    }
    const { address, email } = body;

    if (!address) {
      return NextResponse.json({ error: "Missing wallet address" }, { status: 400 });
    }

    // SECURITY: Verify authenticated user owns the requested address
    const authResult = await requireAuthForAddress(request, address);
    if (!authResult.authenticated) {
      if (authResult.error === "Address does not belong to authenticated user") {
        return forbiddenResponse(authResult.error);
      }
      return unauthorizedResponse(authResult.error);
    }

    const normalizedAddress = address.toLowerCase();

    // 1. Ensure user record exists
    // We use ON CONFLICT DO NOTHING to avoid overwriting existing data (like 7702 authorizations)
    await sql`
      INSERT INTO users (wallet_address)
      VALUES (${normalizedAddress})
      ON CONFLICT (wallet_address) DO NOTHING
    `;

    // 2. Ensure user has a strategy entry
    await sql`
      INSERT INTO user_strategies (user_id)
      SELECT id FROM users WHERE wallet_address = ${normalizedAddress}
      ON CONFLICT (user_id) DO NOTHING
    `;

    return NextResponse.json({
      message: "User synchronized successfully",
      address,
    });
  } catch (error: any) {
    console.error("Agent sync error:", error);
    return NextResponse.json(
      {
        error: "Failed to sync user",
        ...(process.env.NODE_ENV === "development" && { details: error.message }),
      },
      { status: 500 }
    );
  }
}
