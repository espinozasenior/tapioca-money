import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';

const CHAINLINK_USDC_USD = '0x7e860098F58bBFC8648a4311b374B1D669a2bc6B' as const;

const AGGREGATOR_ABI = parseAbi([
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() view returns (uint8)',
]);

export interface PriceFeedResult {
  price: number;       // USD price (e.g., 1.0001)
  updatedAt: number;   // Unix timestamp of last update
  isStale: boolean;    // True if data is older than staleness threshold
  isDepegged: boolean; // True if price deviates >0.5% from $1.00
  roundId: bigint;
}

const STALENESS_THRESHOLD = 3600; // 1 hour (Chainlink updates every ~1h for USDC/USD)
const DEPEG_THRESHOLD = 0.005;    // 0.5% deviation from $1.00

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

/**
 * Fetch latest USDC/USD price from Chainlink on Base
 */
export async function getUsdcPrice(): Promise<PriceFeedResult> {
  const [roundId, answer, , updatedAt] = await publicClient.readContract({
    address: CHAINLINK_USDC_USD,
    abi: AGGREGATOR_ABI,
    functionName: 'latestRoundData',
  });

  const decimals = await publicClient.readContract({
    address: CHAINLINK_USDC_USD,
    abi: AGGREGATOR_ABI,
    functionName: 'decimals',
  });

  const price = Number(answer) / 10 ** Number(decimals);
  const now = Math.floor(Date.now() / 1000);
  const isStale = now - Number(updatedAt) > STALENESS_THRESHOLD;
  const isDepegged = Math.abs(price - 1.0) > DEPEG_THRESHOLD;

  return {
    price,
    updatedAt: Number(updatedAt),
    isStale,
    isDepegged,
    roundId,
  };
}

/**
 * Pre-rebalance safety check.
 * Returns true if it's safe to proceed with a rebalance.
 * Blocks rebalancing if USDC is depegged or price data is stale.
 */
export async function isRebalanceSafe(): Promise<{ safe: boolean; reason?: string }> {
  try {
    const priceData = await getUsdcPrice();

    if (priceData.isStale) {
      return {
        safe: false,
        reason: `Chainlink USDC/USD data stale (last update: ${new Date(priceData.updatedAt * 1000).toISOString()})`,
      };
    }

    if (priceData.isDepegged) {
      return {
        safe: false,
        reason: `USDC depegged: $${priceData.price.toFixed(4)} (${((priceData.price - 1) * 100).toFixed(2)}% deviation)`,
      };
    }

    return { safe: true };
  } catch (error: any) {
    return {
      safe: false,
      reason: `Chainlink oracle error: ${error.message}`,
    };
  }
}
