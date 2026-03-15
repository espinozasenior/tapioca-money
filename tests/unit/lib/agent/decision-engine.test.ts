import { describe, it, expect, vi, beforeEach } from "vitest";
import { YieldDecisionEngine } from "@/lib/agent/decision-engine";
import { MorphoClient } from "@/lib/morpho/api-client";
import { REBALANCE_THRESHOLDS } from "@/lib/config";

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

// Mock YoApiClient — return empty arrays so YO doesn't interfere with Morpho-focused tests
vi.mock("@/lib/yo/api-client", () => {
  const mockYoClient = {
    fetchVaults: vi.fn().mockResolvedValue([]),
    fetchUserPositions: vi.fn().mockResolvedValue([]),
  };
  return {
    YoApiClient: class {
      fetchVaults = mockYoClient.fetchVaults;
      fetchUserPositions = mockYoClient.fetchUserPositions;
    },
    yoApiClient: mockYoClient,
  };
});

describe("YieldDecisionEngine", () => {
  let decisionEngine: YieldDecisionEngine;
  let mockMorphoClient: any;

  const mockUserAddress = "0x1234567890123456789012345678901234567890" as `0x${string}`;
  const mockCurrentVaultAddress = "0x1111111111111111111111111111111111111111";
  const mockBetterVaultAddress = "0x2222222222222222222222222222222222222222";

  beforeEach(async () => {
    vi.clearAllMocks();
    mockMorphoClient = new MorphoClient();
    // Re-set YO mock defaults after clearAllMocks
    const { yoApiClient } = await import("@/lib/yo/api-client");
    (yoApiClient.fetchVaults as any).mockResolvedValue([]);
    (yoApiClient.fetchUserPositions as any).mockResolvedValue([]);
    decisionEngine = new YieldDecisionEngine(mockMorphoClient);
  });

  describe("evaluateRebalancing", () => {
    it("should return false if user has no active positions", async () => {
      mockMorphoClient.fetchUserPositions.mockResolvedValue([]);

      const result = await decisionEngine.evaluateRebalancing(mockUserAddress);

      expect(result.shouldRebalance).toBe(false);
      expect(result.reason).toBe("No active positions found");
    });

    it("should return false if current vault details cannot be fetched", async () => {
      mockMorphoClient.fetchUserPositions.mockResolvedValue([
        {
          vault: { address: mockCurrentVaultAddress },
          assetsUsd: 1000,
        },
      ]);
      // Vault not found in the vault list, AND individual fetch also returns null
      mockMorphoClient.fetchVaults.mockResolvedValue([]);
      mockMorphoClient.fetchVault.mockResolvedValue(null);

      const result = await decisionEngine.evaluateRebalancing(mockUserAddress);

      expect(result.shouldRebalance).toBe(false);
      expect(result.reason).toBe("Could not fetch current Morpho vault details");
    });

    it("should return false if no eligible alternative vaults found", async () => {
      mockMorphoClient.fetchUserPositions.mockResolvedValue([
        {
          vault: { address: mockCurrentVaultAddress },
          assetsUsd: 1000,
          shares: "100",
          assets: "1000",
        },
      ]);
      mockMorphoClient.fetchVault.mockResolvedValue({
        address: mockCurrentVaultAddress,
        name: "Current Vault",
        avgNetApy: 0.05,
      });
      // Return only the current vault or vaults with low liquidity
      mockMorphoClient.fetchVaults.mockResolvedValue([
        {
          address: mockCurrentVaultAddress,
          totalAssetsUsd: 1000000,
        },
        {
          address: "0x333",
          totalAssetsUsd: 0, // Low liquidity
        },
      ]);

      const result = await decisionEngine.evaluateRebalancing(mockUserAddress);

      expect(result.shouldRebalance).toBe(false);
      expect(result.reason).toBe("No eligible alternative vaults found");
      expect(result.currentVault).toBeDefined();
    });

    it("should recommend rebalance if APY improvement meets threshold", async () => {
      mockMorphoClient.fetchUserPositions.mockResolvedValue([
        {
          vault: { address: mockCurrentVaultAddress },
          assetsUsd: 1000,
          shares: "100",
          assets: "1000",
        },
      ]);
      mockMorphoClient.fetchVault.mockResolvedValue({
        address: mockCurrentVaultAddress,
        name: "Current Vault",
        avgNetApy: 0.05, // 5%
      });
      mockMorphoClient.fetchVaults.mockResolvedValue([
        {
          address: mockBetterVaultAddress,
          name: "Better Vault",
          avgNetApy: 0.1, // 10%
          totalAssetsUsd: 1000000,
        },
      ]);

      const result = await decisionEngine.evaluateRebalancing(mockUserAddress);

      expect(result.shouldRebalance).toBe(true);
      expect(result.apyImprovement).toBeCloseTo(0.05);
      expect(result.targetVault?.address).toBe(mockBetterVaultAddress);
    });

    it("should NOT recommend rebalance if APY improvement is below threshold", async () => {
      mockMorphoClient.fetchUserPositions.mockResolvedValue([
        {
          vault: { address: mockCurrentVaultAddress },
          assetsUsd: 1000,
          shares: "100",
          assets: "1000",
        },
      ]);
      mockMorphoClient.fetchVault.mockResolvedValue({
        address: mockCurrentVaultAddress,
        name: "Current Vault",
        avgNetApy: 0.05,
      });
      mockMorphoClient.fetchVaults.mockResolvedValue([
        {
          address: mockBetterVaultAddress,
          name: "Better Vault",
          avgNetApy: 0.051, // 5.1% (improvement < threshold)
          totalAssetsUsd: 1000000,
        },
      ]);

      const result = await decisionEngine.evaluateRebalancing(mockUserAddress);

      expect(result.shouldRebalance).toBe(false);
      expect(result.apyImprovement).toBeCloseTo(0.001);
    });

    it("should use lower threshold for targeted vaults", async () => {
      mockMorphoClient.fetchUserPositions.mockResolvedValue([
        {
          vault: { address: mockCurrentVaultAddress },
          assetsUsd: 1000,
          shares: "100",
          assets: "1000",
        },
      ]);
      mockMorphoClient.fetchVault.mockResolvedValue({
        address: mockCurrentVaultAddress,
        name: "Current Vault",
        avgNetApy: 0.05,
      });
      // Better vault with small improvement that matches targeted threshold but not global
      const smallImprovement = REBALANCE_THRESHOLDS.targetedApyImprovement + 0.0001;

      mockMorphoClient.fetchVaults.mockResolvedValue([
        {
          address: mockBetterVaultAddress,
          name: "Better Vault",
          avgNetApy: 0.05 + smallImprovement,
          totalAssetsUsd: 1000000,
        },
      ]);

      const targetedVaults = [mockCurrentVaultAddress];
      const result = await decisionEngine.evaluateRebalancing(mockUserAddress, targetedVaults);

      expect(result.shouldRebalance).toBe(true);
      expect(result.reason).toContain("[TARGETED]");
    });

    it("should handle errors gracefully", async () => {
      mockMorphoClient.fetchUserPositions.mockRejectedValue(new Error("Network error"));

      const result = await decisionEngine.evaluateRebalancing(mockUserAddress);

      expect(result.shouldRebalance).toBe(false);
      expect(result.reason).toContain("Error: Network error");
    });
  });

  describe("getAvailableVaults", () => {
    it("should fetch vaults from client", async () => {
      const mockVaults = [{ address: "0x123", name: "Vault 1" }];
      mockMorphoClient.fetchVaults.mockResolvedValue(mockVaults);

      const vaults = await decisionEngine.getAvailableVaults();

      expect(vaults).toEqual(mockVaults);
      expect(mockMorphoClient.fetchVaults).toHaveBeenCalled();
    });
  });

  describe("getUserPositionsWithApy", () => {
    it("should enrich user positions with APY", async () => {
      mockMorphoClient.fetchUserPositions.mockResolvedValue([
        { vault: { address: mockCurrentVaultAddress }, assets: "100" },
      ]);
      mockMorphoClient.fetchVault.mockResolvedValue({
        avgNetApy: 0.05,
      });

      const positions = await decisionEngine.getUserPositionsWithApy(mockUserAddress);

      expect(positions).toHaveLength(1);
      expect(positions[0].apy).toBe(0.05);
    });
  });

  describe("evaluateRebalancing with prefetchedVaults (P0-1)", () => {
    it("should use prefetched vaults instead of calling fetchVaults", async () => {
      mockMorphoClient.fetchUserPositions.mockResolvedValue([
        {
          vault: { address: mockCurrentVaultAddress },
          assetsUsd: 1000,
          shares: "100",
          assets: "1000",
        },
      ]);

      const prefetchedVaults = {
        morpho: [
          {
            address: mockCurrentVaultAddress,
            name: "Current Vault",
            avgNetApy: 0.05,
            totalAssetsUsd: 1000000,
          },
          {
            address: mockBetterVaultAddress,
            name: "Better Vault",
            avgNetApy: 0.1,
            totalAssetsUsd: 1000000,
          },
        ],
        yo: [],
      };

      const result = await decisionEngine.evaluateRebalancing(
        mockUserAddress,
        null,
        prefetchedVaults as any
      );

      // Should NOT call fetchVaults since we provided prefetched data
      expect(mockMorphoClient.fetchVaults).not.toHaveBeenCalled();
      // Should NOT call fetchVault for current vault APY since it is in prefetched data
      expect(mockMorphoClient.fetchVault).not.toHaveBeenCalled();
      // Should still produce a valid rebalance decision
      expect(result.shouldRebalance).toBe(true);
      expect(result.targetVault?.address).toBe(mockBetterVaultAddress);
    });

    it("should fall back to fetching vaults when prefetchedVaults is not provided", async () => {
      mockMorphoClient.fetchUserPositions.mockResolvedValue([
        {
          vault: { address: mockCurrentVaultAddress },
          assetsUsd: 1000,
          shares: "100",
          assets: "1000",
        },
      ]);
      mockMorphoClient.fetchVault.mockResolvedValue({
        address: mockCurrentVaultAddress,
        name: "Current Vault",
        avgNetApy: 0.05,
      });
      mockMorphoClient.fetchVaults.mockResolvedValue([
        {
          address: mockBetterVaultAddress,
          name: "Better Vault",
          avgNetApy: 0.1,
          totalAssetsUsd: 1000000,
        },
      ]);

      const result = await decisionEngine.evaluateRebalancing(mockUserAddress);

      // Without prefetch, should still call fetchVaults
      expect(mockMorphoClient.fetchVaults).toHaveBeenCalled();
      expect(result.shouldRebalance).toBe(true);
    });
  });

  describe("getMorphoPositionsWithApy with prefetched vaults (P1-3)", () => {
    it("should look up APY from prefetched vaults instead of calling fetchVault per position", async () => {
      mockMorphoClient.fetchUserPositions.mockResolvedValue([
        { vault: { address: mockCurrentVaultAddress, name: "Vault A" }, assets: "100" },
        { vault: { address: mockBetterVaultAddress, name: "Vault B" }, assets: "200" },
      ]);

      const prefetchedMorphoVaults = [
        { address: mockCurrentVaultAddress, name: "Vault A", avgNetApy: 0.05 },
        { address: mockBetterVaultAddress, name: "Vault B", avgNetApy: 0.08 },
      ];

      const positions = await decisionEngine.getMorphoPositionsWithApy(
        mockUserAddress,
        prefetchedMorphoVaults as any
      );

      // Should NOT call fetchVault at all -- APY comes from prefetched list
      expect(mockMorphoClient.fetchVault).not.toHaveBeenCalled();
      expect(positions).toHaveLength(2);
      expect(positions[0].apy).toBe(0.05);
      expect(positions[1].apy).toBe(0.08);
    });

    it("should fall back to fetchVault per position when no prefetched vaults given", async () => {
      mockMorphoClient.fetchUserPositions.mockResolvedValue([
        { vault: { address: mockCurrentVaultAddress }, assets: "100" },
      ]);
      mockMorphoClient.fetchVault.mockResolvedValue({ avgNetApy: 0.05 });

      const positions = await decisionEngine.getMorphoPositionsWithApy(mockUserAddress);

      // Without prefetch, should call fetchVault per position
      expect(mockMorphoClient.fetchVault).toHaveBeenCalledTimes(1);
      expect(positions[0].apy).toBe(0.05);
    });
  });

  describe("getYoPositionsWithApy with prefetched vaults (P1)", () => {
    let mockYoClient: any;

    beforeEach(async () => {
      const { yoApiClient } = await import("@/lib/yo/api-client");
      mockYoClient = yoApiClient;
    });

    it("should use prefetched YO vaults instead of calling fetchVaults", async () => {
      const yoVaultAddress = "0x4444444444444444444444444444444444444444";
      mockYoClient.fetchUserPositions.mockResolvedValue([
        {
          vaultId: "yoUSD",
          vaultAddress: yoVaultAddress,
          vaultName: "YO USDC",
          shares: 100n,
          assets: 1000n,
          assetsUsd: 1000,
        },
      ]);

      const prefetchedYoVaults = [
        {
          id: "yoUSD",
          address: yoVaultAddress,
          name: "YO USDC",
          apy: 0.07,
          tvlUsd: 5000000,
          totalAssets: 0n,
          totalShares: 0n,
          underlying: { address: "0x" as any, symbol: "USDC", decimals: 6 },
        },
      ];

      const positions = await decisionEngine.getYoPositionsWithApy(
        mockUserAddress,
        prefetchedYoVaults as any
      );

      // Should NOT call fetchVaults -- APY comes from prefetched list
      expect(mockYoClient.fetchVaults).not.toHaveBeenCalled();
      expect(positions).toHaveLength(1);
      expect(positions[0].apy).toBe(0.07);
    });

    it("should fall back to fetching vaults when no prefetch provided", async () => {
      const yoVaultAddress = "0x4444444444444444444444444444444444444444";
      mockYoClient.fetchUserPositions.mockResolvedValue([
        {
          vaultId: "yoUSD",
          vaultAddress: yoVaultAddress,
          vaultName: "YO USDC",
          shares: 100n,
          assets: 1000n,
          assetsUsd: 1000,
        },
      ]);
      mockYoClient.fetchVaults.mockResolvedValue([
        {
          id: "yoUSD",
          address: yoVaultAddress,
          name: "YO USDC",
          apy: 0.06,
          tvlUsd: 5000000,
        },
      ]);

      const positions = await decisionEngine.getYoPositionsWithApy(mockUserAddress);

      // Without prefetch, should call fetchVaults
      expect(mockYoClient.fetchVaults).toHaveBeenCalled();
      expect(positions).toHaveLength(1);
      expect(positions[0].apy).toBe(0.06);
    });
  });
});
