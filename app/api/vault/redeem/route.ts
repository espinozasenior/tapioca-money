/**
 * POST /api/vault/redeem
 * Executes ERC4626 vault redeem to exit a Morpho vault position
 *
 * Requires:
 * - Privy JWT authentication
 * - User must have registered agent with session key authorization
 */

import { NextRequest, NextResponse } from "next/server";
import { neon } from '@neondatabase/serverless';
import { decryptAuthorization, SessionKey7702Authorization } from '@/lib/security/session-encryption';
import {
  authenticateRequest,
  unauthorizedResponse,
} from '@/lib/auth/middleware';
import { executeVaultRedeem } from '@/lib/zerodev/vault-executor';
import { incrementUserOpCount } from '@/lib/redis/rate-limiter';

const sql = neon(process.env.DATABASE_URL!);

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate request
    const authResult = await authenticateRequest(request);
    if (!authResult.authenticated) {
      return unauthorizedResponse(authResult.error);
    }

    const userWalletAddress = authResult.walletAddress;
    if (!userWalletAddress) {
      return unauthorizedResponse('No wallet linked to account');
    }

    // 2. Parse request body
    const body = await request.json();
    const { vaultAddress, shares } = body;

    if (!vaultAddress) {
      return NextResponse.json({ error: "Missing vault address" }, { status: 400 });
    }

    if (!shares) {
      return NextResponse.json({ error: "Missing shares amount" }, { status: 400 });
    }

    // Validate vault address format
    if (!vaultAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return NextResponse.json({ error: "Invalid vault address format" }, { status: 400 });
    }

    console.log("[Vault Redeem] Processing redeem request", {
      wallet: userWalletAddress,
      vault: vaultAddress,
      shares,
    });

    // 3. Fetch user authorization from database
    const users = await sql`
      SELECT authorization_7702
      FROM users
      WHERE wallet_address = ${userWalletAddress}
    `;

    if (users.length === 0) {
      return NextResponse.json(
        { error: "User not found. Please register agent first." },
        { status: 404 }
      );
    }

    const authorizationData = users[0].authorization_7702 as SessionKey7702Authorization | null;

    if (!authorizationData) {
      return NextResponse.json(
        { error: "Agent not registered. Please register your agent to enable vault operations." },
        { status: 400 }
      );
    }

    // 4. Validate authorization type
    if (authorizationData.type !== 'zerodev-7702-session') {
      return NextResponse.json(
        { error: "Invalid authorization type. Please re-register agent." },
        { status: 400 }
      );
    }

    // 5. Check if session key is expired
    const now = Math.floor(Date.now() / 1000);
    if (authorizationData.expiry && authorizationData.expiry < now) {
      return NextResponse.json(
        { error: "Session key expired. Please re-register agent." },
        { status: 400 }
      );
    }

    // 6. Decrypt session key
    const decryptedAuth = decryptAuthorization(authorizationData);

    // 7. Verify vault is approved (if approved vaults list exists)
    const approvedVaults = authorizationData.approvedVaults || [];
    const normalizedVaultAddress = vaultAddress.toLowerCase();

    if (approvedVaults.length > 0) {
      const isApproved = approvedVaults.some(
        (v: string) => v.toLowerCase() === normalizedVaultAddress
      );
      if (!isApproved) {
        return NextResponse.json(
          { error: "Vault not approved. Please re-register agent with updated vault list." },
          { status: 403 }
        );
      }
    }

    // 8. Execute vault redeem
    const result = await executeVaultRedeem({
      smartAccountAddress: decryptedAuth.eoaAddress,
      vaultAddress: vaultAddress as `0x${string}`,
      shares: BigInt(shares),
      receiver: decryptedAuth.eoaAddress,
      serializedAccount: decryptedAuth.serializedAccount,
      sessionPrivateKey: decryptedAuth.sessionPrivateKey as `0x${string}` | undefined,
      approvedVaults: approvedVaults as `0x${string}`[],
    });

    if (!result.success) {
      let userMessage = result.error || 'Vault redeem failed';
      if (result.error?.includes('0xace2a47e')) {
        userMessage =
          'This vault rejected the redeem (error 0xace2a47e). ' +
          'The vault may restrict access to agent-operated accounts. ' +
          'Please redeem directly from your wallet.';
      } else if (
        result.error?.includes('operation limit') ||
        result.error?.includes('0x3e4983f6') ||
        result.error?.includes('AA23')
      ) {
        userMessage =
          'Agent daily operation limit reached. ' +
          'Please re-register your agent to reset the limit, or try again tomorrow.';
      }
      console.error("[Vault Redeem] Execution failed:", result.error);
      return NextResponse.json({ error: userMessage }, { status: 500 });
    }

    console.log("[Vault Redeem] Success:", result.txHash);
    await incrementUserOpCount(userWalletAddress);

    return NextResponse.json({
      success: true,
      txHash: result.txHash,
      userOpHash: result.userOpHash,
    });

  } catch (error: any) {
    console.error("[Vault Redeem] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
