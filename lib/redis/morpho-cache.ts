/**
 * Morpho API Caching Layer
 *
 * Caches Morpho API responses to reduce API calls from ~20,000 to ~20 per cron cycle.
 *
 * Cache TTLs:
 * - Vault list + APY: 5 minutes (changes slowly)
 * - User positions: 30 seconds (needs fresher data)
 *
 * Rate limit: Morpho API allows 5000 requests per 5 minutes
 * With caching: ~20 requests per cycle instead of 20,000
 */

import type { MorphoVault, MorphoUserPosition } from "@/lib/morpho/api-client";
import { getCacheInterface } from "./client";

// Cache key prefixes
const CACHE_KEYS = {
  VAULTS: "morpho:vaults",
  USER_POSITIONS: "morpho:positions",
  BEST_VAULT: "morpho:best",
};

// Cache TTLs in seconds
const CACHE_TTL = {
  VAULTS: 5 * 60, // 5 minutes - vault list changes slowly
  USER_POSITIONS: 30, // 30 seconds - user positions need fresher data
  BEST_VAULT: 5 * 60, // 5 minutes - best vault recommendation
};

/**
 * Build cache key for vault list
 */
function vaultsCacheKey(chainId: number, assetSymbol: string): string {
  return `${CACHE_KEYS.VAULTS}:${chainId}:${assetSymbol.toLowerCase()}`;
}

/**
 * Build cache key for user positions
 */
function userPositionsCacheKey(userAddress: string, chainId: number): string {
  return `${CACHE_KEYS.USER_POSITIONS}:${userAddress.toLowerCase()}:${chainId}`;
}

/**
 * Build cache key for best vault
 */
function bestVaultCacheKey(chainId: number, assetSymbol: string, minLiquidity: number): string {
  return `${CACHE_KEYS.BEST_VAULT}:${chainId}:${assetSymbol.toLowerCase()}:${minLiquidity}`;
}

/**
 * Get cached vaults or null if not cached/expired
 */
export async function getCachedVaults(
  chainId: number,
  assetSymbol: string
): Promise<MorphoVault[] | null> {
  const cache = await getCacheInterface();
  const key = vaultsCacheKey(chainId, assetSymbol);

  try {
    const cached = await cache.get(key);
    if (cached) {
      console.log("[MorphoCache] Hit: vaults", { chainId, assetSymbol });
      return JSON.parse(cached);
    }
    console.log("[MorphoCache] Miss: vaults", { chainId, assetSymbol });
    return null;
  } catch (error: any) {
    console.error("[MorphoCache] Error reading vaults cache:", error.message);
    return null;
  }
}

/**
 * Cache vaults
 */
export async function setCachedVaults(
  chainId: number,
  assetSymbol: string,
  vaults: MorphoVault[]
): Promise<void> {
  const cache = await getCacheInterface();
  const key = vaultsCacheKey(chainId, assetSymbol);

  try {
    await cache.set(key, JSON.stringify(vaults), CACHE_TTL.VAULTS);
    console.log("[MorphoCache] Set: vaults", {
      chainId,
      assetSymbol,
      count: vaults.length,
    });
  } catch (error: any) {
    console.error("[MorphoCache] Error caching vaults:", error.message);
  }
}

/**
 * Get cached user positions or null if not cached/expired
 */
export async function getCachedUserPositions(
  userAddress: string,
  chainId: number
): Promise<MorphoUserPosition[] | null> {
  const cache = await getCacheInterface();
  const key = userPositionsCacheKey(userAddress, chainId);

  try {
    const cached = await cache.get(key);
    if (cached) {
      console.log("[MorphoCache] Hit: positions", { userAddress, chainId });
      return JSON.parse(cached);
    }
    console.log("[MorphoCache] Miss: positions", { userAddress, chainId });
    return null;
  } catch (error: any) {
    console.error("[MorphoCache] Error reading positions cache:", error.message);
    return null;
  }
}

/**
 * Cache user positions
 */
export async function setCachedUserPositions(
  userAddress: string,
  chainId: number,
  positions: MorphoUserPosition[]
): Promise<void> {
  const cache = await getCacheInterface();
  const key = userPositionsCacheKey(userAddress, chainId);

  try {
    await cache.set(key, JSON.stringify(positions), CACHE_TTL.USER_POSITIONS);
    console.log("[MorphoCache] Set: positions", {
      userAddress,
      chainId,
      count: positions.length,
    });
  } catch (error: any) {
    console.error("[MorphoCache] Error caching positions:", error.message);
  }
}

/**
 * Get cached best vault or null if not cached/expired
 */
export async function getCachedBestVault(
  chainId: number,
  assetSymbol: string,
  minLiquidityUsd: number
): Promise<MorphoVault | null> {
  const cache = await getCacheInterface();
  const key = bestVaultCacheKey(chainId, assetSymbol, minLiquidityUsd);

  try {
    const cached = await cache.get(key);
    if (cached) {
      console.log("[MorphoCache] Hit: bestVault", {
        chainId,
        assetSymbol,
        minLiquidityUsd,
      });
      return JSON.parse(cached);
    }
    return null;
  } catch (error: any) {
    console.error("[MorphoCache] Error reading best vault cache:", error.message);
    return null;
  }
}

/**
 * Cache best vault
 */
export async function setCachedBestVault(
  chainId: number,
  assetSymbol: string,
  minLiquidityUsd: number,
  vault: MorphoVault | null
): Promise<void> {
  const cache = await getCacheInterface();
  const key = bestVaultCacheKey(chainId, assetSymbol, minLiquidityUsd);

  try {
    if (vault) {
      await cache.set(key, JSON.stringify(vault), CACHE_TTL.BEST_VAULT);
      console.log("[MorphoCache] Set: bestVault", {
        chainId,
        assetSymbol,
        vault: vault.name,
      });
    }
  } catch (error: any) {
    console.error("[MorphoCache] Error caching best vault:", error.message);
  }
}

/**
 * Invalidate user positions cache (call after rebalance)
 */
export async function invalidateUserPositions(userAddress: string, chainId: number): Promise<void> {
  const cache = await getCacheInterface();
  const key = userPositionsCacheKey(userAddress, chainId);

  try {
    await cache.del(key);
    console.log("[MorphoCache] Invalidated: positions", { userAddress, chainId });
  } catch (error: any) {
    console.error("[MorphoCache] Error invalidating positions:", error.message);
  }
}

/**
 * Invalidate all caches for a chain (e.g., after major protocol update)
 */
export async function invalidateChainCache(chainId: number): Promise<void> {
  // Note: This is a simple implementation. In production, you might want to
  // use Redis SCAN to find and delete all keys matching the pattern.
  console.log("[MorphoCache] Chain cache invalidation requested for", chainId);
  // Implementation would require Redis SCAN command
}
