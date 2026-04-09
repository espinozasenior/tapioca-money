/**
 * Sentinel v0 — DeFiLlama Signal Source
 *
 * Supplementary stablecoin price polling via DeFiLlama's coins API.
 * Used as fallback when Ponder is stale, and as a secondary confirmation source.
 *
 * Note from Resolv replay: DeFiLlama showed USR at $1.00 throughout the crash.
 * This source is NOT reliable for exotic stablecoin depegs. It serves as a
 * supplement for broad market stablecoins (USDC, USDT, DAI).
 */

const DEFILLAMA_COINS_URL = "https://coins.llama.fi/prices/current";

// Map token symbols to DeFiLlama coin IDs
const LLAMA_COIN_IDS: Record<string, string> = {
  USDC: "base:0x833589fCD6eDb6E08f4c7C32d4f71b54bdA02913",
  USR: "ethereum:0x35282d87011f87508D457F08252Bc5bFa52E10A0",
};

export interface DeFiLlamaPrice {
  price: number;
  timestamp: number;
  confidence: number;
}

/**
 * Query DeFiLlama for a stablecoin price.
 * Returns null on any failure (fail-open).
 */
export async function queryDeFiLlamaPrice(asset: string): Promise<DeFiLlamaPrice | null> {
  const coinId = LLAMA_COIN_IDS[asset.toUpperCase()];
  if (!coinId) {
    return null;
  }

  try {
    const response = await fetch(`${DEFILLAMA_COINS_URL}/${coinId}`, {
      signal: AbortSignal.timeout(5000), // 5s timeout
    });

    if (!response.ok) {
      console.warn(`[Sentinel] DeFiLlama returned ${response.status} for ${asset}`);
      return null;
    }

    const data = await response.json();
    const coin = data.coins?.[coinId];

    if (!coin?.price) {
      return null;
    }

    return {
      price: coin.price,
      timestamp: coin.timestamp || Math.floor(Date.now() / 1000),
      confidence: coin.confidence || 0,
    };
  } catch (error) {
    console.error(`[Sentinel] DeFiLlama query failed for ${asset}:`, (error as Error).message);
    return null;
  }
}
