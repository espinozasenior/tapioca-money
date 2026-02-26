/**
 * POST /api/vault/deposit
 * Executes gasless ERC4626 vault deposit (approve + deposit) via ZeroDev
 *
 * Requires:
 * - Privy JWT authentication
 * - User must have registered agent with session key authorization
 */

import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import {
  decryptAuthorization,
  SessionKey7702Authorization,
} from "@/lib/security/session-encryption";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth/middleware";
import { executeGaslessDeposit } from "@/lib/zerodev/deposit-executor";
import { executeYoGaslessDeposit } from "@/lib/zerodev/yo-deposit-executor";
import { YO_GATEWAY_ADDRESS, YO_VAULTS } from "@/lib/yo/constants";

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
    if (authorizationData.type !== "zerodev-7702-session") {
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

    if (protocol === "yo") {
      // For YO: check Gateway address is approved
      const gatewayApproved = approvedVaults.some(
        (v: string) => v.toLowerCase() === YO_GATEWAY_ADDRESS.toLowerCase()
      );
      if (approvedVaults.length > 0 && !gatewayApproved) {
        return NextResponse.json(
          { error: "YO Gateway not approved. Please re-register agent." },
          { status: 403 }
        );
      }
    } else if (approvedVaults.length > 0) {
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

    // 8. Execute gasless deposit
    console.log("[Vault Deposit] Calling deposit with:", {
      smartAccountAddress: decryptedAuth.eoaAddress,
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
        (v) => v.address.toLowerCase() === normalizedVaultAddress
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
        smartAccountAddress: decryptedAuth.eoaAddress,
        vaultAddress: vaultAddress as `0x${string}`,
        amount: String(amount),
        underlyingAddress: underlyingAddress as `0x${string}`,
        underlyingDecimals: vaultConfig.underlying.decimals,
        serializedAccount: decryptedAuth.serializedAccount!,
      });
    } else {
      result = await executeGaslessDeposit({
        smartAccountAddress: decryptedAuth.eoaAddress,
        vaultAddress: vaultAddress as `0x${string}`,
        amount: String(amount),
        serializedAccount: decryptedAuth.serializedAccount,
        sessionPrivateKey: decryptedAuth.sessionPrivateKey as `0x${string}` | undefined,
        approvedVaults: approvedVaults as `0x${string}`[],
        eip7702SignedAuth: decryptedAuth.eip7702SignedAuth,
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
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
