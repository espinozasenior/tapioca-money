import { MorphoClient, type MorphoVault, type MorphoUserPosition } from "../morpho/api-client";
import { YoApiClient, yoApiClient } from "../yo/api-client";
import type { YoVault, YoUserPosition } from "../yo/types";
import { CHAIN_CONFIG, REBALANCE_THRESHOLDS, USDC_ADDRESS, getTokenByAddress } from "../config";
import { PauseService } from "../shared/pause-service";

const CHAIN_ID = CHAIN_CONFIG.chainId;
const MORPHO_ASSET_SYMBOL = "USDC"; // Morpho vaults remain USDC-only on Base

export type Protocol = "morpho" | "yo";

export interface RebalanceDecision {
  shouldRebalance: boolean;
  reason: string;
  currentVault: {
    address: `0x${string}`;
    name: string;
    apy: number;
    shares: string;
    assets: string;
    protocol: Protocol;
    underlyingAddress?: `0x${string}`;
    underlyingSymbol?: string;
  } | null;
  targetVault: {
    address: `0x${string}`;
    name: string;
    apy: number;
    liquidityUsd: number;
    protocol: Protocol;
    underlyingAddress?: `0x${string}`;
    underlyingSymbol?: string;
  } | null;
  apyImprovement: number;
  estimatedAnnualGain: number;
  breakEvenDays: number;
}

/**
 * Yield Decision Engine
 * Evaluates if user should rebalance to a better Morpho vault
 */
export class YieldDecisionEngine {
  private morphoClient: MorphoClient;
  private yoClient: YoApiClient;
  private pauseService: PauseService | null;

  constructor(morphoClient?: MorphoClient, yoClient?: YoApiClient, pauseService?: PauseService) {
    this.morphoClient = morphoClient || new MorphoClient();
    this.yoClient = yoClient || yoApiClient;
    this.pauseService = pauseService ?? null;
  }

