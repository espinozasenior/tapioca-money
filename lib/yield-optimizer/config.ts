// Yield Optimizer Configuration
// Protocol addresses for Base Sepolia testnet

// Note: Custom address registration not needed - SDK uses market params directly
// The Morpho Blue SDK will use the explicit market params we provide
// instead of requiring global address registration

export const CHAIN_CONFIG = {
  chainId: 84532,
  name: "Base Sepolia",
  rpcUrl: "https://sepolia.base.org",
} as const;

// USDC on Base Sepolia
export const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

// Protocol deployments - verified on Base Sepolia
export const PROTOCOLS = {
  morpho: {
    enabled: true,
    name: "Morpho",
    // Confirmed on Base Sepolia - https://docs.morpho.org/get-started/resources/addresses/
    core: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb" as `0x${string}`,
    bundler: "0x23055618898e202386e6c13955a58D3C68200BFB" as `0x${string}`,
    vaultFactory: "0xA1D94F746dEfa1928926b84fB2596c06926C0405" as `0x${string}`,
    registry: "0x3696c5eAe4a7Ffd04Ea163564571E9CD8Ed9364" as `0x${string}`,
    irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC" as `0x${string}`, // Adaptive Curve IRM
  },
  aave: {
    enabled: false, // Not officially published for Base Sepolia - disable until verified
    name: "Aave",
    pool: null as `0x${string}` | null,
    aUsdc: null as `0x${string}` | null,
  },
  moonwell: {
    enabled: false, // No Base Sepolia deployment - mainnet only
    name: "Moonwell",
    comptroller: null as `0x${string}` | null,
    mUsdc: null as `0x${string}` | null,
  },
} as const;


// Morpho USDC Market Parameters (Base Sepolia)
// This is a supply-only market configuration for testing
export const MORPHO_USDC_MARKET_PARAMS = {
  loanToken: USDC_ADDRESS,
  collateralToken: USDC_ADDRESS, // Using USDC as collateral (supply-only)
  oracle: "0x0000000000000000000000000000000000000000" as `0x${string}`, // No oracle for supply-only
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC" as `0x${string}`, // Adaptive Curve IRM
  lltv: 0n, // 0% LLTV = supply-only market (no borrowing)
} as const;
// Estimated APYs for disabled protocols (for UI display only)
export const ESTIMATED_APYS = {
  morpho: 0.045, // 4.5%
  aave: 0.038,   // 3.8% - mainnet estimate
  moonwell: 0.042, // 4.2% - mainnet estimate
} as const;
