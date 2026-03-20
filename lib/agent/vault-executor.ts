/**
 * Unified VaultExecutor Interface
 *
 * Eliminates protocol-specific branching in API routes by providing
 * a polymorphic interface for vault deposit and redeem operations.
 */

import type { SessionKey7702Authorization } from "@/lib/security/session-encryption";

// ---------------------------------------------------------------------------
// Shared context: session/auth data that every protocol executor needs
// ---------------------------------------------------------------------------

export interface ExecutorContext {
  /** The smart account (EOA for 7702, smart wallet for 4337) */
  smartAccountAddress: `0x${string}`;
  /** Deserialized kernel account blob */
  serializedAccount: string;
  /** Full decrypted auth — executors may need legacy fields */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  decryptedAuth: { type: string; [key: string]: any };
  /** Approved vault addresses from the stored registration */
  approvedVaults: `0x${string}`[];
}

// ---------------------------------------------------------------------------
// Deposit types
// ---------------------------------------------------------------------------

export interface DepositParams {
  vaultAddress: `0x${string}`;
  /** Human-readable amount, e.g. "10.50" */
  amount: string;
}

export interface DepositResult {
  success: boolean;
  txHash?: string;
  userOpHash?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Redeem types
// ---------------------------------------------------------------------------

export interface RedeemParams {
  vaultAddress: `0x${string}`;
  shares: bigint;
  receiver: `0x${string}`;
}

export interface RedeemResult {
  success: boolean;
  txHash?: string;
  userOpHash?: string;
  error?: string;
  redeemStatus?: "instant" | "queued";
}

// ---------------------------------------------------------------------------
// The interface
// ---------------------------------------------------------------------------

export interface VaultExecutor {
  deposit(ctx: ExecutorContext, params: DepositParams): Promise<DepositResult>;
  redeem(ctx: ExecutorContext, params: RedeemParams): Promise<RedeemResult>;
}

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class DepositError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "DepositError";
  }
}

export class RedeemError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "RedeemError";
  }
}

// ---------------------------------------------------------------------------
// Helper: extract legacy 7702 fields from the decrypted auth
// ---------------------------------------------------------------------------

export function extractLegacy7702Fields(decryptedAuth: ExecutorContext["decryptedAuth"]) {
  if (decryptedAuth.type !== "zerodev-7702-session") return undefined;
  const legacy = decryptedAuth as unknown as SessionKey7702Authorization;
  return {
    sessionPrivateKey: (legacy as any).sessionPrivateKey as `0x${string}` | undefined,
    eip7702SignedAuth: (legacy as any).eip7702SignedAuth,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const executorCache = new Map<string, VaultExecutor>();

export function getExecutor(protocol: string): VaultExecutor {
  const key = protocol.toLowerCase();

  const cached = executorCache.get(key);
  if (cached) return cached;

  let executor: VaultExecutor;

  switch (key) {
    case "yo": {
      // Lazy import to avoid pulling YO deps when not needed
      const { YoVaultExecutor } = require("@/lib/agent/yo-vault-executor");
      executor = new YoVaultExecutor();
      break;
    }
    case "morpho":
    default: {
      const { MorphoVaultExecutor } = require("@/lib/agent/morpho-vault-executor");
      executor = new MorphoVaultExecutor();
      break;
    }
  }

  executorCache.set(key, executor);
  return executor;
}