  /**
   * Evaluate if user should rebalance and where
   *
   * @param userAddress - User wallet address
   * @param targetedVaults - Optional list of vault addresses that should use lower threshold (APY monitor detected drops)
   * @param prefetchedVaults - Optional pre-fetched vault lists to avoid redundant API calls (P0-1 fix)
   * @returns Rebalancing decision with reasoning
   */
  async evaluateRebalancing(
    userAddress: `0x${string}`,
    targetedVaults?: string[] | null,
    prefetchedVaults?: { morpho: MorphoVault[]; yo: YoVault[] }
  ): Promise<RebalanceDecision> {
    try {
      // 1. Fetch user's current positions and vault lists in parallel
      // Vault lists are needed early: (a) to resolve YO position underlying tokens,
      // (b) to look up current vault APY, (c) to find eligible rebalance targets.
      const [morphoPositions, yoPositions, morphoVaults, yoVaults] = await Promise.all([
        this.morphoClient.fetchUserPositions(userAddress, CHAIN_ID),
        this.yoClient.fetchUserPositions(userAddress, CHAIN_ID),
        prefetchedVaults?.morpho ??
          this.morphoClient.fetchVaults(CHAIN_ID, MORPHO_ASSET_SYMBOL, 50),
        prefetchedVaults?.yo ?? this.yoClient.fetchVaults(CHAIN_ID),
      ]);

      // Build a vault→underlying lookup for YO vaults (used by position normalization)
      const yoVaultUnderlyingMap = new Map(
        yoVaults.map((v) => [
          v.address.toLowerCase(),
          { symbol: v.underlying.symbol, address: v.underlying.address as string },
        ])
      );

      // Normalize positions into a common shape for comparison
      type NormalizedPosition = {
        protocol: Protocol;
        vaultAddress: string;
        vaultName: string;
        shares: string;
        assets: string;
        assetsUsd: number;
        underlyingSymbol: string;
        underlyingAddress: string;
      };

      const allPositions: NormalizedPosition[] = [
        ...morphoPositions.map((p) => ({
          protocol: "morpho" as Protocol,
          vaultAddress: p.vault.address,
          vaultName: p.vault.name,
          shares: p.shares,
          assets: p.assets,
          assetsUsd: p.assetsUsd ?? 0,
          underlyingSymbol: "USDC", // Morpho vaults are USDC-only on Base
          underlyingAddress: USDC_ADDRESS,
        })),
        ...yoPositions.map((p) => ({
          protocol: "yo" as Protocol,
          vaultAddress: p.vaultAddress,
          vaultName: p.vaultName,
          shares: p.shares.toString(),
          assets: p.assets.toString(),
          assetsUsd: p.assetsUsd,
          // Resolve underlying from the YO vault list
          underlyingSymbol:
            yoVaultUnderlyingMap.get(p.vaultAddress.toLowerCase())?.symbol ?? "USDC",
          underlyingAddress:
            yoVaultUnderlyingMap.get(p.vaultAddress.toLowerCase())?.address ?? USDC_ADDRESS,
        })),
      ];

      if (allPositions.length === 0) {
        return {
          shouldRebalance: false,
          reason: "No active positions found",
          currentVault: null,
          targetVault: null,
          apyImprovement: 0,
          estimatedAnnualGain: 0,
          breakEvenDays: 0,
        };
      }

      // 2. Get the largest position across all protocols by USD value
      const currentPosition = allPositions.reduce((max, pos) =>
        pos.assetsUsd > max.assetsUsd ? pos : max
      );

      // 4. Get current vault APY -- look up from vault list first to avoid extra API call
      let currentApy = 0;
      if (currentPosition.protocol === "morpho") {
        const matchedMorpho = morphoVaults.find(
          (v) => v.address.toLowerCase() === currentPosition.vaultAddress.toLowerCase()
        );
        if (matchedMorpho) {
          currentApy = matchedMorpho.avgNetApy ?? matchedMorpho.netApy ?? 0;
        } else {
          // Vault not in list -- fetch individually as fallback
          const vaultDetails = await this.morphoClient.fetchVault(
            currentPosition.vaultAddress,
            CHAIN_ID
          );
          if (!vaultDetails) {
            return {
              shouldRebalance: false,
              reason: "Could not fetch current Morpho vault details",
              currentVault: null,
              targetVault: null,
              apyImprovement: 0,
              estimatedAnnualGain: 0,
              breakEvenDays: 0,
            };
          }
          currentApy = vaultDetails.avgNetApy ?? vaultDetails.netApy ?? 0;
        }
      } else {
        const matchedVault = yoVaults.find(
          (v) => v.address.toLowerCase() === currentPosition.vaultAddress.toLowerCase()
        );
        currentApy = matchedVault?.apy ?? 0;
      }

      type NormalizedVault = {
        protocol: Protocol;
        address: string;
        name: string;
        apy: number;
        liquidityUsd: number;
        underlyingSymbol: string;
        underlyingAddress: string;
      };

      const allVaults: NormalizedVault[] = [
        ...morphoVaults.map((v) => ({
          protocol: "morpho" as Protocol,
          address: v.address,
          name: v.name,
          apy: v.avgNetApy ?? v.netApy ?? 0,
          liquidityUsd: v.totalAssetsUsd ?? 0,
          underlyingSymbol: "USDC",
          underlyingAddress: USDC_ADDRESS,
        })),
        ...yoVaults.map((v) => ({
          protocol: "yo" as Protocol,
          address: v.address,
          name: v.name,
          apy: v.apy,
          liquidityUsd: v.tvlUsd,
          underlyingSymbol: v.underlying.symbol,
          underlyingAddress: v.underlying.address as string,
        })),
      ];

      // INVARIANT: Same-asset rebalance only — filter to vaults with the same underlying
      let eligibleVaults = allVaults.filter(
        (vault) =>
          vault.liquidityUsd >= REBALANCE_THRESHOLDS.minLiquidityUsd &&
          vault.address.toLowerCase() !== currentPosition.vaultAddress.toLowerCase() &&
          vault.underlyingSymbol.toUpperCase() === currentPosition.underlyingSymbol.toUpperCase()
      );

      // ADR-001: Filter out paused vaults and block redeem from paused source
      if (this.pauseService) {
        const allAddresses = [
          ...eligibleVaults.map((v) => v.address as `0x${string}`),
          currentPosition.vaultAddress as `0x${string}`,
        ];
        const pauseStates = await this.pauseService.checkVaultPauseStates(
          allAddresses.map((a) => ({ address: a, protocol: "unknown" }))
        );

        // Block redeem from paused source vault
        const currentPauseState = pauseStates.get(
          currentPosition.vaultAddress.toLowerCase() as `0x${string}`
        );
        if (currentPauseState?.redeemPaused) {
          return {
            shouldRebalance: false,
            reason: "Current vault has redeems paused",
            currentVault: {
              address: currentPosition.vaultAddress as `0x${string}`,
              name: currentPosition.vaultName,
              apy: currentApy,
              shares: currentPosition.shares,
              assets: currentPosition.assets,
              protocol: currentPosition.protocol,
              underlyingAddress: currentPosition.underlyingAddress as `0x${string}`,
              underlyingSymbol: currentPosition.underlyingSymbol,
            },
            targetVault: null,
            apyImprovement: 0,
            estimatedAnnualGain: 0,
            breakEvenDays: 0,
          };
        }

        // Filter target vaults with deposits paused
        eligibleVaults = eligibleVaults.filter(
          (v) => !pauseStates.get(v.address.toLowerCase() as `0x${string}`)?.depositPaused
        );
      }

      if (eligibleVaults.length === 0) {
        return {
          shouldRebalance: false,
          reason: "No eligible alternative vaults found",
          currentVault: {
            address: currentPosition.vaultAddress as `0x${string}`,
            name: currentPosition.vaultName,
            apy: currentApy,
            shares: currentPosition.shares,
            assets: currentPosition.assets,
            protocol: currentPosition.protocol,
            underlyingAddress: currentPosition.underlyingAddress as `0x${string}`,
            underlyingSymbol: currentPosition.underlyingSymbol,
          },
          targetVault: null,
          apyImprovement: 0,
          estimatedAnnualGain: 0,
          breakEvenDays: 0,
        };
      }

      // 5. Find best vault by APY across all protocols
      let bestVault = eligibleVaults.sort((a, b) => b.apy - a.apy)[0];

      // 6. Calculate APY improvement
      const apyImprovement = bestVault.apy - currentApy;
      const positionValueUsd = currentPosition.assetsUsd;
      const estimatedAnnualGain = positionValueUsd * apyImprovement;
      const breakEvenDays = 0; // Gas fully sponsored

      // 7. Make decision
      const isTargeted = targetedVaults?.some(
        (v) => v.toLowerCase() === currentPosition.vaultAddress.toLowerCase()
      );
      const effectiveThreshold = isTargeted
        ? REBALANCE_THRESHOLDS.targetedApyImprovement
        : REBALANCE_THRESHOLDS.minApyImprovement;

      const shouldRebalance = apyImprovement >= effectiveThreshold;

      const reason = shouldRebalance
        ? `${isTargeted ? "[TARGETED] " : ""}Found ${(apyImprovement * 100).toFixed(2)}% APY improvement (${(currentApy * 100).toFixed(2)}% → ${(bestVault.apy * 100).toFixed(2)}%). ${currentPosition.protocol}→${bestVault.protocol}. Estimated gain: $${estimatedAnnualGain.toFixed(2)}/year.`
        : `APY improvement too small (${(apyImprovement * 100).toFixed(2)}% < ${(effectiveThreshold * 100).toFixed(1)}% threshold)`;

      return {
        shouldRebalance,
        reason,
        currentVault: {
          address: currentPosition.vaultAddress as `0x${string}`,
          name: currentPosition.vaultName,
          apy: currentApy,
          shares: currentPosition.shares,
          assets: currentPosition.assets,
          protocol: currentPosition.protocol,
          underlyingAddress: currentPosition.underlyingAddress as `0x${string}`,
          underlyingSymbol: currentPosition.underlyingSymbol,
        },
        targetVault: shouldRebalance
          ? {
              address: bestVault.address as `0x${string}`,
              name: bestVault.name,
              apy: bestVault.apy,
              liquidityUsd: bestVault.liquidityUsd,
              protocol: bestVault.protocol,
              underlyingAddress: bestVault.underlyingAddress as `0x${string}`,
              underlyingSymbol: bestVault.underlyingSymbol,
            }
          : null,
        apyImprovement,
        estimatedAnnualGain,
        breakEvenDays,
      };
    } catch (error: any) {
      console.error("Error evaluating rebalancing:", error);
      return {
        shouldRebalance: false,
        reason: `Error: ${error.message}`,
        currentVault: null,
        targetVault: null,
        apyImprovement: 0,
        estimatedAnnualGain: 0,
        breakEvenDays: 0,
      };
    }
  }

