/**
 * YO Protocol Caching Layer
 *
 * Mirrors morpho-cache.ts with yo: prefix keys.
 *
 * Cache TTLs:
 * - Vault list + APY: 5 minutes
 * - User positions: 30 seconds
 * - Best vault: 5 minutes
 */

import type { YoVault, YoUserPosition } from "@/lib/yo/types";
import { getCacheInterface } from "./client";

const CACHE_KEYS = {
  VAULTS: "yo:vaults",
  USER_POSITIONS: "yo:positions",
  BEST_VAULT: "yo:best",
};

const CACHE_TTL = {
  VAULTS: 5 * 60,
  USER_POSITIONS: 30,
  BEST_VAULT: 5 * 60,
};

/** JSON replacer that converts BigInt to tagged string for safe serialization */
function bigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? `__bigint:${value.toString()}` : value;
}

/** JSON reviver that restores tagged BigInt strings */
function bigIntReviver(_key: string, value: unknown): unknown {
  return typeof value === "string" && value.startsWith("__bigint:")
    ? BigInt(value.slice(9))
    : value;
}

function vaultsCacheKey(chainId: number, assetKey: string): string {
  return `${CACHE_KEYS.VAULTS}:${chainId}:${assetKey.toLowerCase()}`;
}

function userPositionsCacheKey(userAddress: string, chainId: number): string {
  return `${CACHE_KEYS.USER_POSITIONS}:${userAddress.toLowerCase()}:${chainId}`;
}

function bestVaultCacheKey(chainId: number, assetSymbol: string, minTvl: number): string {
  return `${CACHE_KEYS.BEST_VAULT}:${chainId}:${assetSymbol.toLowerCase()}:${minTvl}`;
}

// --- Vaults ---

export async function getCachedYoVaults(
  chainId: number,
  assetKey: string
): Promise<YoVault[] | null> {
  const cache = await getCacheInterface();
  const key = vaultsCacheKey(chainId, assetKey);
  try {
    const cached = await cache.get(key);
    if (cached) {
      const parsed = JSON.parse(cached, bigIntReviver);
      console.log("[YoCache] Hit: vaults", { chainId, assetKey, count: parsed.length });
      // Don't return stale empty arrays — force a re-fetch
      if (parsed.length === 0) return null;
      return parsed;
    }
    console.log("[YoCache] Miss: vaults", { chainId, assetKey });
    return null;
  } catch (error: any) {
    console.error("[YoCache] Error reading vaults cache:", error.message);
    return null;
  }
}

export async function setCachedYoVaults(
  chainId: number,
  assetKey: string,
  vaults: YoVault[]
): Promise<void> {
  const cache = await getCacheInterface();
  const key = vaultsCacheKey(chainId, assetKey);
  try {
    await cache.set(key, JSON.stringify(vaults, bigIntReplacer), CACHE_TTL.VAULTS);
    console.log("[YoCache] Set: vaults", { chainId, assetKey, count: vaults.length });
  } catch (error: any) {
    console.error("[YoCache] Error caching vaults:", error.message);
  }
}

// --- User Positions ---

export async function getCachedYoUserPositions(
  userAddress: string,
  chainId: number
): Promise<YoUserPosition[] | null> {
  const cache = await getCacheInterface();
  const key = userPositionsCacheKey(userAddress, chainId);
  try {
    const cached = await cache.get(key);
    if (cached) {
      console.log("[YoCache] Hit: positions", { userAddress, chainId });
      return JSON.parse(cached, bigIntReviver);
    }
    console.log("[YoCache] Miss: positions", { userAddress, chainId });
    return null;
  } catch (error: any) {
    console.error("[YoCache] Error reading positions cache:", error.message);
    return null;
  }
}

export async function setCachedYoUserPositions(
  userAddress: string,
  chainId: number,
  positions: YoUserPosition[]
): Promise<void> {
  const cache = await getCacheInterface();
  const key = userPositionsCacheKey(userAddress, chainId);
  try {
    await cache.set(key, JSON.stringify(positions, bigIntReplacer), CACHE_TTL.USER_POSITIONS);
    console.log("[YoCache] Set: positions", { userAddress, chainId, count: positions.length });
  } catch (error: any) {
    console.error("[YoCache] Error caching positions:", error.message);
  }
}

// --- Best Vault ---

export async function getCachedYoBestVault(
  chainId: number,
  assetSymbol: string,
  minTvlUsd: number
): Promise<YoVault | null> {
  const cache = await getCacheInterface();
  const key = bestVaultCacheKey(chainId, assetSymbol, minTvlUsd);
  try {
    const cached = await cache.get(key);
    if (cached) {
      console.log("[YoCache] Hit: bestVault", { chainId, assetSymbol, minTvlUsd });
      return JSON.parse(cached, bigIntReviver);
    }
    return null;
  } catch (error: any) {
    console.error("[YoCache] Error reading best vault cache:", error.message);
    return null;
  }
}

export async function setCachedYoBestVault(
  chainId: number,
  assetSymbol: string,
  minTvlUsd: number,
  vault: YoVault | null
): Promise<void> {
  const cache = await getCacheInterface();
  const key = bestVaultCacheKey(chainId, assetSymbol, minTvlUsd);
  try {
    if (vault) {
      await cache.set(key, JSON.stringify(vault, bigIntReplacer), CACHE_TTL.BEST_VAULT);
      console.log("[YoCache] Set: bestVault", { chainId, assetSymbol, vault: vault.name });
    }
  } catch (error: any) {
    console.error("[YoCache] Error caching best vault:", error.message);
  }
}

// --- Invalidation ---

export async function invalidateYoUserPositions(
  userAddress: string,
  chainId: number
): Promise<void> {
  const cache = await getCacheInterface();
  const key = userPositionsCacheKey(userAddress, chainId);
  try {
    await cache.del(key);
    console.log("[YoCache] Invalidated: positions", { userAddress, chainId });
  } catch (error: any) {
    console.error("[YoCache] Error invalidating positions:", error.message);
  }
}
