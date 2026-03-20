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
import { getExecutor, DepositError } from "@/lib/agent/vault-executor";

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

    // 6. Execute gasless deposit
    console.log("[Vault Deposit] Calling deposit with:", {
      smartAccountAddress: accountAddress,
      vaultAddress,
      amount: String(amount),
      protocol,
      hasSerialized: !!decryptedAuth.serializedAccount,
      approvedVaultsCount: approvedVaults.length,
    });

    const depositStartTime = Date.now();

    const executor = getExecutor(protocol);
    let result;
    try {
      result = await executor.deposit(
        {
          smartAccountAddress: accountAddress,
          serializedAccount: decryptedAuth.serializedAccount,
          decryptedAuth,
          approvedVaults: approvedVaults as `0x${string}`[],
        },
        {
          vaultAddress: vaultAddress as `0x${string}`,
          amount: String(amount),
        }
      );
    } catch (err) {
      if (err instanceof DepositError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }

    const depositDuration = Date.now() - depositStartTime;

    if (!result.success) {
      console.error("[Vault Deposit] Execution failed after", depositDuration, "ms:", result.error);
      return NextResponse.json({ error: result.error || "Vault deposit failed" }, { status: 500 });
    }

    console.log("[Vault Deposit] Success after", depositDuration, "ms:", result.txHash);

    return NextResponse.json({
      success: true,
      txHash: result.txHash,
      userOpHash: result.userOpHash,
    });
  } catch (error: any) {
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
