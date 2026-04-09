/**
 * Sentinel v0 — Configuration
 *
 * Vault exposure map, thresholds, and environment variable loader.
 */

import type { VaultExposure, VaultConfig, SentinelConfig } from "./types";

// ---------------------------------------------------------------------------
// Vault Exposure Map
// ---------------------------------------------------------------------------

/**
 * Maps vault addresses to their underlying exposure data.
 * Each vault entry defines the protocol, underlying asset, oracle feeds,
 * and DEX pools to monitor for depeg signals.
 *
 * IMPORTANT: This must be manually maintained. When adding new vaults
 * to the optimizer, also add them here with their exposure data.
 */
export const VAULT_EXPOSURE_MAP: Record<string, VaultExposure> = {
  // Morpho vaults on Base — USR exposure
  // Usual Boosted USDC (Re7 Labs curated) — has direct USR collateral exposure
  "0x0dB2b2e3a45E6e9e30B68C4461bBe42Bfa125011": {
    protocol: "morpho",
    underlying: "USR",
    underlyingAddress: "0x35282d87011f87508D457F08252Bc5bFa52E10A0" as `0x${string}`,
    dexPools: [
      // Ethereum Curve USR/USDC pool — primary signal source per Resolv replay
      {
        address: "0x5D13179C5FA40B87D53ff67Ca26245d3d6B76e01" as `0x${string}`,
        asset: "USR",
        chain: "ethereum",
      },
    ],
  },

  // Moonwell Flagship USDC (Gauntlet curated) — USDC exposure, low risk
  "0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca": {
    protocol: "morpho",
    underlying: "USDC",
    dexPools: [], // USDC: no DEX depeg monitoring needed for major stablecoin
  },

  // Steakhouse USDC
  "0xbEef047a543E45807105E51A8BBEFCc5950fcfBa": {
    protocol: "morpho",
    underlying: "USDC",
    dexPools: [],
  },

  // YO Protocol vault — yoUSD
  "0x4879712c5D1A98C0B88Fb700daFF5c65d12Fd729": {
    protocol: "yo",
    underlying: "USDC",
    dexPools: [],
  },
};

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

export const THRESHOLDS = {
  /** 3% off-peg triggers EXIT (after 2 consecutive polls / 1 min) */
  DEPEG_EXIT_PCT: 0.03,
  /** 1.5% off-peg triggers ALERT warning */
  DEPEG_WARN_PCT: 0.015,
  /** 15% TVL drop in 30-min rolling window triggers EXIT */
  TVL_DROP_EXIT_PCT: 0.15,
  /** 2% share price drop in 15-min rolling window triggers EXIT */
  SHARE_PRICE_DROP_PCT: 0.02,
  /** Consecutive polls required to confirm a depeg trigger */
  CONSECUTIVE_POLLS_REQUIRED: 2,
  /** Rolling window for TVL drop detection (ms) */
  TVL_WINDOW_MS: 30 * 60 * 1000,
  /** Rolling window for share price drop detection (ms) */
  SHARE_PRICE_WINDOW_MS: 15 * 60 * 1000,
  /** Ponder staleness threshold (seconds) */
  PONDER_STALE_SECONDS: 60,
  /** Incident auto-close TTL (seconds) */
  INCIDENT_TTL_SECONDS: 3600,
  /** Dead-man switch: max age of last_check_at before dashboard shows DOWN (ms) */
  DEADMAN_SWITCH_MS: 5 * 60 * 1000,
} as const;

// ---------------------------------------------------------------------------
// Environment loader
// ---------------------------------------------------------------------------

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`[Sentinel] Required environment variable ${key} is not set`);
  }
  return value;
}

export function loadConfig(): SentinelConfig {
  const vaults: VaultConfig[] = Object.entries(VAULT_EXPOSURE_MAP).map(([address, exposure]) => ({
    address: address as `0x${string}`,
    exposure,
  }));

  return {
    vaults,
    thresholds: THRESHOLDS,
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || "30000", 10),
    databaseUrl: requireEnv("DATABASE_URL"),
    redisUrl: requireEnv("REDIS_URL"),
    erpcUrl: requireEnv("ERPC_URL"),
    ponderGraphqlUrl: process.env.PONDER_GRAPHQL_URL || "http://localhost:42069",
    pagerdutyRoutingKey: requireEnv("PAGERDUTY_ROUTING_KEY"),
    resendApiKey: requireEnv("RESEND_API_KEY"),
    zerodevProjectId: requireEnv("ZERODEV_PROJECT_ID"),
    zerodevBundlerUrl: requireEnv("ZERODEV_BUNDLER_URL"),
    paymasterUrl: requireEnv("PAYMASTER_URL"),
    sessionEncryptionKey: requireEnv("SESSION_ENCRYPTION_KEY"),
  };
}
