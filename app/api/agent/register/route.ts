
import { NextRequest, NextResponse } from "next/server";
import { neon } from '@neondatabase/serverless';
import { encryptAuthorization } from '@/lib/security/session-encryption';

const sql = neon(process.env.DATABASE_URL!);

/**
 * POST /api/agent/register
 * Stores agent authorization after client-side ZeroDev registration
 *
 * Flow (client-side via lib/zerodev/client.ts):
 * 1. User creates ZeroDev Kernel V3 smart account with Privy as signer
 * 2. Fetches approved Morpho vaults
 * 3. Grants session key permissions to agent (ERC-7715)
 * 4. Sends authorization data to this endpoint for storage
 */
export async function POST(request: NextRequest) {
  try {
    const { address, authorization } = await request.json();

    if (!address) {
      return NextResponse.json({ error: "Missing wallet address" }, { status: 400 });
    }

    if (!authorization) {
      return NextResponse.json({ error: "Missing authorization data" }, { status: 400 });
    }

    console.log("[Agent Register] Storing authorization for", address);

    // Validate authorization structure
    if (authorization.type !== "zerodev-session-key") {
      return NextResponse.json({ error: "Invalid authorization type" }, { status: 400 });
    }

    if (!authorization.smartAccountAddress || !authorization.sessionPrivateKey) {
      return NextResponse.json({ error: "Invalid authorization data" }, { status: 400 });
    }

    // Store authorization in database (received from client-side ZeroDev setup)
    const authorizationData = encryptAuthorization({
      type: "zerodev-session-key" as const,
      smartAccountAddress: authorization.smartAccountAddress,
      sessionKeyAddress: authorization.sessionKeyAddress,
      sessionPrivateKey: authorization.sessionPrivateKey,
      expiry: authorization.expiry,
      approvedVaults: authorization.approvedVaults,
      timestamp: authorization.timestamp || Date.now(),
    });

    const authJson = JSON.stringify(authorizationData);

    await sql`
      INSERT INTO users (wallet_address, auto_optimize_enabled, agent_registered, authorization_7702)
      VALUES (${address}, true, true, ${authJson}::jsonb)
      ON CONFLICT (wallet_address)
      DO UPDATE SET
        auto_optimize_enabled = true,
        agent_registered = true,
        authorization_7702 = ${authJson}::jsonb,
        updated_at = NOW()
    `;

    // Ensure user has a strategy entry
    await sql`
      INSERT INTO user_strategies (user_id)
      SELECT id FROM users WHERE wallet_address = ${address}
      ON CONFLICT (user_id) DO NOTHING
    `;

    console.log("[Agent Register] ✓ Authorization stored successfully");

    return NextResponse.json({
      message: "Agent registered with ZeroDev Kernel smart account and session keys",
      smartAccountAddress: authorization.smartAccountAddress,
      sessionKeyAddress: authorization.sessionKeyAddress,
      approvedVaults: authorization.approvedVaults?.length || 0,
      status: "active"
    });
  } catch (error: any) {
    console.error("Agent registration error:", error);
    return NextResponse.json({
      error: error.message || "Failed to register agent",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined
    }, { status: 500 });
  }
}

/**
 * GET /api/agent/register
 * Checks if the agent is registered for a given address
 */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  try {
    const users = await sql`
      SELECT auto_optimize_enabled, authorization_7702
      FROM users
      WHERE wallet_address = ${address}
    `;

    // Debug logging
    console.log("[Agent Status Check]", {
      address,
      userFound: users.length > 0,
      hasAuth: users.length > 0 && users[0].authorization_7702 !== null,
      authType: users.length > 0 ? typeof users[0].authorization_7702 : 'N/A',
      autoOptimize: users.length > 0 ? users[0].auto_optimize_enabled : 'N/A'
    });

    const hasAuthorization = users.length > 0 && users[0].authorization_7702 !== null;
    const autoOptimizeEnabled = users.length > 0 && users[0].auto_optimize_enabled;
    const isRegistered = hasAuthorization && autoOptimizeEnabled;

    return NextResponse.json({
      isRegistered,
      autoOptimizeEnabled,
      hasAuthorization,
      status: isRegistered ? "active" : "inactive"
    });
  } catch (error: any) {
    console.error("Agent status check error:", error);
    return NextResponse.json(
      {
        isRegistered: false,
        autoOptimizeEnabled: false,
        hasAuthorization: false,
        status: "error",
        error: process.env.NODE_ENV === "development" ? error.message : "Database error"
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/agent/register
 * Updates the auto-optimize setting for a registered agent
 */
export async function PATCH(request: NextRequest) {
  try {
    const { address, autoOptimizeEnabled } = await request.json();

    if (!address) {
      return NextResponse.json({ error: "Missing wallet address" }, { status: 400 });
    }

    if (typeof autoOptimizeEnabled !== 'boolean') {
      return NextResponse.json({ error: "autoOptimizeEnabled must be a boolean" }, { status: 400 });
    }

    // Check if user exists and has authorization
    const users = await sql`
      SELECT authorization_7702
      FROM users
      WHERE wallet_address = ${address}
    `;

    if (users.length === 0 || !users[0].authorization_7702) {
      return NextResponse.json({ error: "Agent not registered. Please register first." }, { status: 400 });
    }

    // Update the auto_optimize_enabled flag
    await sql`
      UPDATE users
      SET auto_optimize_enabled = ${autoOptimizeEnabled},
          updated_at = NOW()
      WHERE wallet_address = ${address}
    `;

    return NextResponse.json({
      message: "Auto-optimize setting updated successfully",
      autoOptimizeEnabled,
      status: autoOptimizeEnabled ? "active" : "inactive"
    });
  } catch (error: any) {
    console.error("Auto-optimize update error:", error);
    return NextResponse.json({ error: error.message || "Failed to update auto-optimize setting" }, { status: 500 });
  }
}
