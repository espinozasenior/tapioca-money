import { ponder } from "@/generated";
import { dexSwap } from "../ponder.schema";

/**
 * CurveDexPool event handler — index TokenExchange events
 * for DEX-level depeg detection.
 *
 * This is the P0 signal from the Resolv replay: catching DEX swaps
 * at block time to detect when a stablecoin trades off-peg.
 *
 * The Curve USR/USDC pool on Ethereum is the primary signal source.
 * Coin layout (assumed): 0 = USR, 1 = USDC.
 * Both have 18 and 6 decimals respectively, so implied price must
 * account for decimal differences.
 */

// Coin decimals for the USR/USDC Curve pool on Ethereum
// sold_id / bought_id map to pool coin indices
const COIN_DECIMALS: Record<string, number> = {
  "0": 18, // USR (18 decimals)
  "1": 6, // USDC (6 decimals)
};

ponder.on("CurveDexPool:TokenExchange", async ({ event, context }) => {
  const poolAddress = event.log.address.toLowerCase();
  const chainId = context.network.chainId;

  const soldId = event.args.sold_id.toString();
  const boughtId = event.args.bought_id.toString();
  const tokensSold = event.args.tokens_sold;
  const tokensBought = event.args.tokens_bought;

  // Calculate implied price: normalize both amounts to the same decimal
  // base, then divide amountOut / amountIn.
  // This gives us the exchange rate from the sold token's perspective.
  const soldDecimals = COIN_DECIMALS[soldId] ?? 18;
  const boughtDecimals = COIN_DECIMALS[boughtId] ?? 18;

  let impliedPrice: string;
  if (tokensSold === 0n) {
    impliedPrice = "0";
  } else {
    // Normalize to 18-decimal precision for the ratio calculation
    // price = (tokensBought * 10^soldDecimals) / (tokensSold * 10^boughtDecimals)
    const numerator = tokensBought * BigInt(10 ** soldDecimals);
    const denominator = tokensSold * BigInt(10 ** boughtDecimals);

    // Express as a decimal string with 8 digits of precision
    const scaledPrice = (numerator * 100_000_000n) / denominator;
    const intPart = scaledPrice / 100_000_000n;
    const fracPart = scaledPrice % 100_000_000n;
    impliedPrice = `${intPart}.${fracPart.toString().padStart(8, "0")}`;
  }

  await context.db.insert(dexSwap).values({
    id: `${event.transaction.hash}_${event.log.logIndex}`,
    poolAddress,
    chainId,
    tokenIn: soldId,
    tokenOut: boughtId,
    amountIn: tokensSold.toString(),
    amountOut: tokensBought.toString(),
    impliedPrice,
    timestamp: Number(event.block.timestamp),
    blockNumber: Number(event.block.number),
  });
});
