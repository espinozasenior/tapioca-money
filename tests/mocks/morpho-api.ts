/**
 * Mock Morpho GraphQL API for Testing
 */

export const mockMorphoVaults = [
  {
    id: "0xVAULT1_HIGH_APY_12345678901234567890",
    address: "0xVAULT1234567890123456789012345678901234" as `0x${string}`,
    name: "High APY Vault",
    symbol: "hAPY",
    asset: {
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
      symbol: "USDC",
      decimals: 6,
    },
    state: {
      apy: 0.1, // 10% APY
      totalAssets: "5000000000000", // $5M
      totalSupply: "5000000000000",
    },
    metadata: {
      description: "High yield USDC vault",
      curators: ["Curator 1"],
    },
  },
  {
    id: "0xVAULT2_MEDIUM_APY_23456789012345678901",
    address: "0xVAULT5678901234567890123456789012345678" as `0x${string}`,
    name: "Medium APY Vault",
    symbol: "mAPY",
    asset: {
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      symbol: "USDC",
      decimals: 6,
    },
    state: {
      apy: 0.08, // 8% APY
      totalAssets: "10000000000000", // $10M
      totalSupply: "10000000000000",
    },
    metadata: {
      description: "Medium yield USDC vault",
      curators: ["Curator 2"],
    },
  },
  {
    id: "0xVAULT3_LOW_APY_34567890123456789012",
    address: "0xVAULT9012345678901234567890123456789012" as `0x${string}`,
    name: "Low APY Vault",
    symbol: "lAPY",
    asset: {
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      symbol: "USDC",
      decimals: 6,
    },
    state: {
      apy: 0.05, // 5% APY
      totalAssets: "2000000000000", // $2M
      totalSupply: "2000000000000",
    },
    metadata: {
      description: "Low risk, low yield USDC vault",
      curators: ["Curator 3"],
    },
  },
];

/**
 * Mock user positions in Morpho vaults
 */
export function mockMorphoPositions(userAddress: string) {
  return [
    {
      user: userAddress,
      vault: mockMorphoVaults[1], // Medium APY vault (8%)
      shares: "100000000", // 100 USDC in shares
      assets: "100000000", // 100 USDC in assets
    },
  ];
}

/**
 * Mock Morpho GraphQL API responses
 */
export function mockMorphoAPI() {
  // This would typically use MSW to mock GraphQL requests
  // For now, we'll use a simple function mock approach
  return {
    fetchVaults: async () => mockMorphoVaults,
    fetchUserPositions: async (address: string) => mockMorphoPositions(address),
  };
}

/**
 * Mock empty positions (user has no vault positions)
 */
export function mockEmptyPositions() {
  return [];
}

/**
 * Mock vault with low liquidity (should be filtered out)
 */
export const mockLowLiquidityVault = {
  id: "0xVAULT_LOW_LIQ_45678901234567890123",
  address: "0xLOWLIQ12345678901234567890123456789012" as `0x${string}`,
  name: "Low Liquidity Vault",
  symbol: "llAPY",
  asset: {
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    symbol: "USDC",
    decimals: 6,
  },
  state: {
    apy: 0.15, // 15% APY (very high!)
    totalAssets: "50000000", // Only $50k (below min liquidity)
    totalSupply: "50000000",
  },
  metadata: {
    description: "High APY but low liquidity - should be filtered",
    curators: ["Small Curator"],
  },
};