  /**
   * Get all available Morpho vaults (USDC-only on Base)
   */
  async getAvailableMorphoVaults(): Promise<MorphoVault[]> {
    return await this.morphoClient.fetchVaults(CHAIN_ID, MORPHO_ASSET_SYMBOL, 20);
  }

  /**
   * Get all available YO vaults (multi-asset: USDC, WETH, cbBTC, EURC)
   */
  async getAvailableYoVaults(): Promise<YoVault[]> {
    return await this.yoClient.fetchVaults(CHAIN_ID);
  }

  /**
   * Get all available vaults from all protocols
   * Returns Morpho vaults (for backward compat with optimize route)
   * Use getAvailableMorphoVaults() / getAvailableYoVaults() for typed access
   */
  async getAvailableVaults(): Promise<MorphoVault[]> {
    return await this.morphoClient.fetchVaults(CHAIN_ID, MORPHO_ASSET_SYMBOL, 20);
  }

  /**
   * Get Morpho positions with APY data
   *
   * @param userAddress - User wallet address
   * @param prefetchedMorphoVaults - Optional pre-fetched vault list to look up APY without N+1 fetchVault calls (P1-3 fix)
   */
  async getMorphoPositionsWithApy(
    userAddress: `0x${string}`,
    prefetchedMorphoVaults?: MorphoVault[]
  ): Promise<(MorphoUserPosition & { apy: number })[]> {
    const positions = await this.morphoClient.fetchUserPositions(userAddress, CHAIN_ID);

    if (prefetchedMorphoVaults) {
      // Look up APY from the already-fetched vault list (no N+1 API calls)
      return positions.map((pos) => {
        const matched = prefetchedMorphoVaults.find(
          (v) => v.address.toLowerCase() === pos.vault.address.toLowerCase()
        );
        return { ...pos, apy: matched?.avgNetApy ?? matched?.netApy ?? 0 };
      });
    }

    // Fallback: fetch each vault individually (original behavior)
    const enrichedPositions = await Promise.all(
      positions.map(async (pos) => {
        const vaultDetails = await this.morphoClient.fetchVault(pos.vault.address, CHAIN_ID);
        return { ...pos, apy: vaultDetails?.avgNetApy || 0 };
      })
    );
    return enrichedPositions;
  }

