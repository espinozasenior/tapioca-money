import { NextRequest, NextResponse } from "next/server";
import type { Address } from "viem";
import { yoApiClient } from "@/lib/yo/api-client";
import { YO_VAULTS } from "@/lib/yo/constants";
import { CHAIN_CONFIG } from "@/lib/config";
import { checkAndRecordRateLimit } from "@/lib/redis/rate-limiter";

export async function GET(request: NextRequest) {
  try {
    const addressParam = request.nextUrl.searchParams.get("address");

    if (!addressParam) {
      return NextResponse.json({ error: "Missing required query param: address" }, { status: 400 });
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(addressParam)) {
      return NextResponse.json({ error: "Invalid address format" }, { status: 400 });
    }

    // Rate limit: 30 requests per minute per address
    const rateLimit = await checkAndRecordRateLimit(addressParam, {
      maxRequests: 30,
      windowMs: 60_000,
      keyPrefix: "ratelimit:pending-redeems",
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: rateLimit.reason || "Rate limit exceeded" },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter ?? 60) } }
      );
    }

    const userAddress = addressParam as Address;
    const chainVaults = Object.values(YO_VAULTS).filter((vault) =>
      vault.chains.includes(CHAIN_CONFIG.chainId)
    );

    const pendingResults = await Promise.all(
      chainVaults.map(async (vault) => {
        const pending = await yoApiClient.fetchPendingRedemptions(vault.address, userAddress);
        return {
          vaultId: vault.symbol,
          vaultAddress: vault.address,
          pendingAssets: pending.pendingAssets.toString(),
          pendingShares: pending.pendingShares.toString(),
        };
      })
    );

    const pendingRedeems = pendingResults.filter(
      (entry) => BigInt(entry.pendingAssets) > 0n || BigInt(entry.pendingShares) > 0n
    );

    return NextResponse.json({
      pendingRedeems,
      timestamp: Date.now(),
    });
  } catch (error: any) {
    console.error("[YO Pending Redeems API] Error:", error);
    return NextResponse.json({ error: "Failed to fetch pending redeems" }, { status: 500 });
  }
}
