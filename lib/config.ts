// Yield Optimizer Configuration
// Protocol addresses for Base Mainnet (Production)

import { getAddress, parseUnits } from "viem";
import { ZERODEV_USDC_PAYMASTER_BASE } from "@/lib/zerodev/constants";

/**
 * Customer-paid USDC send via ZeroDev ERC-20 paymaster.
 * See tasks/spec-usdc-send.md §14 for rationale.
 */
export const USDC_PAYMASTER_ADDRESS = ZERODEV_USDC_PAYMASTER_BASE;

/** Display-only fee shown in the send preview ("~$0.05 USDC"). */
export const FEE_DISPLAY_USDC = "0.05";

/** Hard ceiling on the per-send `USDC.approve(paymaster, …)` call. */
export const FEE_CAP_USDC = parseUnits("0.20", 6); // 200_000n

/** Per-transfer USDC ceiling; mirrors transfer-session CallPolicy. */
export const MAX_USDC_PER_TRANSFER = parseUnits("500", 6);

/** Client-side feature flag helper. Reads NEXT_PUBLIC_ENABLE_USDC_PAYMASTER, defaults ON. */
export function isUsdcPaymasterEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_USDC_PAYMASTER !== "false";
}

/** Server-side feature flag helper. Reads ENABLE_USDC_PAYMASTER OR the public flag, defaults ON. */
export function isUsdcPaymasterEnabledServer(): boolean {
  const server = process.env.ENABLE_USDC_PAYMASTER;
  if (server != null) return server !== "false";
  return process.env.NEXT_PUBLIC_ENABLE_USDC_PAYMASTER !== "false";
}

// Note: Custom address registration not needed - SDK uses market params directly
// The Morpho Blue SDK will use the explicit market params we provide
// instead of requiring global address registration

/**
 * Resolve the Base (chain 8453) RPC URL with eRPC-aware suffixing.
 *
 * Priority order (matches sentinel/signals/onchain.ts:getClient so client +
 * server agree):
 * 1. NEXT_PUBLIC_ERPC_URL — the load-balanced eRPC proxy. We auto-append
 *    `/main/evm/8453` unless it already carries the suffix or points at a
 *    direct provider.
 * 2. NEXT_PUBLIC_BASE_RPC_URL — legacy direct provider URL (Alchemy/etc).
 *    Kept for back-compat; subject to per-key rate limits and monthly caps.
 * 3. https://mainnet.base.org — public fallback, heavily rate-limited.
 *
 * Preferring eRPC over a direct Alchemy URL fixes the "Monthly capacity
 * reached" HTML-returned-as-JSON error that viem chokes on, and the 429
 * burst that followed it.
 */
function resolveBaseRpcUrl(): string {
  const erpc = process.env.NEXT_PUBLIC_ERPC_URL;
  if (erpc) {
    const isDirect =
      erpc.includes("/main/evm/") ||
      /alchemy|infura|quicknode|ankr|publicnode|base\.org/i.test(erpc);
    return isDirect ? erpc : `${erpc}/main/evm/8453`;
  }
  return process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org";
}

export const CHAIN_CONFIG = {
  chainId: 8453,
  name: "Base",
  rpcUrl: resolveBaseRpcUrl(),
} as const;

// USDC on Base Mainnet (Circle official)
// https://developers.circle.com/stablecoins/usdc-contract-addresses
// Using getAddress() ensures proper EIP-55 checksum for viem
export const USDC_ADDRESS = getAddress("0x833589fCD6eDb6E08f4c7C32d4f71b54bdA02913");

// --- Multi-Asset Token Registry ---
// Canonical map of supported ERC-20 tokens on Base with address, decimals, icon, and per-call limits.
// Single source of truth — all token metadata flows from here.

export interface TokenConfig {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  icon: string;
  /** Maximum amount per session key call (in token's smallest unit) */
  maxPerCall: bigint;
}

export const SUPPORTED_TOKENS: Record<string, TokenConfig> = {
  USDC: {
    address: getAddress("0x833589fCD6eDb6E08f4c7C32d4f71b54bdA02913"),
    symbol: "USDC",
    decimals: 6,
    icon: "/usdc.svg",
    maxPerCall: BigInt(10_000) * BigInt(1e6) + 1n, // 10,000 USDC (+1 for permissionHash uniqueness)
  },
  WETH: {
    address: getAddress("0x4200000000000000000000000000000000000006"),
    symbol: "WETH",
    decimals: 18,
    icon: "/eth.svg",
    maxPerCall: BigInt(3) * BigInt(1e18), // 3 ETH
  },
  cbBTC: {
    address: getAddress("0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf"),
    symbol: "cbBTC",
    decimals: 8,
    icon: "/btc.svg",
    maxPerCall: BigInt(1) * BigInt(1e8), // 1 BTC
  },
  EURC: {
    address: getAddress("0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42"),
    symbol: "EURC",
    decimals: 6,
    icon: "/eur.svg",
    maxPerCall: BigInt(10_000) * BigInt(1e6) + 1n, // 10,000 EURC
  },
} as const;

