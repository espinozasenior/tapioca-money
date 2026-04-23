/**
 * Transfer Session Registration API
 *
 * Endpoints:
 * - POST /api/transfer/register - Create transfer session key
 * - GET /api/transfer/register?address=0x... - Check transfer session status
 * - DELETE /api/transfer/register - Revoke transfer session
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import {
  createTransferSessionKey,
  validateTransferSession,
  type TransferSessionAuthorization,
  type PrivyWalletProvider,
} from "@/lib/zerodev/transfer-session";
import { encryptAuthorization } from "@/lib/security/session-encryption";
import {
  requireAuthForAddress,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth/middleware";
import { checkRateLimit } from "@/lib/redis/rate-limiter";

const DAILY_TRANSFER_LIMIT = 20;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

async function readTransferRateLimitInfo(address: string) {
  try {
    const r = await checkRateLimit(address, {
      maxRequests: DAILY_TRANSFER_LIMIT,
      windowMs: DAILY_WINDOW_MS,
      keyPrefix: "transfer",
      failClosed: false, // read-only probe, don't error on Redis down
    });
    const used = Math.max(0, DAILY_TRANSFER_LIMIT - r.remaining);
    return {
      used,
      limit: DAILY_TRANSFER_LIMIT,
      remaining: r.remaining,
      resetAt: r.resetTime ?? Date.now() + DAILY_WINDOW_MS,
    };
  } catch {
    return {
      used: 0,
      limit: DAILY_TRANSFER_LIMIT,
      remaining: DAILY_TRANSFER_LIMIT,
      resetAt: Date.now() + DAILY_WINDOW_MS,
    };
  }
}

/**
 * GET /api/transfer/register?address=0x...
 * Check if user has active transfer session
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");

    if (!address) {
      return NextResponse.json({ error: "Address required" }, { status: 400 });
    }

    // SECURITY: Verify authenticated user owns the requested address
    const authResult = await requireAuthForAddress(request, address);
    if (!authResult.authenticated) {
      if (authResult.error === "Address does not belong to authenticated user") {
        return forbiddenResponse(authResult.error);
      }
      return unauthorizedResponse(authResult.error);
    }

    // Query user from database
    const users = await sql`
      SELECT transfer_authorization
      FROM users
      WHERE LOWER(wallet_address) = LOWER(${address})
    `;

    const rateLimitInfo = await readTransferRateLimitInfo(address);

    if (users.length === 0) {
      return NextResponse.json({
        isEnabled: false,
        message: "User not found",
        rateLimitInfo,
      });
    }

    const transferAuth = users[0].transfer_authorization as TransferSessionAuthorization | null;

    if (!transferAuth) {
      return NextResponse.json({
        isEnabled: false,
        rateLimitInfo,
      });
    }

    const validation = validateTransferSession(transferAuth);
    if (!validation.valid) {
      return NextResponse.json({
        isEnabled: false,
        reason: validation.reason,
        rateLimitInfo,
      });
    }

    // Missing field defaults to v1 — clients treat < 2 as upgrade required.
    const permissionsVersion = transferAuth.permissionsVersion ?? 1;

    return NextResponse.json({
      isEnabled: true,
      smartAccountAddress: transferAuth.smartAccountAddress,
      sessionKeyAddress: transferAuth.sessionKeyAddress,
      expiry: transferAuth.expiry,
      createdAt: transferAuth.createdAt,
      permissionsVersion,
      rateLimitInfo,
    });
  } catch (error: any) {
    console.error("[API] Transfer status check failed:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        ...(process.env.NODE_ENV === "development" && { details: error.message }),
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/transfer/register
 * Create transfer session key for gasless transfers
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, privyWallet } = body;

    if (!address) {
      return NextResponse.json({ error: "Address required" }, { status: 400 });
    }

    // SECURITY: Verify authenticated user owns the requested address
    const authResult = await requireAuthForAddress(request, address);
    if (!authResult.authenticated) {
      if (authResult.error === "Address does not belong to authenticated user") {
        return forbiddenResponse(authResult.error);
      }
      return unauthorizedResponse(authResult.error);
    }

    // Note: In production, privyWallet would be obtained from the authenticated session
    // For now, we accept it in the request body
    if (!privyWallet) {
      return NextResponse.json({ error: "Privy wallet required" }, { status: 400 });
    }

    console.log("[API] Creating transfer session for:", address);

    // Check if user exists
    const users = await sql`
      SELECT id, transfer_authorization
      FROM users
      WHERE LOWER(wallet_address) = LOWER(${address})
    `;

    if (users.length === 0) {
      return NextResponse.json({ error: "User not found. Please login first." }, { status: 404 });
    }

    const existingAuth = users[0].transfer_authorization as TransferSessionAuthorization | null;

    // Accept an existing session only if it's valid AND on the current CallPolicy version.
    // Legacy v1 sessions must be re-created to include paymaster-approve permission.
    if (existingAuth) {
      const validation = validateTransferSession(existingAuth);
      const version = existingAuth.permissionsVersion ?? 1;
      if (validation.valid && version >= 2) {
        console.log("[API] Valid transfer session already exists");
        return NextResponse.json({
          success: true,
          smartAccountAddress: existingAuth.smartAccountAddress,
          expiry: existingAuth.expiry,
          permissionsVersion: version,
          message: "Transfer session already active",
        });
      }
    }

    // Create new transfer session key
    const authorization = await createTransferSessionKey(
      privyWallet as PrivyWalletProvider,
      address as `0x${string}`
    );

    // Encrypt authorization before storing
    const encryptedAuth = encryptAuthorization(authorization);

    // Store in database
    await sql`
      UPDATE users
      SET transfer_authorization = ${JSON.stringify(encryptedAuth)},
          updated_at = NOW()
      WHERE LOWER(wallet_address) = LOWER(${address})
    `;

    console.log("[API] ✓ Transfer session created:", authorization.smartAccountAddress);

    return NextResponse.json({
      success: true,
      smartAccountAddress: authorization.smartAccountAddress,
      sessionKeyAddress: authorization.sessionKeyAddress,
      expiry: authorization.expiry,
      permissionsVersion: authorization.permissionsVersion,
    });
  } catch (error: any) {
    console.error("[API] Transfer session creation failed:", error);
    return NextResponse.json(
      {
        error: "Failed to create transfer session",
        ...(process.env.NODE_ENV === "development" && { details: error.message }),
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/transfer/register
 * Revoke transfer session
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { address } = body;

    if (!address) {
      return NextResponse.json({ error: "Address required" }, { status: 400 });
    }

    // SECURITY: Verify authenticated user owns the requested address
    const authResult = await requireAuthForAddress(request, address);
    if (!authResult.authenticated) {
      if (authResult.error === "Address does not belong to authenticated user") {
        return forbiddenResponse(authResult.error);
      }
      return unauthorizedResponse(authResult.error);
    }

    console.log("[API] Revoking transfer session for:", address);

    // Remove transfer authorization from database
    const result = await sql`
      UPDATE users
      SET transfer_authorization = NULL,
          updated_at = NOW()
      WHERE LOWER(wallet_address) = LOWER(${address})
      RETURNING id
    `;

    if (result.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    console.log("[API] ✓ Transfer session revoked");

    return NextResponse.json({
      success: true,
      message: "Transfer session revoked successfully",
    });
  } catch (error: any) {
    console.error("[API] Transfer session revocation failed:", error);
    return NextResponse.json(
      {
        error: "Failed to revoke transfer session",
        ...(process.env.NODE_ENV === "development" && { details: error.message }),
      },
      { status: 500 }
    );
  }
}
