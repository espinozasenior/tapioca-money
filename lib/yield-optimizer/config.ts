// Yield Optimizer Configuration
// Protocol addresses for Base Mainnet (Production)

import { getAddress } from "viem";

// Note: Custom address registration not needed - SDK uses market params directly
// The Morpho Blue SDK will use the explicit market params we provide
// instead of requiring global address registration

export const CHAIN_CONFIG = {
  chainId: 8453,
  name: "Base",
  // Use environment variable for RPC URL (e.g., Alchemy for better rate limits)
  // Falls back to public endpoint if not configured
  rpcUrl: process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org",
} as const;

// USDC on Base Mainnet (Circle official)
// https://developers.circle.com/stablecoins/usdc-contract-addresses
// Using getAddress() ensures proper EIP-55 checksum for viem
export const USDC_ADDRESS = getAddress("0x833589fCD6eDb6E08f4c7C32d4f71b54bdA02913");

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
} as const;


// Morpho USDC Market Parameters (Base Mainnet)
// Default market params - actual vaults fetched dynamically via morpho-api.ts
export const MORPHO_USDC_MARKET_PARAMS = {
  loanToken: USDC_ADDRESS,
  collateralToken: USDC_ADDRESS,
  oracle: "0x0000000000000000000000000000000000000000" as `0x${string}`,
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC" as `0x${string}`, // Adaptive Curve IRM
  lltv: 0n,
} as const;

// Known production USDC vaults on Base Mainnet (fallback if API unavailable)
// These are curated vaults - fetch dynamically via morpho-api.ts for live data
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
  aave: 0.038,   // 3.8% - mainnet estimate
  moonwell: 0.042, // 4.2% - mainnet estimate
} as const;
