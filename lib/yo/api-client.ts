/**
 * YO Protocol API Client
 * Fetches vault data and user positions using the @yo-protocol/core SDK
 *
 * Uses the SDK's YoClient for all reads:
 * - getVaultSnapshot (via apiClient.fetch) for APY (native + rewards) and TVL
 *   Parses with a relaxed Zod schema to work around SDK bug (idleBalances[].raw expects string, API returns number)
 * - getVaultState() for on-chain state (totalAssets, totalSupply)
 * - getUserPosition() for user share/asset balances
 * - quotePreviewDeposit/Redeem for Gateway quotes
 *
 * Caching: Redis with yo: prefix keys (same TTLs as Morpho).
 */

import { createPublicClient, http, type Address } from "viem";
import { base } from "viem/chains";
import { z } from "zod";
import {
  createYoClient,
  vaultSnapshotSchema,
  apiResponseSchema,
  type VaultConfig,
  type VaultState,
} from "@yo-protocol/core";
import { CHAIN_CONFIG } from "@/lib/config";
import { YO_PARTNER_ID } from "./constants";
import { calculateYoRiskScore } from "./risk-scoring";
import type { YoVault, YoUserPosition } from "./types";
import {
  getCachedYoVaults,
  setCachedYoVaults,
  getCachedYoUserPositions,
  setCachedYoUserPositions,
  getCachedYoBestVault,
  setCachedYoBestVault,
} from "@/lib/redis/yo-cache";

const CHAIN_ID = CHAIN_CONFIG.chainId; // 8453 (Base)

// Relax history item validation (SDK expects strict types, API returns inconsistent data)
const relaxedHistoryItemSchema = z.object({
  type: z.string(),
  timestamp: z.number().optional(),
  assets: z.object({ raw: z.union([z.number(), z.string()]), formatted: z.string() }).optional(),
  shares: z.object({ raw: z.union([z.number(), z.string()]), formatted: z.string() }).optional(),
  txHash: z.string().optional(),
});

// Relax idleBalances validation (SDK bug: expects string for raw, API returns number)
const relaxedSnapshotSchema = vaultSnapshotSchema.extend({
  stats: vaultSnapshotSchema.shape.stats.extend({
    idleBalances: z.array(z.any()).optional(),
  }),
});

/**
 * YO Protocol Client
 */
export class YoApiClient {
  private yoClient;

  constructor() {
    const publicClient = createPublicClient({
      chain: base,
      transport: http(CHAIN_CONFIG.rpcUrl),
    });

    this.yoClient = createYoClient({
      chainId: CHAIN_ID as any,
      publicClient: publicClient as any,
      partnerId: YO_PARTNER_ID,
    });
  }

  /**
   * Get current APY (native + rewards) and TVL from the vault snapshot endpoint.
   * Uses apiClient.fetch() with a relaxed Zod schema to work around SDK bug.
   */
  private async getVaultSnapshotData(
    vaultAddress: Address
  ): Promise<{ apy: number; tvlUsd: number }> {
    const response = await this.yoClient.apiClient.fetch(
      `/api/v1/vault/${this.yoClient.network}/${vaultAddress}`
    );

    const parsed = apiResponseSchema(relaxedSnapshotSchema).parse(response);
    const snapshot = parsed.data;

    // native yield (percentage string, e.g. "5.48") → decimal (0.0548)
    const nativeApy = parseFloat(snapshot.stats.yield["30d"] ?? "0") / 100;
    // reward yield (percentage string, e.g. "14.0") → decimal (0.14)
    const rewardApy = parseFloat(snapshot.stats.rewardYield ?? "0") / 100;
    const apy = nativeApy + rewardApy;

    const tvlUsd =
      typeof snapshot.stats.tvl.raw === "number"
        ? snapshot.stats.tvl.raw
        : parseFloat(snapshot.stats.tvl.raw);

    return { apy, tvlUsd };
  }

