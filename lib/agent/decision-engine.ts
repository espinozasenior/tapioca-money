import { MorphoClient, type MorphoVault, type MorphoUserPosition } from "../morpho/api-client";
import { CHAIN_CONFIG, REBALANCE_THRESHOLDS } from "../yield-optimizer/config";

const CHAIN_ID = CHAIN_CONFIG.chainId;
const ASSET_SYMBOL = "USDC";

export interface RebalanceDecision {
  shouldRebalance: boolean;
  reason: string;
  currentVault: {
    address: `0x${string}`;
    name: string;
    apy: number;
    shares: string;
    assets: string;
  } | null;
  targetVault: {
    address: `0x${string}`;
    name: string;
    apy: number;
    liquidityUsd: number;
  } | null;
  apyImprovement: number; // Absolute improvement (e.g., 0.02 = 2%)
  estimatedAnnualGain: number; // USD per year
  breakEvenDays: number; // Days to recover gas cost
}

/**
 * Yield Decision Engine
 * Evaluates if user should rebalance to a better Morpho vault
 */
export class YieldDecisionEngine {
  private morphoClient: MorphoClient;

  constructor(morphoClient?: MorphoClient) {
    this.morphoClient = morphoClient || new MorphoClient();
  }

  /**
   * Evaluate if user should rebalance and where
   *
   * @param userAddress - User wallet address
   * @param targetedVaults - Optional list of vault addresses that should use lower threshold (APY monitor detected drops)
   * @returns Rebalancing decision with reasoning
   */
  async evaluateRebalancing(
    userAddress: `0x${string}`,
    targetedVaults?: string[] | null
  ): Promise<RebalanceDecision> {
    try {
      // 1. Fetch user's current positions
      const positions = await this.morphoClient.fetchUserPositions(userAddress, CHAIN_ID);

      if (positions.length === 0) {
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

      // 2. Get the largest position by USD value
      const currentPosition = positions.reduce((max, pos) =>
        (pos.assetsUsd ?? 0) > (max.assetsUsd ?? 0) ? pos : max
      );

      // 3. Fetch current vault details with APY
      const currentVaultDetails = await this.morphoClient.fetchVault(
        currentPosition.vault.address,
        CHAIN_ID
      );

      if (!currentVaultDetails) {
        return {
          shouldRebalance: false,
          reason: "Could not fetch current vault details",
          currentVault: null,
          targetVault: null,
          apyImprovement: 0,
          estimatedAnnualGain: 0,
          breakEvenDays: 0,
        };
      }

      // 4. Fetch all available vaults and find best option
      const allVaults = await this.morphoClient.fetchVaults(CHAIN_ID, ASSET_SYMBOL, 50);

      const eligibleVaults = allVaults.filter(
        (vault) =>
          (vault.totalAssetsUsd ?? 0) >= REBALANCE_THRESHOLDS.minLiquidityUsd && // Sufficient liquidity
          vault.address.toLowerCase() !== currentVaultDetails.address.toLowerCase() // Different vault
      );

      if (eligibleVaults.length === 0) {
        return {
          shouldRebalance: false,
          reason: "No eligible alternative vaults found",
          currentVault: {
            address: currentVaultDetails.address,
            name: currentVaultDetails.name,
            apy: currentVaultDetails.avgNetApy ?? currentVaultDetails.netApy ?? 0,
            shares: currentPosition.shares,
            assets: currentPosition.assets,
          },
          targetVault: null,
          apyImprovement: 0,
          estimatedAnnualGain: 0,
          breakEvenDays: 0,
        };
      }

      // 5. Find best vault by APY
      const bestVault = eligibleVaults[0]; // Already sorted by APY descending

      // 6. Calculate APY improvement and estimated gains
      const currentApy = currentVaultDetails.avgNetApy ?? currentVaultDetails.netApy ?? 0;
      const bestApy = bestVault.avgNetApy ?? bestVault.netApy ?? 0;
      const apyImprovement = bestApy - currentApy;

      const positionValueUsd = currentPosition.assetsUsd ?? 0;
      const estimatedAnnualGain = positionValueUsd * apyImprovement;

      // 7. Break-even is effectively instant — gas is fully sponsored by ZeroDev paymaster
      const breakEvenDays = 0;

      // 8. Make decision — gates on APY improvement threshold only
      // Use lower threshold for targeted rebalances (APY monitor detected drops)
      const isTargeted = targetedVaults?.some(
        (v) => v.toLowerCase() === currentVaultDetails.address.toLowerCase()
      );
      const effectiveThreshold = isTargeted
        ? REBALANCE_THRESHOLDS.targetedApyImprovement
        : REBALANCE_THRESHOLDS.minApyImprovement;

      const shouldRebalance = apyImprovement >= effectiveThreshold;

      const reason = shouldRebalance
        ? `${isTargeted ? "[TARGETED] " : ""}Found ${(apyImprovement * 100).toFixed(2)}% APY improvement (${(currentApy * 100).toFixed(2)}% → ${(bestApy * 100).toFixed(2)}%). Estimated gain: $${estimatedAnnualGain.toFixed(2)}/year.`
        : `APY improvement too small (${(apyImprovement * 100).toFixed(2)}% < ${(effectiveThreshold * 100).toFixed(1)}% threshold)`;

      return {
        shouldRebalance,
        reason,
        currentVault: {
          address: currentVaultDetails.address,
          name: currentVaultDetails.name,
          apy: currentApy,
          shares: currentPosition.shares,
          assets: currentPosition.assets,
        },
        targetVault: shouldRebalance
          ? {
              address: bestVault.address,
              name: bestVault.name,
              apy: bestApy,
              liquidityUsd: bestVault.totalAssetsUsd ?? 0,
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
   * Get all available vaults with APY data
   * Useful for UI display
   *
   * @returns Array of vaults sorted by APY
   */
  async getAvailableVaults(): Promise<MorphoVault[]> {
    return await this.morphoClient.fetchVaults(CHAIN_ID, ASSET_SYMBOL, 20);
  }

  /**
   * Get user's current positions with APY data
   *
   * @param userAddress - User wallet address
   * @returns Array of positions with vault details
   */
  async getUserPositionsWithApy(userAddress: `0x${string}`) {
    const positions = await this.morphoClient.fetchUserPositions(userAddress, CHAIN_ID);

    // Enrich with vault details
    const enrichedPositions = await Promise.all(
      positions.map(async (pos) => {
        const vaultDetails = await this.morphoClient.fetchVault(pos.vault.address, CHAIN_ID);
        return {
          ...pos,
          apy: vaultDetails?.avgNetApy || 0,
        };
      })
    );

    return enrichedPositions;
  }
}

/**
 * Singleton instance for convenience
 */
export const yieldDecisionEngine = new YieldDecisionEngine();
