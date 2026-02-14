/**
 * DeFi Llama Yields API Client
 * Endpoint: https://yields.llama.fi/pools
 * Documentation: https://defillama.com/docs/api
 *
 * Fetches APY/TVL data for Aave V3 and Moonwell on Base.
 * Mirrors the Morpho GraphQL pattern in lib/morpho/api-client.ts —
 * API-based data fetching with Redis caching.
 *
 * Caching: Uses Redis (or in-memory fallback) with 5 min TTL
 */

import { getCacheInterface } from "@/lib/redis/client";

const DEFI_LLAMA_POOLS_URL = "https://yields.llama.fi/pools";
const CACHE_KEY = "defillama:yields:base";
const CACHE_TTL_SECONDS = 5 * 60; // 5 minutes

const TARGET_PROJECTS = ["aave-v3", "moonwell-apollo"] as const;

export interface DefiLlamaPool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number;
  apyBase: number | null;
  apyReward: number | null;
  underlyingTokens: string[] | null;
  rewardTokens: string[] | null;
}

/**
 * Fetch DeFi Llama yield pools filtered for Base chain protocols.
 * Results are cached in Redis with a 5-minute TTL.
 *
 * @returns Filtered pools for Aave V3 and Moonwell on Base
 */
async function fetchDefiLlamaYields(): Promise<DefiLlamaPool[]> {
  try {
    // Check cache first
    const cache = await getCacheInterface();
    const cached = await cache.get(CACHE_KEY);

    if (cached) {
      return JSON.parse(cached) as DefiLlamaPool[];
    }

    // Fetch from DeFi Llama
    const response = await fetch(DEFI_LLAMA_POOLS_URL);

    if (!response.ok) {
      console.error(
        `[DefiLlama] API error: ${response.status} ${response.statusText}`
      );
      return [];
    }

    const data = await response.json();
    const allPools: DefiLlamaPool[] = data.data ?? [];

    // Filter for Base chain and target projects
    const filteredPools = allPools.filter(
      (pool) =>
        pool.chain === "Base" &&
        TARGET_PROJECTS.includes(pool.project as (typeof TARGET_PROJECTS)[number])
    );

    // Cache the result
    await cache.set(CACHE_KEY, JSON.stringify(filteredPools), CACHE_TTL_SECONDS);

    return filteredPools;
  } catch (error) {
    console.error("[DefiLlama] Failed to fetch yields:", error);
    return [];
  }
}

/**
 * Get Aave V3 USDC pool APY and TVL on Base.
 * APY is converted from percentage to decimal (e.g., 5.2% -> 0.052)
 * since our YieldOpportunity type uses decimal format.
 *
 * @returns { apy, tvlUsd } or null if not found
 */
export async function getAaveUsdcPool(): Promise<{
  apy: number;
  tvlUsd: number;
} | null> {
  try {
    const pools = await fetchDefiLlamaYields();

    const aaveUsdc = pools.find(
      (pool) =>
        pool.project === "aave-v3" &&
        pool.symbol.toUpperCase().includes("USDC")
    );

    if (!aaveUsdc) {
      console.warn("[DefiLlama] Aave V3 USDC pool not found on Base");
      return null;
    }

    return {
      apy: aaveUsdc.apy / 100, // Convert percentage to decimal
      tvlUsd: aaveUsdc.tvlUsd,
    };
  } catch (error) {
    console.error("[DefiLlama] Failed to get Aave USDC pool:", error);
    return null;
  }
}

/**
 * Get Moonwell USDC pool APY and TVL on Base.
 * APY is converted from percentage to decimal (e.g., 4.2% -> 0.042)
 * since our YieldOpportunity type uses decimal format.
 *
 * @returns { apy, tvlUsd } or null if not found
 */
export async function getMoonwellUsdcPool(): Promise<{
  apy: number;
  tvlUsd: number;
} | null> {
  try {
    const pools = await fetchDefiLlamaYields();

    const moonwellUsdc = pools.find(
      (pool) =>
        pool.project === "moonwell-apollo" &&
        pool.symbol.toUpperCase().includes("USDC")
    );

    if (!moonwellUsdc) {
      console.warn("[DefiLlama] Moonwell USDC pool not found on Base");
      return null;
    }

    return {
      apy: moonwellUsdc.apy / 100, // Convert percentage to decimal
      tvlUsd: moonwellUsdc.tvlUsd,
    };
  } catch (error) {
    console.error("[DefiLlama] Failed to get Moonwell USDC pool:", error);
    return null;
  }
}
