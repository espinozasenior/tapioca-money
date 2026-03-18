/**
 * GET /api/yo/rewards?address=0x...
 * Fetch claimable Merkl rewards for a user address.
 * No auth needed — read-only public Merkl data (same as pending-redeems).
 */

import { NextRequest, NextResponse } from "next/server";
import type { Address } from "viem";
import { fetchClaimableRewards } from "@/lib/yo/rewards-client";

export async function GET(request: NextRequest) {
  try {
    const addressParam = request.nextUrl.searchParams.get("address");

    if (!addressParam) {
      return NextResponse.json({ error: "Missing required query param: address" }, { status: 400 });
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(addressParam)) {
      return NextResponse.json({ error: "Invalid address format" }, { status: 400 });
    }

    const userAddress = addressParam as Address;
    const rewards = await fetchClaimableRewards(userAddress);

    return NextResponse.json({
      rewards,
      timestamp: Date.now(),
    });
  } catch (error: any) {
    console.error("[YO Rewards API] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch rewards" },
      { status: 500 }
    );
  }
}
