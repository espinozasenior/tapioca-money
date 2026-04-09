/**
 * Sentinel v0 — Ponder GraphQL Signal Source
 *
 * Queries the Ponder indexer's GraphQL API (localhost:42069) for:
 * - Vault deposit/withdraw flows (bank run detection)
 * - Chainlink price updates (depeg detection)
 * - DEX swap implied prices (P0 early warning)
 */

export interface PonderPriceUpdate {
  price: number;
  timestamp: number;
}

export interface PonderVaultFlow {
  type: "deposit" | "withdraw";
  assets: string; // bigint as string
  timestamp: number;
}

export interface PonderMeta {
  block: {
    number: number;
    timestamp: number;
  };
}

/**
 * Execute a GraphQL query against Ponder's local endpoint.
 */
async function graphqlQuery<T>(
  ponderUrl: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(ponderUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Ponder GraphQL error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  if (json.errors) {
    throw new Error(`Ponder GraphQL query error: ${json.errors[0]?.message || "unknown"}`);
  }

  return json.data;
}

/**
 * Check Ponder indexer freshness via _meta query.
 * Returns true if the indexed block is within PONDER_STALE_SECONDS of current time.
 */
export async function checkPonderFreshness(
  ponderUrl: string,
  staleThresholdSeconds: number
): Promise<{ fresh: boolean; meta: PonderMeta | null }> {
  try {
    const data = await graphqlQuery<{ _meta: PonderMeta }>(
      ponderUrl,
      `query { _meta { block { number timestamp } } }`
    );

    const staleness = Math.floor(Date.now() / 1000) - data._meta.block.timestamp;

    if (staleness > staleThresholdSeconds) {
      console.warn(
        `[Sentinel] Ponder head stale by ${staleness}s (threshold: ${staleThresholdSeconds}s)`
      );
      return { fresh: false, meta: data._meta };
    }

    return { fresh: true, meta: data._meta };
  } catch (error) {
    console.error("[Sentinel] Ponder unreachable:", (error as Error).message);
    return { fresh: false, meta: null };
  }
}

/**
 * Query recent vault flows (deposits/withdrawals) in a time window.
 */
export async function queryVaultFlows(
  ponderUrl: string,
  vaultAddress: string,
  sinceTimestamp: number
): Promise<PonderVaultFlow[]> {
  try {
    const data = await graphqlQuery<{ vaultFlows: PonderVaultFlow[] }>(
      ponderUrl,
      `query RecentFlows($vault: String!, $since: Int!) {
        vaultFlows(
          where: { vaultAddress: $vault, timestamp_gt: $since }
          orderBy: "timestamp"
          orderDirection: "asc"
        ) {
          type
          assets
          timestamp
        }
      }`,
      { vault: vaultAddress, since: sinceTimestamp }
    );
    return data.vaultFlows || [];
  } catch (error) {
    console.error(
      `[Sentinel] Ponder vault flow query failed for ${vaultAddress}:`,
      (error as Error).message
    );
    return [];
  }
}

/**
 * Query latest price update from Ponder-indexed Chainlink feeds.
 */
export async function queryPriceUpdate(
  ponderUrl: string,
  feedAddress: string
): Promise<PonderPriceUpdate | null> {
  try {
    const data = await graphqlQuery<{
      priceUpdates: PonderPriceUpdate[];
    }>(
      ponderUrl,
      `query LatestPrice($feed: String!) {
        priceUpdates(
          where: { feedAddress: $feed }
          orderBy: "timestamp"
          orderDirection: "desc"
          limit: 1
        ) {
          price
          timestamp
        }
      }`,
      { feed: feedAddress }
    );
    return data.priceUpdates?.[0] || null;
  } catch (error) {
    console.error(
      `[Sentinel] Ponder price query failed for ${feedAddress}:`,
      (error as Error).message
    );
    return null;
  }
}
