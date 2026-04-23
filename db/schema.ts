import {
  pgTable,
  text,
  boolean,
  timestamp,
  uuid,
  jsonb,
  decimal,
  numeric,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable(
  "users",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    walletAddress: text("wallet_address").unique().notNull(),
    autoOptimizeEnabled: boolean("auto_optimize_enabled").default(false),
    agentRegistered: boolean("agent_registered").default(false),
    authorization7702: jsonb("authorization_7702"), // EIP-7702 authorization data (agent session keys)
    transferAuthorization: jsonb("transfer_authorization"), // Transfer-only session keys
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    // Compound index for cron job query optimization
    // Query: WHERE auto_optimize_enabled = true AND agent_registered = true AND authorization_7702 IS NOT NULL
    // Reduces query time from 5000ms to ~200ms for large user tables
    index("idx_users_cron_query").on(
      table.autoOptimizeEnabled,
      table.agentRegistered,
      table.createdAt
    ),
    // Index for wallet address lookups (already has unique constraint, but explicit for clarity)
    index("idx_users_wallet_address").on(table.walletAddress),
    // Case-insensitive unique index to prevent duplicate users with different casing
    uniqueIndex("users_wallet_address_lower_unique").on(sql`lower(${table.walletAddress})`),
  ]
);

export const userStrategies = pgTable("user_strategies", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  minApyGainThreshold: decimal("min_apy_gain_threshold").default("0.5"),
  maxSlippageTolerance: decimal("max_slippage_tolerance").default("0.5"),
  riskLevel: text("risk_level").default("medium"), // low, medium, high
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const agentActions = pgTable(
  "agent_actions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    actionType: text("action_type").notNull(), // 'rebalance', 'health_check', 'optimization_check', 'transfer'
    status: text("status").notNull(), // 'pending', 'success', 'failed'
    fromProtocol: text("from_protocol"),
    toProtocol: text("to_protocol"),
    amountUsdc: decimal("amount_usdc"),
    txHash: text("tx_hash"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata"), // Store full decision data or simulation results
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    // Index for user action history queries
    index("idx_agent_actions_user_created").on(table.userId, table.createdAt),
    // Index for filtering by action type and status
    index("idx_agent_actions_type_status").on(table.actionType, table.status),
  ]
);

// ---------------------------------------------------------------------------
// Sentinel v0 — Circuit Breaker Tables
// ---------------------------------------------------------------------------

/**
 * Incident log: one row per trigger event per user.
 * Tracks all EXIT and ALERT actions taken by the sentinel worker.
 */
export const sentinelIncidents = pgTable(
  "sentinel_incidents",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userAddress: text("user_address").notNull(),
    vaultAddress: text("vault_address").notNull(),
    protocol: text("protocol").notNull(), // 'morpho' | 'yo'
    signalType: text("signal_type").notNull(), // 'DEX_PRICE' | 'ORACLE_PRICE' | 'VAULT_FLOW' | 'MAX_REDEEM' | 'VAULT_PAUSED' | 'SHARE_PRICE'
    signalValue: numeric("signal_value"),
    threshold: numeric("threshold"),
    actionTaken: text("action_taken").notNull(), // 'exit' | 'alert' | 'exit_failed'
    txHash: text("tx_hash"),
    amountRedeemed: numeric("amount_redeemed"),
    sessionType: text("session_type"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_incidents_vault").on(table.vaultAddress, table.createdAt),
    index("idx_incidents_user").on(table.userAddress, table.createdAt),
  ]
);

/**
 * Live vault status: one row per monitored vault, upserted each poll cycle.
 * Read by the dashboard API to show vault safety indicators.
 */
export const sentinelVaultStatus = pgTable(
  "sentinel_vault_status",
  {
    vaultAddress: text("vault_address").primaryKey(),
    protocol: text("protocol").notNull(),
    status: text("status").notNull().default("safe"), // 'safe' | 'warning' | 'danger' | 'exiting' | 'exited'
    lastCheckAt: timestamp("last_check_at", { withTimezone: true }),
    sharePrice: numeric("share_price"),
    tvl: numeric("tvl"),
    depegDelta: numeric("depeg_delta"),
    maxRedeemZero: boolean("max_redeem_zero").default(false),
    metadata: jsonb("metadata"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_status_last_check").on(table.lastCheckAt)]
);

/**
 * Transfer history: one row per successful customer-paid USDC send.
 * Populated by /api/transfer/send after receipt parsing (fire-and-forget).
 * Read by /api/transfer/history for recent recipients + send log.
 * See tasks/spec-usdc-send.md §14.4.
 */
export const transferHistory = pgTable(
  "transfer_history",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    txHash: text("tx_hash").notNull(),
    userOpHash: text("user_op_hash"),
    recipientAddr: text("recipient_addr").notNull(), // checksummed 0x
    recipientLabel: text("recipient_label"), // ENS/Basename if user typed one (cosmetic only)
    amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
    feePaid: numeric("fee_paid", { precision: 20, scale: 6 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_transfer_history_user_created").on(table.userId, table.createdAt),
    index("idx_transfer_history_user_recipient_created").on(
      table.userId,
      table.recipientAddr,
      table.createdAt
    ),
  ]
);
