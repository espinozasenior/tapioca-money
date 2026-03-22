/**
 * POST /api/vault/redeem
 * Executes ERC4626 vault redeem to exit a Morpho vault position
 *
 * Requires:
 * - Privy JWT authentication
 * - User must have registered agent with session key authorization
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth/middleware";
import {
  buildWalletAddresses,
  resolveAndDecryptRegistration,
  verifyVaultApproval,
} from "@/lib/agent/resolve-registration";
import { redeem, VaultOperationError } from "@/lib/agent/vault-operation-service";
import { PauseService } from "@/lib/shared/pause-service";
import { YoPauseChecker } from "@/lib/yo/pause-checker";
import { MorphoPauseChecker } from "@/lib/morpho/pause-checker";

const pauseService = new PauseService([new YoPauseChecker(), new MorphoPauseChecker()], {
  ttlMs: 60_000,
});

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate request
    const authResult = await authenticateRequest(request);
    if (!authResult.authenticated) {
      return unauthorizedResponse(authResult.error);
    }

    const userWalletAddress = authResult.walletAddress;
    if (!userWalletAddress) {
      return unauthorizedResponse("No wallet address in auth result");
    }
    const addresses = buildWalletAddresses(authResult);
    if (!addresses) {
      return unauthorizedResponse("No wallet linked to account");
    }

    // 2. Parse request body
    const body = await request.json();
    const { vaultAddress, shares, protocol = "morpho" } = body;

    if (!vaultAddress) {
      return NextResponse.json({ error: "Missing vault address" }, { status: 400 });
    }

    if (!shares) {
      return NextResponse.json({ error: "Missing shares amount" }, { status: 400 });
    }

    // Validate shares: must be a non-negative integer string within uint256 range
    const sharesStr = String(shares);
    if (!/^\d+$/.test(sharesStr)) {
      return NextResponse.json(
        { error: "Invalid shares: must be a non-negative integer (digits only)" },
        { status: 400 }
      );
    }
    if (sharesStr.length > 78) {
      return NextResponse.json(
        { error: "Invalid shares: exceeds maximum uint256 value (78 digits max)" },
        { status: 400 }
      );
    }
    if (sharesStr === "0") {
      return NextResponse.json(
        { error: "Invalid shares: must be greater than 0" },
        { status: 400 }
      );
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

    // 3. Resolve agent registration + decrypt authorization
    const resolved = await resolveAndDecryptRegistration(sql, addresses);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.message }, { status: resolved.statusCode });
    }
    const { decryptedAuth, accountAddress, authorizationData } = resolved;

    // 4a. Check if vault has redeems paused
    const pauseStates = await pauseService.checkVaultPauseStates([
      { address: vaultAddress as `0x${string}`, protocol },
    ]);
    const vaultPauseState = pauseStates.get(vaultAddress.toLowerCase() as `0x${string}`);
    if (vaultPauseState?.redeemPaused) {
      return NextResponse.json(
        { error: "This vault has redeems paused. Withdrawal is not currently available." },
        { status: 422 }
      );
    }

    // 4b. Verify vault/gateway is approved
    const approvedVaults = authorizationData.approvedVaults || [];
    const approval = verifyVaultApproval(approvedVaults, vaultAddress, protocol);
    if (!approval.approved) {
      return NextResponse.json({ error: approval.message }, { status: 403 });
    }

    // 5. Validate serializedAccount before passing to executors
    if (!decryptedAuth.serializedAccount) {
      return NextResponse.json(
        { error: "Session key data incomplete. Please re-register agent." },
        { status: 400 }
      );
    }

    // 6. Delegate to VaultOperationService
    const result = await redeem({
      userWalletAddress,
      vaultAddress: vaultAddress as `0x${string}`,
      shares: BigInt(shares),
      protocol,
      ctx: {
        smartAccountAddress: accountAddress,
        serializedAccount: decryptedAuth.serializedAccount,
        decryptedAuth,
        approvedVaults: approvedVaults as `0x${string}`[],
      },
    });

    return NextResponse.json(result);
  } catch (error: any) {
    if (error instanceof VaultOperationError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    console.error("[Vault Redeem] Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        ...(process.env.NODE_ENV === "development" && { details: error.message }),
      },
      { status: 500 }
    );
  }
}
