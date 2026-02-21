import { NextRequest, NextResponse } from "next/server";
import { MorphoClient } from "@/lib/morpho/api-client";
import { MorphoVault } from "@/lib/morpho/api-client";

/**
 * GET /api/morpho/vaults
 * Fetch Morpho vaults from GraphQL API
 *
 * Query params:
 * - chain: Chain ID (e.g., 8453 for Base)
 * - asset: Asset symbol (e.g., USDC)
 * - limit: Number of vaults to return (default: 20)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const chain = parseInt(searchParams.get("chain") || "8453");
    const asset = searchParams.get("asset") || "USDC";
    const limit = parseInt(searchParams.get("limit") || "20");

    if (!chain || !asset) {
      return NextResponse.json(
        { error: "Missing required parameters: chain, asset" },
        { status: 400 }
      );
    }

    // Fetch vaults from Morpho API
    const morphoClient = new MorphoClient();
    const vaults = await morphoClient.fetchVaults(chain, asset, limit);

    // Filter for high-quality vaults (min $100k liquidity)
    const filteredVaults = vaults.filter((vault) => (vault.totalAssetsUsd ?? 0) >= 100_000);

    return NextResponse.json({
      vaults: filteredVaults,
      count: filteredVaults.length,
      chain,
      asset,
    });
  } catch (error: any) {
    console.error("[Morpho Vaults API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch Morpho vaults",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
