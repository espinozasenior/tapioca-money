/**
 * Morpho Blue API Client
 * Official GraphQL API: https://api.morpho.org/graphql
 * Documentation: https://docs.morpho.org/tools/offchain/api/
 *
 * Rate Limits: 5000 requests per 5 minutes
 *
 * Caching: Uses Redis to cache responses and reduce API calls
 * - Vault list: 5 min TTL
 * - User positions: 30 sec TTL
 * - Results in 99% API call reduction (20,000 → 20 per cron cycle)
 */

import {
  getCachedVaults,
  setCachedVaults,
  getCachedUserPositions,
  setCachedUserPositions,
  getCachedBestVault,
  setCachedBestVault,
} from "@/lib/redis/morpho-cache";
import type {
  GetVaultsQuery,
  GetVaultQuery,
  GetUserPositionsQuery,
  GetVaultsQueryVariables,
  GetVaultQueryVariables,
  GetUserPositionsQueryVariables,
} from "./graphql-types";
import { GET_VAULTS, GET_VAULT, GET_USER_POSITIONS, GET_USER_FIRST_DEPOSIT } from "./queries";
import { calculateRiskScore } from "./risk-scoring";
import { print } from "graphql";
import { base } from "viem/chains";

const MORPHO_API_URL = "https://api.morpho.org/graphql";

// Extract types from the generated query types
export type MorphoVault = NonNullable<NonNullable<GetVaultsQuery["vaultV2s"]["items"]>[number]>;
export type MorphoUserPosition = NonNullable<
  NonNullable<NonNullable<GetUserPositionsQuery["userByAddress"]>["vaultV2Positions"]>[number]
> & { enteredAt?: number };

/**
 * Morpho GraphQL API Client
 */
export class MorphoClient {
  private apiUrl: string;
  private entryTimeCache = new Map<string, number>();

  constructor(apiUrl: string = MORPHO_API_URL) {
    this.apiUrl = apiUrl;
  }

