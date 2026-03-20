import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { encryptAuthorization } from "@/lib/security/session-encryption";
import {
  authenticateRequest,
  requireAuthForAddress,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth/middleware";
import { buildWalletAddresses, resolveAgentRegistration } from "@/lib/agent/resolve-registration";

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
    const body = await request.json();
    const { address, authorization } = body;

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

    if (!authorization) {
      return NextResponse.json({ error: "Missing authorization data" }, { status: 400 });
    }

    console.log("[Agent Register] Storing authorization for", address);

    // Validate authorization structure
    if (authorization.type !== "zerodev-7702-session") {
      return NextResponse.json({ error: "Invalid authorization type" }, { status: 400 });
    }

    if (!authorization.eoaAddress || !authorization.sessionPrivateKey) {
      return NextResponse.json({ error: "Invalid authorization data" }, { status: 400 });
    }

    // Store authorization in database (received from client-side ZeroDev setup)
    const authorizationData = encryptAuthorization({
      type: "zerodev-7702-session" as const,
      eoaAddress: authorization.eoaAddress as `0x${string}`,
      sessionKeyAddress: authorization.sessionKeyAddress as `0x${string}`,
      sessionPrivateKey: authorization.sessionPrivateKey,
      approvedVaults: authorization.approvedVaults,
      expiry: authorization.expiry,
      timestamp: authorization.timestamp || Date.now(),
    });

    const authJson = JSON.stringify(authorizationData);
    const normalizedAddress = address.toLowerCase();

    await sql`
      INSERT INTO users (wallet_address, agent_registered, authorization_7702)
      VALUES (${normalizedAddress}, true, ${authJson}::jsonb)
      ON CONFLICT (wallet_address)
      DO UPDATE SET
        agent_registered = true,
        authorization_7702 = ${authJson}::jsonb,
        updated_at = NOW()
    `;

    // Ensure user has a strategy entry
    await sql`
      INSERT INTO user_strategies (user_id)
      SELECT id FROM users WHERE wallet_address = ${normalizedAddress}
      ON CONFLICT (user_id) DO NOTHING
    `;

    console.log("[Agent Register] ✓ Authorization stored successfully");

    return NextResponse.json({
      message: "Agent registered with EIP-7702 Kernel smart account and session keys",
      eoaAddress: authorization.eoaAddress,
      sessionKeyAddress: authorization.sessionKeyAddress,
      approvedVaults: authorization.approvedVaults?.length || 0,
      status: "active",
    });
  } catch (error: any) {
    console.error("Agent registration error:", error);
    return NextResponse.json(
      {
        error: "Failed to register agent",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/agent/register
 * Checks if the agent is registered for a given address (or any of multiple addresses).
 *
 * Supports both:
 *   ?address=0x...        (single address)
 *   ?addresses=0x...,0x.. (multiple addresses, comma-separated)
 *
 * Multiple addresses handle the dual-wallet scenario: external wallet users
 * have an embedded wallet too (auto-created by Privy). The registration may
 * be stored under either address, so we check both.
 */
export async function GET(request: NextRequest) {
  // SECURITY: Require authentication to check registration status
  const authResult = await authenticateRequest(request);
  if (!authResult.authenticated) {
    return unauthorizedResponse(authResult.error);
  }

  const singleAddress = request.nextUrl.searchParams.get("address");
  const multipleAddresses = request.nextUrl.searchParams.get("addresses");

  // Build list of addresses to check
  const addressList: string[] = [];
  if (multipleAddresses) {
    addressList.push(
      ...multipleAddresses
        .split(",")
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean)
    );
  }
  if (singleAddress) {
    const normalized = singleAddress.toLowerCase();
    if (!addressList.includes(normalized)) {
      addressList.push(normalized);
    }
  }

  if (addressList.length === 0) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  try {
    // Check if ANY of the addresses has a registration
    const users = await sql`
      SELECT wallet_address, auto_optimize_enabled, authorization_7702
      FROM users
      WHERE wallet_address = ANY(${addressList})
        AND authorization_7702 IS NOT NULL
      LIMIT 1
    `;

    // Debug logging
    console.log("[Agent Status Check]", {
      queriedAddresses: addressList,
      userFound: users.length > 0,
      matchedAddress: users.length > 0 ? users[0].wallet_address : "none",
      autoOptimize: users.length > 0 ? users[0].auto_optimize_enabled : "N/A",
    });

    const hasAuthorization = users.length > 0 && users[0].authorization_7702 !== null;
    const autoOptimizeEnabled = users.length > 0 && users[0].auto_optimize_enabled;
    const isRegistered = hasAuthorization && autoOptimizeEnabled;

    return NextResponse.json({
      isRegistered,
      autoOptimizeEnabled,
      hasAuthorization,
      // Return which address matched so the client knows the DB identity
      registeredAddress: users.length > 0 ? users[0].wallet_address : undefined,
      status: isRegistered ? "active" : "inactive",
    });
  } catch (error: any) {
    console.error("Agent status check error:", error);
    return NextResponse.json(
      {
        isRegistered: false,
        autoOptimizeEnabled: false,
        hasAuthorization: false,
        status: "error",
        error: process.env.NODE_ENV === "development" ? error.message : "Database error",
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
    const body = await request.json();
    const { address, autoOptimizeEnabled } = body;

    if (!address) {
      return NextResponse.json({ error: "Missing wallet address" }, { status: 400 });
    }

    // SECURITY: Verify user is authenticated (JWT valid)
    // Note: We don't require wallet in linked_accounts here because Privy's
    // embedded wallet may not be in the JWT immediately after fresh login.
    // The address must exist in our DB with valid session key to do anything harmful.
    const authResult = await authenticateRequest(request);
    if (!authResult.authenticated) {
      return unauthorizedResponse(authResult.error);
    }

    if (typeof autoOptimizeEnabled !== "boolean") {
      return NextResponse.json({ error: "autoOptimizeEnabled must be a boolean" }, { status: 400 });
    }

    // SECURITY: Use ONLY JWT-derived addresses for the DB lookup.
    // The user-supplied `address` must NOT be included — an attacker could
    // pass someone else's address to toggle their auto_optimize_enabled.
    const walletAddresses = buildWalletAddresses({
      walletAddress: authResult.walletAddress,
      allWalletAddresses: authResult.allWalletAddresses,
    });

    const resolved = await resolveAgentRegistration(sql, walletAddresses!);
    if (!resolved.ok) {
      return NextResponse.json(
        { error: "Agent not registered. Please register first." },
        { status: 400 }
      );
    }

    const { registeredAddress } = resolved;

    // Update the auto_optimize_enabled flag on the row that has the registration
    await sql`
      UPDATE users
      SET auto_optimize_enabled = ${autoOptimizeEnabled},
          updated_at = NOW()
      WHERE wallet_address = ${registeredAddress}
    `;

    return NextResponse.json({
      message: "Auto-optimize setting updated successfully",
      autoOptimizeEnabled,
      status: autoOptimizeEnabled ? "active" : "inactive",
    });
  } catch (error: any) {
    console.error("Auto-optimize update error:", error);
    return NextResponse.json({ error: "Failed to update auto-optimize setting" }, { status: 500 });
  }
}
