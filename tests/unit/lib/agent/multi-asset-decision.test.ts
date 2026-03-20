import { describe, it, expect, vi, beforeEach } from "vitest";
import { YieldDecisionEngine } from "@/lib/agent/decision-engine";
import { MorphoClient } from "@/lib/morpho/api-client";

// Hoist mock functions so they can be referenced inside vi.mock factories
const { mockYoFetchVaults, mockYoFetchUserPositions } = vi.hoisted(() => ({
  mockYoFetchVaults: vi.fn(),
  mockYoFetchUserPositions: vi.fn(),
}));

// Mock MorphoClient
vi.mock("@/lib/morpho/api-client", () => {
  return {
    MorphoClient: class {
      fetchUserPositions = vi.fn();
      fetchVault = vi.fn();
      fetchVaults = vi.fn();
    },
  };
});

// Mock YoApiClient — configurable per test
vi.mock("@/lib/yo/api-client", () => {
  return {
    YoApiClient: class {
      fetchVaults = mockYoFetchVaults;
      fetchUserPositions = mockYoFetchUserPositions;
    },
    yoApiClient: {
      fetchVaults: mockYoFetchVaults,
      fetchUserPositions: mockYoFetchUserPositions,
    },
  };
});

describe("Multi-Asset Decision Engine", () => {
  let engine: YieldDecisionEngine;
  let mockMorphoClient: any;

  const USER = "0x1234567890123456789012345678901234567890" as `0x${string}`;
  const USDC_VAULT = "0x1111111111111111111111111111111111111111";
  const BETTER_USDC_VAULT = "0x2222222222222222222222222222222222222222";
  const WETH_VAULT = "0x3333333333333333333333333333333333333333";
  const CBBTC_VAULT = "0x4444444444444444444444444444444444444444";

  const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
  const CBBTC_ADDRESS = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";

  beforeEach(() => {
    vi.clearAllMocks();
    mockMorphoClient = new MorphoClient();
    mockYoFetchVaults.mockResolvedValue([]);
    mockYoFetchUserPositions.mockResolvedValue([]);
    engine = new YieldDecisionEngine(mockMorphoClient);
  });

  describe("same-asset rebalance invariant", () => {
    it("should NOT recommend rebalancing USDC position to a WETH vault", async () => {
      // User has USDC position in Morpho
      mockMorphoClient.fetchUserPositions.mockResolvedValue([
        {
          vault: { address: USDC_VAULT },
          assetsUsd: 5000,
          shares: "5000000000",
          assets: "5000000000",
        },
      ]);
      mockMorphoClient.fetchVaults.mockResolvedValue([
        {
          address: USDC_VAULT,
          name: "yoUSD",
          avgNetApy: 0.05,
          totalAssetsUsd: 1000000,
        },
      ]);

      // YO has a WETH vault with higher APY
      mockYoFetchVaults.mockResolvedValue([
        {
          id: "yoETH",
          address: WETH_VAULT,
          name: "yoETH",
          apy: 0.15, // 15% — much higher than 5%
          tvlUsd: 5000000,
          underlying: { address: WETH_ADDRESS, symbol: "WETH", decimals: 18 },
          totalAssets: 0n,
          totalShares: 0n,
        },
      ]);

      const result = await engine.evaluateRebalancing(USER);

      // Should NOT suggest moving USDC into a WETH vault
      expect(result.shouldRebalance).toBe(false);
      expect(result.reason).toContain("No eligible alternative vaults found");
    });

    it("should recommend same-asset rebalance (USDC → USDC)", async () => {
      mockMorphoClient.fetchUserPositions.mockResolvedValue([
        {
          vault: { address: USDC_VAULT },
          assetsUsd: 5000,
          shares: "5000000000",
          assets: "5000000000",
        },
      ]);
      mockMorphoClient.fetchVaults.mockResolvedValue([
        {
          address: USDC_VAULT,
          name: "Current USDC",
          avgNetApy: 0.03,
          totalAssetsUsd: 1000000,
        },
      ]);

      // YO has a USDC vault with higher APY
      mockYoFetchVaults.mockResolvedValue([
        {
          id: "yoUSD",
          address: BETTER_USDC_VAULT,
          name: "yoUSD",
          apy: 0.1,
          tvlUsd: 5000000,
          underlying: { address: USDC_ADDRESS, symbol: "USDC", decimals: 6 },
          totalAssets: 0n,
          totalShares: 0n,
        },
      ]);

      const result = await engine.evaluateRebalancing(USER);

      expect(result.shouldRebalance).toBe(true);
      expect(result.targetVault?.address).toBe(BETTER_USDC_VAULT);
      expect(result.targetVault?.underlyingSymbol).toBe("USDC");
    });

    it("should track underlying on currentVault in the decision", async () => {
      mockMorphoClient.fetchUserPositions.mockResolvedValue([
        {
          vault: { address: USDC_VAULT },
          assetsUsd: 5000,
          shares: "5000000000",
          assets: "5000000000",
        },
      ]);
      mockMorphoClient.fetchVaults.mockResolvedValue([
        {
          address: USDC_VAULT,
          name: "Morpho USDC",
          avgNetApy: 0.05,
          totalAssetsUsd: 1000000,
        },
      ]);
      mockYoFetchVaults.mockResolvedValue([]);

      const result = await engine.evaluateRebalancing(USER);

      expect(result.currentVault?.underlyingSymbol).toBe("USDC");
    });
  });

  describe("multi-asset YO vaults", () => {
    it("should discover all YO vaults without asset filter", async () => {
      mockMorphoClient.fetchUserPositions.mockResolvedValue([]);
      mockMorphoClient.fetchVaults.mockResolvedValue([]);

      mockYoFetchVaults.mockResolvedValue([
        {
          id: "yoUSD",
          address: "0xa1",
          name: "yoUSD",
          apy: 0.05,
          tvlUsd: 1000000,
          underlying: { address: USDC_ADDRESS, symbol: "USDC", decimals: 6 },
          totalAssets: 0n,
          totalShares: 0n,
        },
        {
          id: "yoETH",
          address: "0xa2",
          name: "yoETH",
          apy: 0.08,
          tvlUsd: 2000000,
          underlying: { address: WETH_ADDRESS, symbol: "WETH", decimals: 18 },
          totalAssets: 0n,
          totalShares: 0n,
        },
        {
          id: "yoBTC",
          address: "0xa3",
          name: "yoBTC",
          apy: 0.03,
          tvlUsd: 3000000,
          underlying: { address: CBBTC_ADDRESS, symbol: "cbBTC", decimals: 8 },
          totalAssets: 0n,
          totalShares: 0n,
        },
      ]);

      const vaults = await engine.getAvailableYoVaults();

      expect(vaults).toHaveLength(3);
      // Verify fetchVaults was called without asset filter
      expect(mockYoFetchVaults).toHaveBeenCalledWith(8453);
    });

    it("Morpho vaults should still be USDC-filtered", async () => {
      mockMorphoClient.fetchVaults.mockResolvedValue([]);

      await engine.getAvailableMorphoVaults();

      expect(mockMorphoClient.fetchVaults).toHaveBeenCalledWith(8453, "USDC", 20);
    });
  });

  describe("YO position with non-USDC underlying", () => {
    it("should resolve underlyingSymbol for YO position from vault map", async () => {
      // User has WETH in yoETH vault
      mockYoFetchUserPositions.mockResolvedValue([
        {
          vaultId: "yoETH",
          vaultAddress: WETH_VAULT,
          vaultName: "yoETH",
          shares: 1000000000000000000n,
          assets: 1000000000000000000n,
          assetsUsd: 3000,
        },
      ]);
      mockMorphoClient.fetchUserPositions.mockResolvedValue([]);
      mockMorphoClient.fetchVaults.mockResolvedValue([]);

      mockYoFetchVaults.mockResolvedValue([
        {
          id: "yoETH",
          address: WETH_VAULT,
          name: "yoETH",
          apy: 0.08,
          tvlUsd: 2000000,
          underlying: { address: WETH_ADDRESS, symbol: "WETH", decimals: 18 },
          totalAssets: 0n,
          totalShares: 0n,
        },
      ]);

      const result = await engine.evaluateRebalancing(USER);

      // The WETH position should be recognized with correct underlying
      expect(result.currentVault?.underlyingSymbol).toBe("WETH");
      expect(result.currentVault?.underlyingAddress?.toLowerCase()).toBe(
        WETH_ADDRESS.toLowerCase()
      );
    });
  });
});
