/**
 * YO Protocol Rewards Client
 * Fetches claimable Merkl rewards via YO SDK with caching layer.
 */

import { createPublicClient, http, formatUnits, type Address } from "viem";
import { base } from "viem/chains";
import { createYoClient } from "@yo-protocol/core";
import { CHAIN_CONFIG } from "@/lib/config";
import { YO_PARTNER_ID } from "./constants";
import type { YoClaimableRewards, YoRewardToken } from "./types";
import { getCachedYoRewards, setCachedYoRewards } from "@/lib/redis/yo-cache";

const CHAIN_ID = CHAIN_CONFIG.chainId;

/**
 * Fetch claimable Merkl rewards for a user address.
 * Returns null if no rewards are available.
 * Results are cached for 60 seconds.
 */
export async function fetchClaimableRewards(
  userAddress: Address,
  skipCache = false
): Promise<YoClaimableRewards | null> {
  // 1. Check cache
  if (!skipCache) {
    const cached = await getCachedYoRewards(userAddress, CHAIN_ID);
    if (cached) return cached;
  }

  // 2. Create read-only YO client
  const publicClient = createPublicClient({
    chain: base,
    transport: http(CHAIN_CONFIG.rpcUrl),
  });

  const yoClient = createYoClient({
    chainId: CHAIN_ID as any,
    publicClient: publicClient as any,
    partnerId: YO_PARTNER_ID,
  });

  // 3. Fetch from SDK (merges Merkl API + on-chain claimed amounts)
  const chainRewards = await yoClient.getClaimableRewards(userAddress);
  if (!chainRewards || !yoClient.hasMerklClaimableRewards(chainRewards)) {
    return null;
  }

  // 4. Map rewards — filter out zero-claimable tokens
  const tokens: YoRewardToken[] = [];
  for (const reward of chainRewards.rewards || []) {
    const claimable = yoClient.getMerklClaimableAmount(reward);
    if (claimable > 0n) {
      tokens.push({
        address: reward.token.address as Address,
        symbol: reward.token.symbol,
        decimals: reward.token.decimals,
        claimable: claimable.toString(),
        claimableFormatted: formatUnits(claimable, reward.token.decimals),
        claimed: (reward.claimed || "0").toString(),
      });
    }
  }

  if (tokens.length === 0) return null;

  const totalClaimable = yoClient.getMerklTotalClaimable(chainRewards);

  const result: YoClaimableRewards = {
    chainId: CHAIN_ID,
    tokens,
    totalClaimable: totalClaimable.toString(),
    totalClaimableFormatted: formatUnits(totalClaimable, 18), // $YO is 18 decimals
    hasClaimable: true,
    totalClaimableUsd: null, // $YO non-transferable, no USD price
    rawChainRewards: chainRewards,
  };

  // 5. Cache
  await setCachedYoRewards(userAddress, CHAIN_ID, result);
  return result;
}