  /**
   * Execute GraphQL query against Morpho API
   */
  private async query<T>(query: string, variables?: Record<string, any>): Promise<T> {
    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Morpho API Error Body: ${errorBody}`);
      throw new Error(`Morpho API error: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const result = await response.json();

    if (result.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data;
  }

  /**
   * Fetch all vaults for a specific chain and asset
   * Uses Redis cache (5 min TTL) to reduce API calls
   *
   * @param chainId - Chain ID (e.g., 8453 for Base)
   * @param assetSymbol - Asset symbol (e.g., "USDC", "WETH")
   * @param first - Number of vaults to fetch (default: 50)
   * @param skipCache - Bypass cache (default: false)
   * @returns Array of Morpho vaults sorted by APY descending
   */
  async fetchVaults(
    chainId: number,
    assetSymbol: string,
    first: number = 50,
    skipCache: boolean = false
  ): Promise<MorphoVault[]> {
    // Check cache first
    if (!skipCache) {
      const cached = await getCachedVaults(chainId, assetSymbol);
      if (cached) {
        return cached;
      }
    }

    const data = await this.query<GetVaultsQuery>(print(GET_VAULTS), {
      chainId,
      first,
    } as GetVaultsQueryVariables);

    // Filter by asset symbol and apply risk gate (score <= 0.3 = low risk only)
    const vaults = (data.vaultV2s.items ?? []).filter(
      (vault) =>
        vault.asset.symbol.toUpperCase() === assetSymbol.toUpperCase() &&
        calculateRiskScore(vault) <= 0.3
    );

    // Cache the result
    await setCachedVaults(chainId, assetSymbol, vaults);

    return vaults;
  }

  /**
   * Fetch a single vault by address
   *
   * @param vaultAddress - Vault contract address
   * @param chainId - Chain ID
   * @returns Vault details or null if not found
   */
  async fetchVault(vaultAddress: string, chainId: number): Promise<MorphoVault | null> {
    const data = await this.query<GetVaultQuery>(print(GET_VAULT), {
      address: vaultAddress.toLowerCase(),
      chainId,
    } as GetVaultQueryVariables);

    return data.vaultV2ByAddress || null;
  }

  /**
   * Fetch entry time for a user's position using GraphQL
   */
  async getEntryTime(userAddress: string, vaultAddress: string): Promise<number> {
    const cacheKey = `${userAddress.toLowerCase()}-${vaultAddress.toLowerCase()}`;
    if (this.entryTimeCache.has(cacheKey)) {
      return this.entryTimeCache.get(cacheKey)!;
    }

    try {
      const data = await this.query<any>(print(GET_USER_FIRST_DEPOSIT), {
        userAddress: userAddress.toLowerCase(),
        vaultAddress: vaultAddress.toLowerCase(),
        chainId: base.id,
      });

      const items = data.vaultV2transactions?.items;
      if (items && items.length > 0) {
        const timestamp = Number(items[0].timestamp) * 1000;
        this.entryTimeCache.set(cacheKey, timestamp);
        return timestamp;
      }
    } catch (error) {
      console.warn(`Failed to fetch entry time for ${userAddress} in ${vaultAddress}:`, error);
    }

    // Default to now if no history found or error
    const now = Date.now();
    this.entryTimeCache.set(cacheKey, now);
    return now;
  }

  /**
   * Fetch user's positions across all vaults
   * Uses Redis cache (30 sec TTL) for fresher position data
   *
   * @param userAddress - User wallet address
   * @param chainId - Chain ID
   * @param skipCache - Bypass cache (default: false)
   * @returns Array of user positions
   */
  async fetchUserPositions(
    userAddress: string,
    chainId: number,
    skipCache: boolean = false
  ): Promise<MorphoUserPosition[]> {
    // Check cache first
    if (!skipCache) {
      const cached = await getCachedUserPositions(userAddress, chainId);
      if (cached) {
        return cached;
      }
    }

    const data = await this.query<GetUserPositionsQuery>(print(GET_USER_POSITIONS), {
      userAddress: userAddress.toLowerCase(),
      chainId,
    } as GetUserPositionsQueryVariables);

    const allPositions = data.userByAddress?.vaultV2Positions ?? [];
    const positions = allPositions.filter(
      (pos) => BigInt(pos.shares) > 0n // Only return positions with shares
    );

    // Enrich with position metrics (in parallel)
    const enrichedPositions: MorphoUserPosition[] = await Promise.all(
      positions.map(async (pos) => {
        const enteredAt = await this.getEntryTime(userAddress, pos.vault.address);
        return {
          ...pos,
          enteredAt,
        };
      })
    );

    // Cache the result
    await setCachedUserPositions(userAddress, chainId, enrichedPositions);

    return enrichedPositions;
  }

  /**
   * Fetch user's position in a specific vault
   *
   * @param userAddress - User wallet address
   * @param vaultAddress - Vault contract address
   * @param chainId - Chain ID
   * @returns User position or null if none
   */
  async fetchUserPosition(
    userAddress: string,
    vaultAddress: string,
    chainId: number
  ): Promise<MorphoUserPosition | null> {
    const positions = await this.fetchUserPositions(userAddress, chainId);
    return (
      positions.find((pos) => pos.vault.address.toLowerCase() === vaultAddress.toLowerCase()) ||
      null
    );
  }

  /**
   * Find best vault for an asset by APY
   * Uses Redis cache (5 min TTL) for best vault recommendation
   *
   * @param chainId - Chain ID
   * @param assetSymbol - Asset symbol
   * @param minLiquidityUsd - Minimum liquidity in USD (default: 100k)
   * @param skipCache - Bypass cache (default: false)
   * @returns Best vault or null if none found
   */
  async findBestVault(
    chainId: number,
    assetSymbol: string,
    minLiquidityUsd: number = 100_000,
    skipCache: boolean = false
  ): Promise<MorphoVault | null> {
    // Check cache first
    if (!skipCache) {
      const cached = await getCachedBestVault(chainId, assetSymbol, minLiquidityUsd);
      if (cached) {
        return cached;
      }
    }

    const vaults = await this.fetchVaults(chainId, assetSymbol, 50, skipCache);

    // Filter by minimum liquidity
    const eligibleVaults = vaults.filter((vault) => (vault.totalAssetsUsd ?? 0) >= minLiquidityUsd);

    // Return highest APY vault
    const bestVault = eligibleVaults.length > 0 ? eligibleVaults[0] : null;

    // Cache the result
    await setCachedBestVault(chainId, assetSymbol, minLiquidityUsd, bestVault);

    return bestVault;
  }
}

/**
 * Singleton instance for convenience
 */
export const morphoClient = new MorphoClient();