  /**
   * Fetch all YO vaults for a given chain, optionally filtered by asset symbol.
   * Uses SDK's getVaults() for config + timeseries for APY/TVL + getVaultState() for on-chain data.
   */
  async fetchVaults(
    chainId: number,
    assetSymbol?: string,
    skipCache: boolean = false
  ): Promise<YoVault[]> {
    const cacheKey = assetSymbol || "all";

    if (!skipCache) {
      const cached = await getCachedYoVaults(chainId, cacheKey);
      if (cached) return cached;
    }

    // Get vault configs for this chain
    const vaultConfigs = this.yoClient.getVaults().filter((v: VaultConfig) => {
      if (!v.chains.includes(chainId)) return false;
      if (assetSymbol) {
        return v.underlying.symbol.toUpperCase() === assetSymbol.toUpperCase();
      }
      return true;
    });

    // Fetch APY/TVL (API) + on-chain state in parallel for each vault
    const vaults = await Promise.all(
      vaultConfigs.map(async (config: VaultConfig) => {
        try {
          const [{ apy, tvlUsd }, state] = await Promise.all([
            this.getVaultSnapshotData(config.address),
            this.yoClient.getVaultState(config.address),
          ]);

          const underlyingAddress =
            config.underlying.address[chainId as keyof typeof config.underlying.address];

          return {
            id: config.symbol,
            address: config.address,
            name: config.name,
            underlying: {
              address: underlyingAddress as Address,
              symbol: config.underlying.symbol,
              decimals: config.underlying.decimals,
            },
            apy,
            tvlUsd,
            totalAssets: state.totalAssets,
            totalShares: state.totalSupply,
          } satisfies YoVault;
        } catch (error) {
          console.warn(`[YoApiClient] Failed to fetch vault ${config.symbol}:`, error);
          return null;
        }
      })
    );

    const validVaults = vaults
      .filter((v) => v !== null)
      .filter((v) => calculateYoRiskScore(v as YoVault) <= 0.3)
      .sort((a, b) => (b as YoVault).apy - (a as YoVault).apy) as YoVault[];

    // Only cache non-empty results to avoid poisoning cache with failed fetches
    if (validVaults.length > 0) {
      await setCachedYoVaults(chainId, cacheKey, validVaults);
    }

    console.log("[YoApiClient] fetchVaults result:", {
      chainId,
      assetSymbol,
      configsFound: vaultConfigs.length,
      fetched: vaults.length,
      valid: validVaults.length,
      vaultIds: validVaults.map((v) => v.id),
    });

    return validVaults;
  }

