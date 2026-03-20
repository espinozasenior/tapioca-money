import { NextRequest, NextResponse } from "next/server";
import { encodeFunctionData, parseAbi } from "viem";
import { CHAIN_CONFIG, USDC_ADDRESS } from "@/lib/config";
import {
  requireAuthForAddress,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth/middleware";

// ERC4626 ABI for vault interaction
const ERC4626_ABI = parseAbi([
  "function redeem(uint256 shares, address receiver, address owner) returns (uint256 assets)",
  "function withdraw(uint256 assets, address receiver, address owner) returns (uint256 shares)",
]);

/**
 * POST /api/withdraw
 *
 * Build withdrawal transaction for exiting a yield position
 *
 * Body:
 * - protocol: "morpho" | "aave" | "moonwell"
 * - userAddress: `0x${string}`
 * - vaultAddress?: `0x${string}` (vault address for ERC4626 vaults like Morpho)
 * - shares?: string (amount of shares to withdraw)
 * - assets?: string (alternative: amount of assets to withdraw)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { protocol, userAddress, shares, assets, vaultAddress } = body;

    // Validation
    if (!protocol) {
      return NextResponse.json({ error: "Protocol is required" }, { status: 400 });
    }

    if (protocol !== "morpho") {
      return NextResponse.json(
        { error: `Protocol ${protocol} is no longer supported. Please use the dashboard to exit.` },
        { status: 400 }
      );
    }

    if (!userAddress) {
      return NextResponse.json({ error: "User address is required" }, { status: 400 });
    }

    // SECURITY: Verify authenticated user owns the requested address
    const authResult = await requireAuthForAddress(req, userAddress);
    if (!authResult.authenticated) {
      if (authResult.error === "Address does not belong to authenticated user") {
        return forbiddenResponse(authResult.error);
      }
      return unauthorizedResponse(authResult.error);
    }

    if (!vaultAddress) {
      return NextResponse.json({ error: "Vault address is required for Morpho" }, { status: 400 });
    }

    if (!shares && !assets) {
      return NextResponse.json(
        { error: "Either shares or assets must be provided" },
        { status: 400 }
      );
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      return NextResponse.json({ error: "Invalid user address format" }, { status: 400 });
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(vaultAddress)) {
      return NextResponse.json({ error: "Invalid vault address format" }, { status: 400 });
    }

    // Convert string amounts to bigint
    const sharesBigInt = shares ? BigInt(shares) : undefined;
    const assetsBigInt = assets ? BigInt(assets) : undefined;

    console.log("Building withdrawal transaction:", {
      protocol,
      userAddress,
      shares: sharesBigInt?.toString(),
      assets: assetsBigInt?.toString(),
      vaultAddress,
    });

    let transaction;

    // Build ERC4626 redeem/withdraw transaction
    if (sharesBigInt) {
      // Redeem shares
      const data = encodeFunctionData({
        abi: ERC4626_ABI,
        functionName: "redeem",
        args: [sharesBigInt, userAddress as `0x${string}`, userAddress as `0x${string}`],
      });

      transaction = {
        to: vaultAddress,
        data,
        value: "0x0",
      };
    } else if (assetsBigInt) {
      // Withdraw assets
      const data = encodeFunctionData({
        abi: ERC4626_ABI,
        functionName: "withdraw",
        args: [assetsBigInt, userAddress as `0x${string}`, userAddress as `0x${string}`],
      });

      transaction = {
        to: vaultAddress,
        data,
        value: "0x0",
      };
    }

    if (!transaction) {
      return NextResponse.json({ error: "Failed to build transaction" }, { status: 500 });
    }

    const result = {
      id: `withdraw-${Date.now()}`,
      title: "Withdraw from Morpho Vault",
      type: "WITHDRAW",
      status: "CREATED",
      unsignedTransaction: JSON.stringify(transaction),
      stepIndex: 0,
    };

    console.log("Withdrawal transaction built successfully");

    // Return the transaction
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error building withdrawal transaction:", error);

    return NextResponse.json(
      {
        error: "Failed to build withdrawal transaction",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/withdraw
 *
 * Get withdrawal information (optional endpoint for future use)
 */
export async function GET(req: NextRequest) {
  return NextResponse.json({
    message: "Withdrawal API - use POST to build withdrawal transactions",
    supportedProtocols: ["morpho"],
    requiredFields: ["protocol", "userAddress", "vaultAddress", "shares or assets"],
  });
}
