import { onchainTable, index } from "@ponder/core";

/**
 * Ponder schema — on-chain tables for Sentinel indexed event data.
 *
 * VaultState tracks cumulative TVL from Deposit/Withdraw events.
 * VaultFlow tracks individual deposit/withdraw events for flow analysis.
 * PriceUpdate tracks Chainlink price feed updates for depeg detection.
 * DexSwap tracks Curve TokenExchange events for DEX depeg signals.
 */

export const vaultState = onchainTable(
  "vault_state",
  (t) => ({
    // Composite ID: vaultAddress_chainId
    id: t.text().primaryKey(),
    vaultAddress: t.text().notNull(),
    chainId: t.integer().notNull(),
    protocol: t.text().notNull(),
    totalAssets: t.text().notNull(), // bigint as string
    lastUpdated: t.integer().notNull(), // block timestamp
    depositCount: t.integer().notNull(),
    withdrawCount: t.integer().notNull(),
  }),
  (table) => ({
    chainIdx: index().on(table.chainId),
    vaultIdx: index().on(table.vaultAddress),
  })
);

export const vaultFlow = onchainTable(
  "vault_flow",
  (t) => ({
    id: t.text().primaryKey(), // txHash_logIndex
    vaultAddress: t.text().notNull(),
    chainId: t.integer().notNull(),
    type: t.text().notNull(), // 'deposit' | 'withdraw'
    sender: t.text().notNull(),
    assets: t.text().notNull(), // bigint as string
    shares: t.text().notNull(), // bigint as string
    timestamp: t.integer().notNull(), // block timestamp
    blockNumber: t.integer().notNull(),
  }),
  (table) => ({
    vaultTimeIdx: index().on(table.vaultAddress, table.timestamp),
    chainTimeIdx: index().on(table.chainId, table.timestamp),
  })
);

export const priceUpdate = onchainTable(
  "price_update",
  (t) => ({
    id: t.text().primaryKey(), // feedAddress_roundId
    feedAddress: t.text().notNull(),
    chainId: t.integer().notNull(),
    asset: t.text().notNull(), // 'USDC' | 'EURC'
    price: t.text().notNull(), // int256 as string (8 decimals)
    roundId: t.text().notNull(), // uint256 as string
    timestamp: t.integer().notNull(),
  }),
  (table) => ({
    assetTimeIdx: index().on(table.asset, table.chainId, table.timestamp),
    feedIdx: index().on(table.feedAddress),
  })
);

export const dexSwap = onchainTable(
  "dex_swap",
  (t) => ({
    id: t.text().primaryKey(), // txHash_logIndex
    poolAddress: t.text().notNull(),
    chainId: t.integer().notNull(),
    tokenIn: t.text().notNull(), // sold_id as string
    tokenOut: t.text().notNull(), // bought_id as string
    amountIn: t.text().notNull(), // tokens_sold as string
    amountOut: t.text().notNull(), // tokens_bought as string
    impliedPrice: t.text().notNull(), // amountOut/amountIn as decimal string
    timestamp: t.integer().notNull(),
    blockNumber: t.integer().notNull(),
  }),
  (table) => ({
    poolTimeIdx: index().on(table.poolAddress, table.timestamp),
    chainTimeIdx: index().on(table.chainId, table.timestamp),
  })
);