/** Look up a token config by symbol (case-insensitive) */
export function getTokenBySymbol(symbol: string): TokenConfig | undefined {
  return SUPPORTED_TOKENS[symbol.toUpperCase()] ?? SUPPORTED_TOKENS[symbol];
}

/** Look up a token config by address (case-insensitive) */
export function getTokenByAddress(address: string): TokenConfig | undefined {
  const lower = address.toLowerCase();
  return Object.values(SUPPORTED_TOKENS).find((t) => t.address.toLowerCase() === lower);
}

/** Get token icon path, with fallback to a generic coin icon */
export function getTokenIcon(symbol: string): string {
  const token = getTokenBySymbol(symbol);
  return token?.icon ?? "/usdc.svg"; // fallback to USDC icon for unknown tokens
}

// Protocol deployments - Base Mainnet
// https://docs.morpho.org/get-started/resources/addresses/
export const PROTOCOLS = {
  morpho: {
    enabled: true,
    name: "Morpho",
    core: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb" as `0x${string}`,
    bundler: "0x23055618898e202386e6c13955a58D3C68200BFB" as `0x${string}`,
    vaultFactory: "0xA1D94F746dEfa1928926b84fB2596c06926C0405" as `0x${string}`,
    registry: "0x3696c5eAe4a7Ffd04Ea163564571E9CD8Ed9364e" as `0x${string}`,
    irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC" as `0x${string}`, // Adaptive Curve IRM
    morphoToken: "0x58D97B57BB95320F9a05dC918Aef65434969c2B2" as `0x${string}`,
    rewardsDistributor: "0x330eefa8a787552DC5cAd3C3cA644844B1E61DDB" as `0x${string}`,
  },
  aave: {
    enabled: true, // Aave V3 deployed on Base Mainnet
    name: "Aave",
    pool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5" as `0x${string}`,
    aUsdc: "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB" as `0x${string}`,
  },
  moonwell: {
    enabled: true,
    name: "Moonwell",
    comptroller: "0xfBb21d0380beE3312B33c4353c8936a0F13EF26C" as `0x${string}`,
    mUsdc: "0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22" as `0x${string}`,
  },
  yo: {
    enabled: true,
    name: "YO Protocol",
  },
} as const;

// Morpho USDC Market Parameters (Base Mainnet)
// Default market params - actual vaults fetched dynamically via MorphoClient
export const MORPHO_USDC_MARKET_PARAMS = {
  loanToken: USDC_ADDRESS,
  collateralToken: USDC_ADDRESS,
  oracle: "0x0000000000000000000000000000000000000000" as `0x${string}`,
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC" as `0x${string}`, // Adaptive Curve IRM
  lltv: 0n,
} as const;

// Known production USDC vaults on Base Mainnet (fallback if API unavailable)
// These are curated vaults - fetch dynamically via MorphoClient for live data
export const KNOWN_USDC_VAULTS = {
  steakhouse: {
    name: "Steakhouse USDC",
    description: "High liquidity USDC vault curated by Steakhouse",
  },
  moonwellFlagship: {
    name: "Moonwell Flagship USDC",
    description: "USDC vault allocating to Moonwell markets",
  },
  gauntletPrime: {
    name: "Gauntlet Prime USDC",
    description: "Yield optimized USDC strategy by Gauntlet",
  },
} as const;
// Estimated APYs for disabled protocols (for UI display only)
export const ESTIMATED_APYS = {
  morpho: 0.045, // 4.5%
  aave: 0.038, // 3.8% - mainnet estimate
  moonwell: 0.042, // 4.2% - mainnet estimate
} as const;

// Vault quality gates are enforced in two layers:
// 1. GraphQL: lib/morpho/queries.ts — $10M TVL, 50% APY cap, whitelisted-only
// 2. Risk scoring: lib/morpho/risk-scoring.ts — same gates as defense-in-depth

// Shared rebalance thresholds — used by both the UI evaluator and agent decision engine
export const REBALANCE_THRESHOLDS = {
  minApyImprovement: 0.005, // 0.5% minimum APY gain
  targetedApyImprovement: 0.001, // 0.1% when APY monitor flags a vault
  minLiquidityUsd: 100_000, // $100k minimum vault liquidity
  slippagePct: 0.001, // 0.1% slippage estimate for stablecoins
  executionBufferPct: 0.005, // 0.5% execution buffer (previewRedeem rounding + timing)
  // Gas is fully sponsored by ZeroDev paymaster — no user-facing gas cost.
  // Project cost tracked separately for monitoring, not used in rebalance decisions.
  projectGasCostUsd: 0.5, // Approximate project cost per UserOp (monitoring only)
} as const;
