/**
 * Sentinel v0 — Shared Types
 *
 * Type definitions for the circuit breaker system.
 */

// ---------------------------------------------------------------------------
// Vault configuration
// ---------------------------------------------------------------------------

export interface DexPool {
  address: `0x${string}`;
  asset: string;
  chain: "base";
}

export interface VaultExposure {
  protocol: "morpho" | "yo";
  underlying: string;
  chainlinkFeed?: `0x${string}`;
  dexPools: DexPool[];
}

export interface VaultConfig {
  address: `0x${string}`;
  exposure: VaultExposure;
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

export type SignalType =
  | "DEX_PRICE"
  | "ORACLE_PRICE"
  | "VAULT_FLOW"
  | "MAX_REDEEM"
  | "VAULT_PAUSED"
  | "SHARE_PRICE";

export type SignalSource = "ponder" | "rpc" | "defillama";

export interface Signal {
  type: SignalType;
  vault: VaultConfig;
  asset?: string;
  value: number | bigint | boolean;
  timestamp?: number;
  source: SignalSource;
}

// ---------------------------------------------------------------------------
// Actions (output of rules engine)
// ---------------------------------------------------------------------------

export type ActionType = "EXIT" | "ALERT";

export type ActionReason =
  | "DEPEG"
  | "DEPEG_WARNING"
  | "BANK_RUN"
  | "MAX_REDEEM_ZERO"
  | "VAULT_PAUSED"
  | "SHARE_PRICE_DROP"
  | "TOXIC_UNDERLYING_DEPEG";

export interface Action {
  type: ActionType;
  reason: ActionReason;
  vaultAddress: `0x${string}`;
  protocol?: "morpho" | "yo";
  signalType: SignalType;
  value: number | boolean;
}

// ---------------------------------------------------------------------------
// Incidents (for dedup and persistence)
// ---------------------------------------------------------------------------

export interface ActiveIncident {
  vaultAddress: `0x${string}`;
  signalType: SignalType;
  reason: ActionReason;
  createdAt: number;
  results?: ExitResult[];
}

export interface IncidentRecord {
  userAddress: string;
  vaultAddress: string;
  protocol: string;
  signalType: string;
  signalValue: number | null;
  threshold: number | null;
  actionTaken: string;
  txHash: string | null;
  amountRedeemed: string | null;
  sessionType: string | null;
}

// ---------------------------------------------------------------------------
// Exit results
// ---------------------------------------------------------------------------

export type ExitStatus = "SUCCESS" | "FAILED" | "SKIPPED" | "ALERT_ONLY";

export interface ExitResult {
  userAddress: string;
  status: ExitStatus;
  txHash?: string;
  shares?: string;
  reason?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Signal history (rolling windows)
// ---------------------------------------------------------------------------

export interface SignalHistoryEntry {
  value: number;
  timestamp: number;
}

export class SignalHistory {
  private entries: SignalHistoryEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries = 120) {
    this.maxEntries = maxEntries;
  }

  append(value: number, timestamp: number): void {
    this.entries.push({ value, timestamp });
    // Trim to max size
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
  }

  valuesInRange(since: number, until: number): SignalHistoryEntry[] {
    return this.entries.filter((e) => e.timestamp >= since && e.timestamp <= until);
  }

  latest(): SignalHistoryEntry | undefined {
    return this.entries[this.entries.length - 1];
  }

  get length(): number {
    return this.entries.length;
  }
}

// ---------------------------------------------------------------------------
// Vault status (persisted to DB)
// ---------------------------------------------------------------------------

export type VaultSafetyStatus = "safe" | "warning" | "danger" | "exiting" | "exited";

export interface SentinelVaultStatus {
  vaultAddress: string;
  protocol: string;
  status: VaultSafetyStatus;
  lastCheckAt: Date;
  sharePrice?: number;
  tvl?: number;
  depegDelta?: number;
  maxRedeemZero: boolean;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface SentinelConfig {
  vaults: VaultConfig[];
  thresholds: typeof import("./config").THRESHOLDS;
  pollIntervalMs: number;
  databaseUrl: string;
  redisUrl: string;
  erpcUrl: string;
  ponderGraphqlUrl: string;
  pagerdutyRoutingKey: string;
  resendApiKey: string;
  zerodevProjectId: string;
  zerodevBundlerUrl: string;
  paymasterUrl: string;
  sessionEncryptionKey: string;
}