  /**
   * Get YO positions with APY data
   *
   * @param userAddress - User wallet address
   * @param prefetchedYoVaults - Optional pre-fetched vault list to look up APY without redundant fetchVaults call (P1 fix)
   */
  async getYoPositionsWithApy(
    userAddress: `0x${string}`,
    prefetchedYoVaults?: YoVault[]
  ): Promise<(YoUserPosition & { apy: number })[]> {
    const positions = await this.yoClient.fetchUserPositions(userAddress, CHAIN_ID);
    const vaults = prefetchedYoVaults ?? (await this.yoClient.fetchVaults(CHAIN_ID));
    return positions.map((pos) => {
      const vault = vaults.find((v) => v.address.toLowerCase() === pos.vaultAddress.toLowerCase());
      return { ...pos, apy: vault?.apy ?? 0 };
    });
  }

  /**
   * Get user's current positions with APY data (backward compat — Morpho only)
   * For cross-protocol positions, use getMorphoPositionsWithApy + getYoPositionsWithApy
   */
  async getUserPositionsWithApy(
    userAddress: `0x${string}`
  ): Promise<(MorphoUserPosition & { apy: number })[]> {
    return this.getMorphoPositionsWithApy(userAddress);
  }
}

/**
 * Singleton instance for convenience — includes default PauseService (ADR-001)
 */
import { YoPauseChecker } from "../yo/pause-checker";
import { MorphoPauseChecker } from "../morpho/pause-checker";

const defaultPauseService = new PauseService([new YoPauseChecker(), new MorphoPauseChecker()], {
  ttlMs: 60_000,
});
export const yieldDecisionEngine = new YieldDecisionEngine(
  undefined,
  undefined,
  defaultPauseService
);
