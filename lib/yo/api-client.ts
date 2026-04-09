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

import { type Address, erc4626Abi } from "viem";
import { baseClient } from "@/lib/shared/rpc-client";
import { z } from "zod";
import {
  createYoClient,
  vaultSnapshotSchema,
  apiResponseSchema,
  type VaultConfig,
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
// Also add merklRewardYield — the API moved reward APY from rewardYield to merklRewardYield
const relaxedSnapshotSchema = vaultSnapshotSchema.extend({
  stats: vaultSnapshotSchema.shape.stats.extend({
    idleBalances: z.array(z.any()).optional(),
    merklRewardYield: z.string().nullable().optional(),
  }),
});

/**
 * YO Protocol Client
 */
export class YoApiClient {
  private publicClient: any;
  private yoClient;

  constructor() {
    this.publicClient = baseClient;

    this.yoClient = createYoClient({
      chainId: CHAIN_ID as any,
      publicClient: this.publicClient as any,
      partnerId: YO_PARTNER_ID,
    });
  }

  /**
   * Get current APY (native + rewards) and TVL from the vault snapshot endpoint.
   * Uses apiClient.fetch() with a relaxed Zod schema to work around SDK bug.
   */
  private async getVaultSnapshotData(
    vaultAddress: Address,
    underlyingDecimals: number = 6
  ): Promise<{ apy: number; nativeApy: number; rewardApy: number; tvlUsd: number }> {
    const response = await this.yoClient.apiClient.fetch(
      `/api/v1/vault/${this.yoClient.network}/${vaultAddress}`
    );

    const parsed = apiResponseSchema(relaxedSnapshotSchema).parse(response);
    const snapshot = parsed.data;

    // native yield (percentage string, e.g. "5.48") → decimal (0.0548)
    const nativeApy = parseFloat(snapshot.stats.yield["30d"] ?? "0") / 100;
    // reward yield: API moved from rewardYield → merklRewardYield (percentage string, e.g. "10")
    const rewardApy =
      parseFloat(snapshot.stats.merklRewardYield ?? snapshot.stats.rewardYield ?? "0") / 100;
    const apy = nativeApy + rewardApy;

    // tvl.raw is in token smallest units (e.g. USDC = 6 decimals), convert to USD
    const tvlRaw =
      typeof snapshot.stats.tvl.raw === "number"
        ? snapshot.stats.tvl.raw
        : parseFloat(snapshot.stats.tvl.raw);
    const tvlUsd = tvlRaw / 10 ** underlyingDecimals;

    return { apy, nativeApy, rewardApy, tvlUsd };
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

    // Batch all on-chain reads (totalAssets + totalSupply) into a single multicall3 RPC call.
    // This replaces N individual getVaultState() calls (each making 6-8 readContract calls)
    // with one multicall, cutting RPC round trips from ~8N to 1.
    const multicallContracts = vaultConfigs.flatMap((config: VaultConfig) => [
      {
        address: config.address,
        abi: erc4626Abi,
        functionName: "totalAssets" as const,
      },
      {
        address: config.address,
        abi: erc4626Abi,
        functionName: "totalSupply" as const,
      },
    ]);

    const [multicallResults, snapshotResults] = await Promise.all([
      // Single RPC call for all vault on-chain state
      this.publicClient.multicall({
        contracts: multicallContracts,
        allowFailure: true,
      }),
      // API calls in parallel (HTTP, not RPC — can't batch these)
      Promise.all(
        vaultConfigs.map(async (config: VaultConfig) => {
          try {
            return await this.getVaultSnapshotData(config.address, config.underlying.decimals);
          } catch (error) {
            console.warn(`[YoApiClient] Snapshot fetch failed for ${config.symbol}:`, error);
            return null;
          }
        })
      ),
    ]);

    // Assemble vault objects from multicall + snapshot results
    const vaults = vaultConfigs.map((config: VaultConfig, i: number) => {
      try {
        const snapshot = snapshotResults[i];
        if (!snapshot) return null;

        // Each vault has 2 multicall entries: [totalAssets, totalSupply]
        const totalAssetsResult = multicallResults[i * 2];
        const totalSupplyResult = multicallResults[i * 2 + 1];

        // If either on-chain read failed, skip this vault
        if (totalAssetsResult.status === "failure" || totalSupplyResult.status === "failure") {
          console.warn(
            `[YoApiClient] Multicall failed for ${config.symbol}:`,
            totalAssetsResult.status === "failure"
              ? totalAssetsResult.error
              : totalSupplyResult.error
          );
          return null;
        }

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
          apy: snapshot.apy,
          nativeApy: snapshot.nativeApy,
          rewardApy: snapshot.rewardApy,
          tvlUsd: snapshot.tvlUsd,
          totalAssets: totalAssetsResult.result as bigint,
          totalShares: totalSupplyResult.result as bigint,
        } satisfies YoVault;
      } catch (error) {
        console.warn(`[YoApiClient] Failed to process vault ${config.symbol}:`, error);
        return null;
      }
    });

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
    options?: { skipCache?: boolean; includeHistory?: boolean }
  ): Promise<YoUserPosition[]> {
    const skipCache = options?.skipCache ?? false;
    const includeHistory = options?.includeHistory ?? true;

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

            let enteredAt: number | undefined;
            let unrealizedPnl: number | undefined;
            let realizedPnl: number | undefined;

            // History + performance data is non-critical for the optimizer hot path.
            // Skip when includeHistory=false to save 60-120ms per position.
            if (includeHistory) {
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

  /**
   * Read pending redemption amounts for a user in a specific YO vault.
   */
  async fetchPendingRedemptions(
    vaultAddress: Address,
    userAddress: Address
  ): Promise<{ pendingAssets: bigint; pendingShares: bigint }> {
    try {
      const pending = await this.yoClient.getPendingRedemptions(vaultAddress, userAddress);
      const pendingAssets = BigInt(pending.assets?.raw ?? 0);
      const pendingShares = BigInt(pending.shares?.raw ?? 0);

      return { pendingAssets, pendingShares };
    } catch (error: any) {
      console.warn("[YoApiClient] getPendingRedemptions failed:", error);
      return { pendingAssets: 0n, pendingShares: 0n };
    }
  }
}

/**
 * Singleton instance
 */
export const yoApiClient = new YoApiClient();
