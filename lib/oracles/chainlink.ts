import { createPublicClient, http, parseAbi } from "viem";
import { base } from "viem/chains";
import { CHAIN_CONFIG } from "@/lib/yield-optimizer/config";

const CHAINLINK_USDC_USD = "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B" as const;
const BASE_SEQUENCER_UPTIME_FEED = "0xBCF85224fc0756B9Fa45aA7892530B47e10b6433" as const;

const AGGREGATOR_ABI = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() view returns (uint8)",
]);

export interface PriceFeedResult {
  price: number; // USD price (e.g., 1.0001)
  updatedAt: number; // Unix timestamp of last update
  isStale: boolean; // True if data is older than staleness threshold
  isDepegged: boolean; // True if price deviates >0.5% from $1.00
  roundId: bigint;
}

const STALENESS_THRESHOLD = 86400; // 24 hours (matches Chainlink USDC/USD heartbeat on Base)
const DEPEG_THRESHOLD = 0.005; // 0.5% deviation from $1.00
const SEQUENCER_GRACE_PERIOD = 3600; // 1 hour grace period after sequencer comes back up

const publicClient = createPublicClient({
  chain: base,
  transport: http(CHAIN_CONFIG.rpcUrl),
});

/**
 * Check if the Base L2 sequencer is up and has been up long enough to trust price data.
 * Uses Chainlink's L2 Sequencer Uptime Feed.
 * answer == 0: sequencer is up, answer == 1: sequencer is down
 */
async function isSequencerUp(): Promise<{ up: boolean; reason?: string }> {
  const [, answer, startedAt] = await publicClient.readContract({
    address: BASE_SEQUENCER_UPTIME_FEED,
    abi: AGGREGATOR_ABI,
    functionName: "latestRoundData",
  });

  if (answer !== 0n) {
    return { up: false, reason: "Base L2 sequencer is down" };
  }

  const now = Math.floor(Date.now() / 1000);
  const timeSinceUp = now - Number(startedAt);
  if (timeSinceUp < SEQUENCER_GRACE_PERIOD) {
    return {
      up: false,
      reason: `Base L2 sequencer recently restarted (${timeSinceUp}s ago, grace period: ${SEQUENCER_GRACE_PERIOD}s)`,
    };
  }

  return { up: true };
}

/**
 * Fetch latest USDC/USD price from Chainlink on Base
 */
export async function getUsdcPrice(): Promise<PriceFeedResult> {
  const [roundId, answer, , updatedAt] = await publicClient.readContract({
    address: CHAINLINK_USDC_USD,
    abi: AGGREGATOR_ABI,
    functionName: "latestRoundData",
  });

  const decimals = await publicClient.readContract({
    address: CHAINLINK_USDC_USD,
    abi: AGGREGATOR_ABI,
    functionName: "decimals",
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
 * Blocks rebalancing if sequencer is down, USDC is depegged, or price data is stale.
 */
export async function isRebalanceSafe(): Promise<{ safe: boolean; reason?: string }> {
  try {
    const sequencerStatus = await isSequencerUp();
    if (!sequencerStatus.up) {
      return { safe: false, reason: sequencerStatus.reason };
    }

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
