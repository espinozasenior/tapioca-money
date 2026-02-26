/**
 * GET /api/yo/vaults
 * Fetch YO Protocol vaults with APY and TVL data
 */

import { NextRequest, NextResponse } from "next/server";
import { yoApiClient } from "@/lib/yo/api-client";
import { transformYoVaultToOpportunity } from "@/lib/yo/transforms";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const chainId = Number(searchParams.get("chain") || "8453");
    const asset = searchParams.get("asset") || undefined;

    const vaults = await yoApiClient.fetchVaults(chainId, asset);
    const opportunities = vaults.map(transformYoVaultToOpportunity);

    return NextResponse.json({ vaults: opportunities, timestamp: Date.now() });
  } catch (error: any) {
    console.error("[YO Vaults API] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch YO vaults" },
      { status: 500 }
    );
  }
}
