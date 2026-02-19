import {
  pgTable,
  text,
  boolean,
  timestamp,
  uuid,
  jsonb,
  decimal,
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
    uniqueIndex("users_wallet_address_lower_unique").on(
      sql`lower(${table.walletAddress})`
    ),
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
