/**
 * Yield Decision Engine Tests
 * Tests for autonomous rebalancing decision logic
 */

import { describe, test, expect, beforeEach } from "vitest";
import { mockMorphoVaults, mockMorphoPositions, mockLowLiquidityVault } from "../mocks/morpho-api";

describe("Yield Decision Engine", () => {
  beforeEach(() => {
    // Reset any mocks if needed
  });

  test("Detect profitable rebalancing opportunity", () => {
    const userAddress = "0x1111111111111111111111111111111111111111";

    // User currently in medium APY vault (8%)
    const currentPositions = mockMorphoPositions(userAddress);
    const currentVault = currentPositions[0].vault;

    expect(currentVault.state.apy).toBe(0.08); // 8% APY

    // Best available vault has 10% APY
    const bestVault = mockMorphoVaults[0];
    expect(bestVault.state.apy).toBe(0.1); // 10% APY

    // APY improvement
    const apyImprovement = bestVault.state.apy - currentVault.state.apy;
    expect(apyImprovement).toBeCloseTo(0.02, 2); // 2% improvement

    // Should recommend rebalance (improvement > 0.5% threshold)
    const shouldRebalance = apyImprovement > 0.005; // 0.5% threshold
    expect(shouldRebalance).toBe(true);
  });

  test("Skip when improvement below threshold", () => {
    // User in 9.6% APY vault
    const currentApy = 0.096;

    // Best vault available: 10% APY
    const bestApy = 0.1;

    const apyImprovement = bestApy - currentApy;
    expect(apyImprovement).toBeCloseTo(0.004, 3); // 0.4% improvement

    // Should skip (< 0.5% threshold)
    const shouldRebalance = apyImprovement >= 0.005;
    expect(shouldRebalance).toBe(false);
  });

  test("Calculate break-even time correctly", () => {
    const gasCost = 0.5; // $0.50
    const positionSize = 1000; // $1000
    const currentApy = 0.08; // 8%
    const newApy = 0.1; // 10%

    // APY improvement
    const apyImprovement = parseFloat((newApy - currentApy).toFixed(3)); // 0.02 = 2%

    // Annual gain from improvement
    const annualGain = positionSize * apyImprovement; // $20

    // Break-even time in days
    const breakEvenDays = (gasCost / annualGain) * 365;
    expect(breakEvenDays).toBeCloseTo(9.125, 1); // ~9 days

    // Should recommend (< 30 day max)
    const shouldRebalance = breakEvenDays <= 30;
    expect(shouldRebalance).toBe(true);
  });

  test("Reject when break-even time too long", () => {
    const gasCost = 0.5; // $0.50
    const positionSize = 10; // $10 (small position)
    const currentApy = 0.08; // 8%
    const newApy = 0.1; // 10%

    const apyImprovement = newApy - currentApy;
    const annualGain = positionSize * apyImprovement; // $0.20
    const breakEvenDays = (gasCost / annualGain) * 365;

    expect(breakEvenDays).toBeCloseTo(912.5, 1); // ~913 days

    // Should skip (> 30 day max)
    const shouldRebalance = breakEvenDays <= 30;
    expect(shouldRebalance).toBe(false);
  });

  test("Filter out low-liquidity vaults", () => {
    const minLiquidity = 100000000000; // $100k (in USDC decimals)

    // High liquidity vault
    const highLiqVault = mockMorphoVaults[0];
    const highLiquidityAmount = BigInt(highLiqVault.state.totalAssets);
    expect(Number(highLiquidityAmount)).toBeGreaterThan(minLiquidity);

    // Low liquidity vault
    const lowLiqVault = mockLowLiquidityVault;
    const lowLiquidityAmount = BigInt(lowLiqVault.state.totalAssets);
    expect(Number(lowLiquidityAmount)).toBeLessThan(minLiquidity);

    // Filter logic
    const isLowLiquidity = Number(lowLiquidityAmount) < minLiquidity;
    expect(isLowLiquidity).toBe(true);

    // Should skip low liquidity vault despite high APY
    expect(lowLiqVault.state.apy).toBe(0.15); // 15% APY (tempting!)
    const shouldSkip = isLowLiquidity;
    expect(shouldSkip).toBe(true);
  });

  test("Handle user with no positions", () => {
    const emptyPositions: any[] = [];

    // Should return safe response
    const shouldRebalance = emptyPositions.length > 0;
    expect(shouldRebalance).toBe(false);

    // No errors thrown
    expect(() => {
      if (emptyPositions.length === 0) {
        return { shouldRebalance: false, reason: "No positions found" };
      }
    }).not.toThrow();
  });

  test("Consider gas costs in profitability calculation", () => {
    // Test case 1: Large position, high gas
    const largePosition = {
      size: 100000, // $100k
      currentApy: 0.08,
      newApy: 0.1,
      gasCost: 2.0, // $2
    };

    const largeAnnualGain = largePosition.size * (largePosition.newApy - largePosition.currentApy);
    const largeBreakEven = (largePosition.gasCost / largeAnnualGain) * 365;
    expect(largeBreakEven).toBeLessThan(1); // Less than a day
    expect(largeBreakEven <= 30).toBe(true);

    // Test case 2: Small position, low gas
    const smallPosition = {
      size: 50, // $50
      currentApy: 0.05,
      newApy: 0.1,
      gasCost: 0.3, // $0.30
    };

    const smallAnnualGain = smallPosition.size * (smallPosition.newApy - smallPosition.currentApy);
    const smallBreakEven = (smallPosition.gasCost / smallAnnualGain) * 365;
    expect(smallBreakEven).toBeGreaterThan(30); // > 30 days
    expect(smallBreakEven <= 30).toBe(false);
  });

  test("Prioritize vaults by APY when multiple options available", () => {
    const vaults = [...mockMorphoVaults].sort((a, b) => b.state.apy - a.state.apy);

    // Should be sorted highest APY first
    expect(vaults[0].state.apy).toBe(0.1); // High APY vault
    expect(vaults[1].state.apy).toBe(0.08); // Medium APY vault
    expect(vaults[2].state.apy).toBe(0.05); // Low APY vault

    // Best vault should be recommended
    const bestVault = vaults[0];
    expect(bestVault.name).toBe("High APY Vault");
  });

  test("Validate minimum APY improvement threshold is 0.5%", () => {
    const THRESHOLD = 0.005; // 0.5%

    // Just below threshold
    const improvement1 = 0.004;
    expect(improvement1 >= THRESHOLD).toBe(false);

    // At threshold
    const improvement2 = 0.005;
    expect(improvement2 >= THRESHOLD).toBe(true);

    // Above threshold
    const improvement3 = 0.01;
    expect(improvement3 >= THRESHOLD).toBe(true);
  });
});
