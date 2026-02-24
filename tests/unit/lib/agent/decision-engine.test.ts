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

describe("YieldDecisionEngine", () => {
  let decisionEngine: YieldDecisionEngine;
  let mockMorphoClient: any;

  const mockUserAddress = "0x1234567890123456789012345678901234567890" as `0x${string}`;
  const mockCurrentVaultAddress = "0x1111111111111111111111111111111111111111";
  const mockBetterVaultAddress = "0x2222222222222222222222222222222222222222";

  beforeEach(() => {
    mockMorphoClient = new MorphoClient();
    decisionEngine = new YieldDecisionEngine(mockMorphoClient);
    vi.clearAllMocks();
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
      mockMorphoClient.fetchVault.mockResolvedValue(null);

      const result = await decisionEngine.evaluateRebalancing(mockUserAddress);

      expect(result.shouldRebalance).toBe(false);
      expect(result.reason).toBe("Could not fetch current vault details");
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
});
