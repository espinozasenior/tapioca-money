import { pgTable, text, boolean, timestamp, uuid, jsonb, decimal } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").unique().notNull(),
  autoOptimizeEnabled: boolean("auto_optimize_enabled").default(false),
  agentRegistered: boolean("agent_registered").default(false),
  authorization7702: jsonb("authorization_7702"), // EIP-7702 authorization data (agent session keys)
  transferAuthorization: jsonb("transfer_authorization"), // Transfer-only session keys
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const userStrategies = pgTable("user_strategies", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  minApyGainThreshold: decimal("min_apy_gain_threshold").default("0.5"),
  maxSlippageTolerance: decimal("max_slippage_tolerance").default("0.5"),
  riskLevel: text("risk_level").default("medium"), // low, medium, high
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const agentActions = pgTable("agent_actions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  actionType: text("action_type").notNull(), // 'rebalance', 'health_check', 'optimization_check'
  status: text("status").notNull(), // 'pending', 'success', 'failed'
  fromProtocol: text("from_protocol"),
  toProtocol: text("to_protocol"),
  amountUsdc: decimal("amount_usdc"),
  txHash: text("tx_hash"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"), // Store full decision data or simulation results
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
