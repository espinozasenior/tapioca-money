/**
 * POST /api/vault/deposit
 * Executes gasless ERC4626 vault deposit (approve + deposit) via ZeroDev
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
import { DepositError } from "@/lib/agent/vault-executor";
import { deposit, VaultOperationError } from "@/lib/agent/vault-operation-service";

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate request
    const authResult = await authenticateRequest(request);
    if (!authResult.authenticated) {
      return unauthorizedResponse(authResult.error);
    }

    const userWalletAddress = authResult.walletAddress;
    const addresses = buildWalletAddresses(authResult);
    if (!addresses) {
      return unauthorizedResponse("No wallet linked to account");
    }

    // 2. Parse request body
    const body = await request.json();
    const { vaultAddress, amount, protocol = "morpho" } = body;

    if (!vaultAddress) {
      return NextResponse.json({ error: "Missing vault address" }, { status: 400 });
    }

    if (!amount) {
      return NextResponse.json({ error: "Missing deposit amount" }, { status: 400 });
    }

    // Validate vault address format
    if (!vaultAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return NextResponse.json({ error: "Invalid vault address format" }, { status: 400 });
    }

    // Validate amount is a positive number
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
    }

    console.log("[Vault Deposit] Processing deposit request", {
      wallet: userWalletAddress,
      vault: vaultAddress,
      amount,
    });

    // 3. Resolve agent registration + decrypt authorization
    const resolved = await resolveAndDecryptRegistration(sql, addresses);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.message }, { status: resolved.statusCode });
    }
    const { decryptedAuth, accountAddress, authorizationData } = resolved;

    // 4. Verify vault is approved (if approved vaults list exists)
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
    const result = await deposit({
      userWalletAddress: userWalletAddress!,
      vaultAddress: vaultAddress as `0x${string}`,
      amount: String(amount),
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
    if (error instanceof DepositError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof VaultOperationError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    console.error("[Vault Deposit] Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        ...(process.env.NODE_ENV === "development" && { details: error.message }),
      },
      { status: 500 }
    );
  }
}
