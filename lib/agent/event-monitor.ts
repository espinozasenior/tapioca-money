import { MorphoClient, type MorphoVault } from '../morpho/api-client';
import { getCacheInterface } from '../redis/client';

const CHAIN_ID = 8453;
const ASSET_SYMBOL = 'USDC';
const APY_CHANGE_THRESHOLD = 0.01; // 1% absolute APY change triggers alert
const CACHE_KEY_PREFIX = 'apy_baseline:';
const BASELINE_TTL = 86400; // 24 hours - baseline refreshed daily

export interface ApyChangeEvent {
  vaultAddress: string;
  vaultName: string;
  previousApy: number;
  currentApy: number;
  changeAbsolute: number; // Absolute change (e.g., -0.02 = -2%)
  changeRelative: number; // Relative change (e.g., -0.4 = -40%)
  direction: 'up' | 'down';
  timestamp: number;
}

export interface MonitorResult {
  checked: number;
  changes: ApyChangeEvent[];
  affectedVaults: string[];
}

/**
 * APY Change Detector
 *
 * Polls Morpho vaults and detects significant APY movements.
 * Stores baseline APYs in Redis and compares on each poll.
 */
export class ApyEventMonitor {
  private morphoClient: MorphoClient;
  private threshold: number;

  constructor(threshold: number = APY_CHANGE_THRESHOLD) {
    this.morphoClient = new MorphoClient();
    this.threshold = threshold;
  }

  /**
   * Check all vaults for APY changes against stored baselines.
   * Call this every 5 minutes via a fast-poll cron.
   */
  async detectChanges(): Promise<MonitorResult> {
    const vaults = await this.morphoClient.fetchVaults(CHAIN_ID, ASSET_SYMBOL, 50, true); // skipCache=true for fresh data
    const cache = await getCacheInterface();
    const changes: ApyChangeEvent[] = [];

    for (const vault of vaults) {
      const cacheKey = `${CACHE_KEY_PREFIX}${vault.address}`;
      const baselineStr = await cache.get(cacheKey);
      const currentApy = vault.avgNetApy;

      if (baselineStr) {
        const baseline = parseFloat(baselineStr);
        const changeAbsolute = currentApy - baseline;

        if (Math.abs(changeAbsolute) >= this.threshold) {
          changes.push({
            vaultAddress: vault.address,
            vaultName: vault.name,
            previousApy: baseline,
            currentApy,
            changeAbsolute,
            changeRelative: baseline > 0 ? changeAbsolute / baseline : 0,
            direction: changeAbsolute > 0 ? 'up' : 'down',
            timestamp: Date.now(),
          });
        }
      }

      // Update baseline (always keep latest)
      await cache.set(cacheKey, currentApy.toString(), BASELINE_TTL);
    }

    if (changes.length > 0) {
      console.log(`[APY Monitor] Detected ${changes.length} significant APY changes:`);
      for (const change of changes) {
        console.log(
          `  ${change.vaultName}: ${(change.previousApy * 100).toFixed(2)}% → ${(change.currentApy * 100).toFixed(2)}% (${change.direction === 'up' ? '+' : ''}${(change.changeAbsolute * 100).toFixed(2)}%)`
        );
      }
    }

    return {
      checked: vaults.length,
      changes,
      affectedVaults: changes.map(c => c.vaultAddress),
    };
  }

  /**
   * Get vaults where APY dropped significantly.
   * These are candidates for moving funds OUT of.
   */
  async getDroppedVaults(): Promise<ApyChangeEvent[]> {
    const result = await this.detectChanges();
    return result.changes.filter(c => c.direction === 'down');
  }

  /**
   * Get vaults where APY increased significantly.
   * These are candidates for moving funds INTO.
   */
  async getImprovedVaults(): Promise<ApyChangeEvent[]> {
    const result = await this.detectChanges();
    return result.changes.filter(c => c.direction === 'up');
  }

  /**
   * Reset all baselines (force fresh detection cycle)
   */
  async resetBaselines(): Promise<void> {
    const cache = await getCacheInterface();
    const vaults = await this.morphoClient.fetchVaults(CHAIN_ID, ASSET_SYMBOL, 50);
    for (const vault of vaults) {
      await cache.set(
        `${CACHE_KEY_PREFIX}${vault.address}`,
        vault.avgNetApy.toString(),
        BASELINE_TTL,
      );
    }
    console.log(`[APY Monitor] Reset baselines for ${vaults.length} vaults`);
  }
}