  /**
   * Fetch user positions across all YO vaults.
   * Returns only non-zero positions.
   */
  async fetchUserPositions(
    userAddress: Address,
    chainId: number,
    skipCache: boolean = false
  ): Promise<YoUserPosition[]> {
    if (!skipCache) {
      const cached = await getCachedYoUserPositions(userAddress, chainId);
      if (cached) return cached;
    }

    const vaultConfigs = this.yoClient
      .getVaults()
      .filter((v: VaultConfig) => v.chains.includes(chainId));

    const positions: YoUserPosition[] = [];

    await Promise.all(
      vaultConfigs.map(async (config: VaultConfig) => {
        try {
          const pos = await this.yoClient.getUserPosition(config.address, userAddress);
          if (pos.shares > 0n) {
            // pos.assets is raw token amount (e.g. 3300000 for 3.30 USDC)
            // Convert directly using underlying decimals — avoids fragile share ratio math
            const assetsUsd = Number(pos.assets) / 10 ** config.underlying.decimals;

            // Fetch history + performance in parallel (both non-critical)
            // getUserHistory uses direct fetch + relaxed schema to avoid SDK Zod validation failures
            const [historyResult, perfResult] = await Promise.allSettled([
              this.yoClient.apiClient
                .fetch(
                  `/api/v1/history/user/${this.yoClient.network}/${config.address}/${userAddress}`
                )
                .then((res: any) => {
                  const parsed = apiResponseSchema(z.array(relaxedHistoryItemSchema)).parse(res);
                  return parsed.data;
                }),
              this.yoClient.getUserPerformance(config.address, userAddress),
            ]);

            let enteredAt: number | undefined;
            if (historyResult.status === "fulfilled") {
              const firstDeposit = historyResult.value
                .filter((h: any) => h.type === "deposit" && h.timestamp != null)
                .sort((a: any, b: any) => a.timestamp - b.timestamp)[0];
              if (firstDeposit) {
                // API returns Unix seconds, convert to ms
                enteredAt = firstDeposit.timestamp * 1000;
              }
            } else {
              console.warn(
                `[YoApiClient] getUserHistory failed for ${config.symbol}:`,
                historyResult.reason
              );
            }

            let unrealizedPnl: number | undefined;
            let realizedPnl: number | undefined;
            if (perfResult.status === "fulfilled") {
              const perf = perfResult.value;
              const decimals = config.underlying.decimals;
              if (perf.unrealized?.raw != null) {
                const raw =
                  typeof perf.unrealized.raw === "number"
                    ? perf.unrealized.raw
                    : parseFloat(perf.unrealized.raw);
                unrealizedPnl = raw / 10 ** decimals;
              }
              if (perf.realized?.raw != null) {
                const raw =
                  typeof perf.realized.raw === "number"
                    ? perf.realized.raw
                    : parseFloat(perf.realized.raw);
                realizedPnl = raw / 10 ** decimals;
              }
            } else {
              console.warn(
                `[YoApiClient] getUserPerformance failed for ${config.symbol}:`,
                perfResult.reason
              );
            }

            positions.push({
              vaultId: config.symbol,
              vaultAddress: config.address,
              vaultName: config.name,
              shares: pos.shares,
              assets: pos.assets,
              assetsUsd,
              enteredAt,
              unrealizedPnl,
              realizedPnl,
            });
          }
        } catch (error) {
          console.warn(`[YoApiClient] Failed to fetch position for ${config.symbol}:`, error);
        }
      })
    );

    await setCachedYoUserPositions(userAddress, chainId, positions);
    return positions;
  }

  /**
   * Fetch user's position in a specific vault
   */
  async fetchUserPosition(
    userAddress: Address,
    vaultId: string,
    chainId: number
  ): Promise<YoUserPosition | null> {
    const positions = await this.fetchUserPositions(userAddress, chainId);
    return positions.find((p) => p.vaultId === vaultId) || null;
  }

  /**
   * Find best vault for an asset by APY
   */
  async findBestVault(
    chainId: number,
    assetSymbol: string,
    minTvlUsd: number = 100_000,
    skipCache: boolean = false
  ): Promise<YoVault | null> {
    if (!skipCache) {
      const cached = await getCachedYoBestVault(chainId, assetSymbol, minTvlUsd);
      if (cached) return cached;
    }

    const vaults = await this.fetchVaults(chainId, assetSymbol, skipCache);
    const eligible = vaults.filter((v) => v.tvlUsd >= minTvlUsd);
    const best = eligible.length > 0 ? eligible[0] : null; // Already sorted by APY desc

    await setCachedYoBestVault(chainId, assetSymbol, minTvlUsd, best);
    return best;
  }

  /**
   * Preview deposit on Gateway (for slippage calculation)
   */
  async previewDeposit(vaultAddress: Address, amount: bigint): Promise<bigint> {
    return this.yoClient.quotePreviewDeposit(vaultAddress, amount);
  }

  /**
   * Preview redeem on Gateway (for slippage calculation)
   */
  async previewRedeem(vaultAddress: Address, shares: bigint): Promise<bigint> {
    return this.yoClient.quotePreviewRedeem(vaultAddress, shares);
  }
}

/**
 * Singleton instance
 */
export const yoApiClient = new YoApiClient();
