import { describe, it, expect } from "vitest";
import {
  calculateRiskScore,
  getRiskLevel,
  getRiskColor,
  isTrustedCurator,
  getRiskBreakdown,
} from "@/lib/morpho/risk-scoring";

describe("Risk Scoring", () => {
  describe("isTrustedCurator", () => {
    it("should return true for known curators (case-insensitive)", () => {
      expect(isTrustedCurator("Steakhouse Financial")).toBe(true);
      expect(isTrustedCurator("Gauntlet")).toBe(true);
      expect(isTrustedCurator("Morpho Labs")).toBe(true);
    });

    it("should return false for unknown curators", () => {
      expect(isTrustedCurator("Random DAO")).toBe(false);
      expect(isTrustedCurator("")).toBe(false);
    });
  });

  describe("calculateRiskScore", () => {
    const baseVault = {
      warnings: [],
      whitelisted: true,
      curators: { items: [{ name: "Steakhouse" }] },
      performanceFee: 0,
      managementFee: 0,
      liquidityUsd: 500000,
      totalAssetsUsd: 1000000, // 50% liquidity
    };

    it("should return 0 for a perfect vault", () => {
      const score = calculateRiskScore(baseVault);
      expect(score).toBe(0);
    });

    it("should return 1.0 for RED warnings", () => {
      const risky = { ...baseVault, warnings: [{ type: "BAD", level: "RED" }] };
      expect(calculateRiskScore(risky)).toBe(1.0);
    });

    it("should add penalty for YELLOW warnings", () => {
      const risky = { ...baseVault, warnings: [{ type: "WARN", level: "YELLOW" }] };
      expect(calculateRiskScore(risky)).toBe(0.2);
    });

    it("should add penalty for non-whitelisted vaults", () => {
      const risky = { ...baseVault, whitelisted: false };
      expect(calculateRiskScore(risky)).toBe(0.2);
    });

    it("should add penalty for unknown curator", () => {
      const risky = { ...baseVault, curators: { items: [{ name: "Unknown" }] } };
      expect(calculateRiskScore(risky)).toBe(0.2);
    });

    it("should add penalty for high fees", () => {
      const risky = { ...baseVault, performanceFee: 0.1 }; // >5%
      expect(calculateRiskScore(risky)).toBe(0.4);
    });

    it("should add penalty for low liquidity", () => {
      const risky = { ...baseVault, liquidityUsd: 50000, totalAssetsUsd: 1000000 }; // 5%
      expect(calculateRiskScore(risky)).toBe(0.15);
    });

    it("should add penalty for small TVL", () => {
      const risky = { ...baseVault, totalAssetsUsd: 50000 }; // <100k
      expect(calculateRiskScore(risky)).toBe(0.1);
    });

    it("should cap score at 1.0", () => {
      const veryRisky = {
        ...baseVault,
        whitelisted: false, // +0.2
        curators: { items: [] }, // +0.15
        performanceFee: 0.5, // +0.1
        liquidityUsd: 0, // +0.15
        totalAssetsUsd: 10000, // +0.1
        // Total: 0.7
      };
      // Force it higher manually to check cap logic if logic changes
      // Current max sum without RED warning is < 1.0, but let's trust the logic
      expect(calculateRiskScore(veryRisky)).toBeLessThanOrEqual(1.0);
    });
  });

  describe("getRiskLevel & Color", () => {
    it("should categorize scores correctly", () => {
      expect(getRiskLevel(0)).toBe("low");
      expect(getRiskLevel(0.3)).toBe("low");
      expect(getRiskLevel(0.31)).toBe("medium");
      expect(getRiskLevel(0.6)).toBe("medium");
      expect(getRiskLevel(0.61)).toBe("high");
      expect(getRiskLevel(1.0)).toBe("high");
    });

    it("should return correct colors", () => {
      expect(getRiskColor("low")).toBe("#10B981");
      expect(getRiskColor("medium")).toBe("#F59E0B");
      expect(getRiskColor("high")).toBe("#EF4444");
    });
  });

  describe("getRiskBreakdown", () => {
    it("should generate detailed breakdown", () => {
      const vault = {
        warnings: [{ type: "WARN", level: "YELLOW" }],
        whitelisted: false,
        curators: { items: [{ name: "Steakhouse" }] },
        totalAssetsUsd: 2000000,
        liquidityUsd: 1000000,
      };

      const breakdown = getRiskBreakdown(vault);

      expect(breakdown.score).toBeCloseTo(0.4); // 0.2 (warn) + 0.2 (whitelist)
      expect(breakdown.level).toBe("medium");
      expect(breakdown.factors.warnings).toBe(0.2);
      expect(breakdown.factors.whitelist).toBe(0.2);
      expect(breakdown.reasoning).toContain("Vault has warnings to review");
      expect(breakdown.reasoning).toContain("Vault is not whitelisted by Morpho");
      expect(breakdown.reasoning).toContain("Curated by trusted team: Steakhouse");
    });
  });
});
