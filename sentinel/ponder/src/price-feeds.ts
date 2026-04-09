import { ponder } from "@/generated";
import { priceUpdate } from "../ponder.schema";

/**
 * Chainlink price feed handlers — index AnswerUpdated events
 * for USDC/USD price feeds.
 *
 * Used by Sentinel for depeg detection.
 * Chainlink prices have 8 decimals (e.g., 99980000 = $0.9998).
 */

// Maps feed contract address -> asset symbol
// Addresses must match those in ponder.config.ts
const FEED_ASSET_MAP: Record<string, string> = {
  // Base
  "0x7e860098f58bbfc8648a4311b374b1d669a2bc6b": "USDC",
};

ponder.on("ChainlinkPriceFeed:AnswerUpdated", async ({ event, context }) => {
  const feedAddress = event.log.address.toLowerCase();
  const chainId = context.network.chainId;
  const asset = FEED_ASSET_MAP[feedAddress];

  if (!asset) {
    // Unknown feed address — skip
    return;
  }

  const roundId = event.args.roundId.toString();

  await context.db.insert(priceUpdate).values({
    id: `${feedAddress}_${roundId}`,
    feedAddress,
    chainId,
    asset,
    price: event.args.current.toString(),
    roundId,
    timestamp: Number(event.args.updatedAt),
  });
});
