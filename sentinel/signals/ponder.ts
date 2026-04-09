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
 *
 * Ponder 0.7+ exposes per-network status under `_meta.status.<networkName>.block`
 * and a `ready` flag indicating historical sync completion. We treat ready=false
 * as stale regardless of block timestamp — during initial backfill the latest
 * indexed block is hours/days in the past.
 */
export async function checkPonderFreshness(
  ponderUrl: string,
  staleThresholdSeconds: number
): Promise<{ fresh: boolean; meta: PonderMeta | null }> {
  try {
    const data = await graphqlQuery<{
      _meta: {
        status: Record<string, { ready: boolean; block: { number: number; timestamp: number } }>;
      };
    }>(ponderUrl, `query { _meta { status } }`);

    // Use the first (and for v0, only) configured network.
    const networkStatuses = Object.values(data._meta.status);
    const head = networkStatuses[0];

    if (!head?.block) {
      return { fresh: false, meta: null };
    }

    const meta: PonderMeta = {
      block: { number: head.block.number, timestamp: head.block.timestamp },
    };

    if (!head.ready) {
      // Historical backfill still in progress — treat as not-fresh.
      return { fresh: false, meta };
    }

    const staleness = Math.floor(Date.now() / 1000) - head.block.timestamp;
    if (staleness > staleThresholdSeconds) {
      console.warn(
        `[Sentinel] Ponder head stale by ${staleness}s (threshold: ${staleThresholdSeconds}s)`
      );
      return { fresh: false, meta };
    }

    return { fresh: true, meta };
  } catch (error) {
    console.error("[Sentinel] Ponder unreachable:", (error as Error).message);
    return { fresh: false, meta: null };
  }
}

/**
 * Query recent vault flows (deposits/withdrawals) in a time window.
 *
 * Ponder 0.7 wraps list queries in a paginated `xxxPage { items { ... } }`
 * shape instead of returning a flat array.
 */
export async function queryVaultFlows(
  ponderUrl: string,
  vaultAddress: string,
  sinceTimestamp: number
): Promise<PonderVaultFlow[]> {
  try {
    const data = await graphqlQuery<{ vaultFlows: { items: PonderVaultFlow[] } }>(
      ponderUrl,
      `query RecentFlows($vault: String!, $since: Int!) {
        vaultFlows(
          where: { vaultAddress: $vault, timestamp_gt: $since }
          orderBy: "timestamp"
          orderDirection: "asc"
        ) {
          items {
            type
            assets
            timestamp
          }
        }
      }`,
      { vault: vaultAddress, since: sinceTimestamp }
    );
    return data.vaultFlows?.items ?? [];
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
 *
 * Ponder 0.7 paginated shape: `priceUpdates { items { ... } }`. The `limit`
 * arg also moved onto the query field itself.
 */
export async function queryPriceUpdate(
  ponderUrl: string,
  feedAddress: string
): Promise<PonderPriceUpdate | null> {
  try {
    const data = await graphqlQuery<{
      priceUpdates: { items: PonderPriceUpdate[] };
    }>(
      ponderUrl,
      `query LatestPrice($feed: String!) {
        priceUpdates(
          where: { feedAddress: $feed }
          orderBy: "timestamp"
          orderDirection: "desc"
          limit: 1
        ) {
          items {
            price
            timestamp
          }
        }
      }`,
      { feed: feedAddress }
    );
    return data.priceUpdates?.items?.[0] || null;
  } catch (error) {
    console.error(
      `[Sentinel] Ponder price query failed for ${feedAddress}:`,
      (error as Error).message
    );
    return null;
  }
}
