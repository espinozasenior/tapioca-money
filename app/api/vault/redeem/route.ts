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
import { getExecutor } from "@/lib/agent/vault-executor";
import { incrementUserOpCount } from "@/lib/redis/rate-limiter";

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

    // 4. Verify vault/gateway is approved
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

    // 6. Execute vault redeem
    const executor = getExecutor(protocol);
    const result = await executor.redeem(
      {
        smartAccountAddress: accountAddress,
        serializedAccount: decryptedAuth.serializedAccount,
        decryptedAuth,
        approvedVaults: approvedVaults as `0x${string}`[],
      },
      {
        vaultAddress: vaultAddress as `0x${string}`,
        shares: BigInt(shares),
        receiver: accountAddress,
      }
    );

    if (!result.success) {
      let userMessage = result.error || "Vault redeem failed";
      const isRateLimit =
        result.error?.includes("operation limit") || result.error?.includes("0x3e4983f6");
      const isValidationFailure =
        !isRateLimit &&
        (result.error?.includes("AA23") || result.error?.includes("validateUserOp"));
      if (result.error?.includes("0xace2a47e")) {
        userMessage =
          "This vault rejected the redeem (error 0xace2a47e). " +
          "The vault may restrict access to agent-operated accounts. " +
          "Please redeem directly from your wallet.";
      } else if (isRateLimit) {
        userMessage =
          "Agent daily operation limit reached. " +
          "Please re-register your agent to reset the limit, or try again tomorrow.";
      } else if (isValidationFailure) {
        userMessage = "Session key validation failed. Please re-register your agent.";
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
      redeemStatus: "redeemStatus" in result ? result.redeemStatus : undefined,
    });
  } catch (error: any) {
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
