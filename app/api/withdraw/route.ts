import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { buildWithdrawTransaction } from "@/lib/yield-optimizer/executor";
import { CHAIN_CONFIG } from "@/lib/yield-optimizer/config";

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
      return NextResponse.json(
        { error: "Protocol is required" },
        { status: 400 }
      );
    }

    if (!userAddress) {
      return NextResponse.json(
        { error: "User address is required" },
        { status: 400 }
      );
    }

    if (!shares && !assets) {
      return NextResponse.json(
        { error: "Either shares or assets must be provided" },
        { status: 400 }
      );
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      return NextResponse.json(
        { error: "Invalid user address format" },
        { status: 400 }
      );
    }

    if (vaultAddress && !/^0x[a-fA-F0-9]{40}$/.test(vaultAddress)) {
      return NextResponse.json(
        { error: "Invalid vault address format" },
        { status: 400 }
      );
    }

    // Convert string amounts to bigint
    const sharesBigInt = shares ? BigInt(shares) : undefined;
    const assetsBigInt = assets ? BigInt(assets) : undefined;

    console.log("Building withdrawal transaction:", {
      protocol,
      userAddress,
      shares: sharesBigInt?.toString(),
      assets: assetsBigInt?.toString(),
    });

    // Build withdrawal transaction
    const result = await buildWithdrawTransaction(
      protocol,
      userAddress as `0x${string}`,
      sharesBigInt,
      assetsBigInt,
      vaultAddress as `0x${string}` | undefined
    );

    if (result.transactions.length === 0) {
      return NextResponse.json(
        { error: "No transactions generated. Withdrawal may not be available for this protocol." },
        { status: 400 }
      );
    }

    console.log("Withdrawal transaction built successfully:", {
      transactionCount: result.transactions.length,
      protocol,
    });

    // Return the first transaction (withdrawals are single-step)
    return NextResponse.json(result.transactions[0]);

  } catch (error: any) {
    console.error("Error building withdrawal transaction:", error);
    
    return NextResponse.json(
      { 
        error: error.message || "Failed to build withdrawal transaction",
        details: process.env.NODE_ENV === "development" ? error.stack : undefined
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
    supportedProtocols: ["morpho", "aave"],
    requiredFields: ["protocol", "userAddress", "shares or assets"],
  });
}
