import { MorphoClient, MorphoVault, MorphoUserPosition } from '../morpho/api-client';

const CHAIN_ID = 8453; // Base mainnet
const ASSET_SYMBOL = 'USDC';
const MIN_APY_IMPROVEMENT = 0.005; // 0.5% minimum improvement
const MIN_LIQUIDITY_USD = 100_000; // $100k minimum liquidity
const GAS_COST_USD = 0.5; // Estimated gas cost in USD for rebalancing

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
   * @returns Rebalancing decision with reasoning
   */
  async evaluateRebalancing(userAddress: `0x${string}`): Promise<RebalanceDecision> {
    try {
      // 1. Fetch user's current positions
      const positions = await this.morphoClient.fetchUserPositions(userAddress, CHAIN_ID);

      if (positions.length === 0) {
        return {
          shouldRebalance: false,
          reason: 'No active positions found',
          currentVault: null,
          targetVault: null,
          apyImprovement: 0,
          estimatedAnnualGain: 0,
          breakEvenDays: 0,
        };
      }

      // 2. Get the largest position by USD value
      const currentPosition = positions.reduce((max, pos) =>
        pos.assetsUsd > max.assetsUsd ? pos : max
      );

      // 3. Fetch current vault details with APY
      const currentVaultDetails = await this.morphoClient.fetchVault(
        currentPosition.vault.address,
        CHAIN_ID
      );

      if (!currentVaultDetails) {
        return {
          shouldRebalance: false,
          reason: 'Could not fetch current vault details',
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
          vault.totalAssetsUsd >= MIN_LIQUIDITY_USD && // Sufficient liquidity
          vault.address.toLowerCase() !== currentVaultDetails.address.toLowerCase() // Different vault
      );

      if (eligibleVaults.length === 0) {
        return {
          shouldRebalance: false,
          reason: 'No eligible alternative vaults found',
          currentVault: {
            address: currentVaultDetails.address,
            name: currentVaultDetails.name,
            apy: currentVaultDetails.avgNetApy,
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
      const currentApy = currentVaultDetails.avgNetApy;
      const bestApy = bestVault.avgNetApy;
      const apyImprovement = bestApy - currentApy;

      const positionValueUsd = currentPosition.assetsUsd;
      const estimatedAnnualGain = positionValueUsd * apyImprovement;

      // 7. Calculate break-even time
      const breakEvenDays = estimatedAnnualGain > 0 ? (GAS_COST_USD / estimatedAnnualGain) * 365 : Infinity;

      // 8. Make decision
      const shouldRebalance =
        apyImprovement >= MIN_APY_IMPROVEMENT && // Significant improvement
        breakEvenDays <= 30; // Recovers gas cost within 30 days

      const reason = shouldRebalance
        ? `Found ${(apyImprovement * 100).toFixed(2)}% APY improvement (${currentApy * 100}% → ${bestApy * 100}%). Estimated gain: $${estimatedAnnualGain.toFixed(2)}/year. Break-even: ${breakEvenDays.toFixed(1)} days.`
        : apyImprovement < MIN_APY_IMPROVEMENT
        ? `APY improvement too small (${(apyImprovement * 100).toFixed(2)}% < ${MIN_APY_IMPROVEMENT * 100}% threshold)`
        : `Break-even time too long (${breakEvenDays.toFixed(1)} days > 30 days threshold)`;

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
              liquidityUsd: bestVault.totalAssetsUsd,
            }
          : null,
        apyImprovement,
        estimatedAnnualGain,
        breakEvenDays,
      };
    } catch (error: any) {
      console.error('Error evaluating rebalancing:', error);
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
