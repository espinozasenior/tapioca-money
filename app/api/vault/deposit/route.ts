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
import { SessionKey7702Authorization } from "@/lib/security/session-encryption";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth/middleware";
import {
  buildWalletAddresses,
  resolveAndDecryptRegistration,
  verifyVaultApproval,
} from "@/lib/agent/resolve-registration";
import { executeGaslessDeposit } from "@/lib/zerodev/deposit-executor";
import { executeYoGaslessDeposit } from "@/lib/zerodev/yo-deposit-executor";
import { YO_VAULTS } from "@/lib/yo/constants";

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
    let result;

    if (protocol === "yo") {
      // Find vault config for underlying token info
      const vaultConfig = Object.values(YO_VAULTS).find(
        (v) => v.address.toLowerCase() === vaultAddress.toLowerCase()
      );
      if (!vaultConfig) {
        return NextResponse.json({ error: "Unknown YO vault address" }, { status: 400 });
      }
      const underlyingAddress =
        vaultConfig.underlying.address[8453 as keyof typeof vaultConfig.underlying.address];
      if (!underlyingAddress) {
        return NextResponse.json({ error: "YO vault not available on Base" }, { status: 400 });
      }

      result = await executeYoGaslessDeposit({
        smartAccountAddress: accountAddress,
        vaultAddress: vaultAddress as `0x${string}`,
        amount: String(amount),
        underlyingAddress: underlyingAddress as `0x${string}`,
        underlyingDecimals: vaultConfig.underlying.decimals,
        serializedAccount: decryptedAuth.serializedAccount,
      });
    } else {
      // Legacy fields only exist on 7702 sessions
      const legacy7702 =
        decryptedAuth.type === "zerodev-7702-session"
          ? (decryptedAuth as SessionKey7702Authorization)
          : undefined;
      result = await executeGaslessDeposit({
        smartAccountAddress: accountAddress,
        vaultAddress: vaultAddress as `0x${string}`,
        amount: String(amount),
        serializedAccount: decryptedAuth.serializedAccount,
        sessionPrivateKey: legacy7702?.sessionPrivateKey as `0x${string}` | undefined,
        approvedVaults: approvedVaults as `0x${string}`[],
        eip7702SignedAuth: legacy7702?.eip7702SignedAuth,
      });
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
