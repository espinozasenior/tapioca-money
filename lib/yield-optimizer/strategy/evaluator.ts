// Strategy Evaluator - Calculates net yield after costs
import type { YieldOpportunity, Position, RebalanceDecision } from "../types";
import { REBALANCE_THRESHOLDS } from "../config";

interface CostEstimate {
  gasCostUsd: number;
  slippagePct: number;
  totalCostPct: number;
}

/**
 * Estimate user-facing costs for a rebalance transaction.
 * Gas is fully sponsored by ZeroDev paymaster — users pay $0 gas.
 * Only real costs are slippage and execution buffer (previewRedeem rounding).
 */
export function estimateCosts(amount: bigint, from: Position | null): CostEstimate {
  // Slippage estimate (minimal for stablecoins on Base)
  const slippagePct = REBALANCE_THRESHOLDS.slippagePct;

  // Extra slippage if withdrawing from existing position (two legs)
  const withdrawCostPct = from ? REBALANCE_THRESHOLDS.slippagePct : 0;

  // Execution buffer accounts for previewRedeem rounding + timing differences
  const executionBufferPct = from ? REBALANCE_THRESHOLDS.executionBufferPct : 0;

  return {
    gasCostUsd: 0, // Gas is fully sponsored by ZeroDev paymaster
    slippagePct,
    totalCostPct: slippagePct + withdrawCostPct + executionBufferPct,
  };
}

/**
 * Calculate risk-adjusted APY
 */
export function riskAdjustedApy(opportunity: YieldOpportunity): number {
  // Reduce APY based on risk score
  // riskScore 0 = full APY, riskScore 1 = 0 APY
  return opportunity.apy * (1 - opportunity.riskScore);
}

/**
 * Compare current position(s) to best opportunity
 * Accepts Position[] since users can have multiple vault positions
 * For rebalancing, only considers first position if multiple exist
 */
export function evaluateRebalance(
  currentPositions: Position[] | Position | null,
  opportunities: YieldOpportunity[],
  usdcBalance: bigint
): RebalanceDecision {
  // Normalize to single position for rebalancing logic
  // Multi-position rebalancing is out of scope
  let currentPosition: Position | null = null;
  if (Array.isArray(currentPositions) && currentPositions.length > 0) {
    currentPosition = currentPositions[0];
  } else if (!Array.isArray(currentPositions)) {
    currentPosition = currentPositions;
  }
  if (opportunities.length === 0) {
    return {
      shouldRebalance: false,
      from: currentPosition,
      to: null,
      estimatedGasCost: 0n,
      estimatedSlippage: 0,
      netGain: 0,
      reason: "No opportunities available",
    };
  }

  // Sort by risk-adjusted APY
  const sortedOpportunities = [...opportunities].sort(
    (a, b) => riskAdjustedApy(b) - riskAdjustedApy(a)
  );
  const bestOpportunity = sortedOpportunities[0];

  // If no current position, evaluate entering best opportunity
  if (!currentPosition) {
    if (usdcBalance === 0n) {
      return {
        shouldRebalance: false,
        from: null,
        to: bestOpportunity,
        estimatedGasCost: 0n,
        estimatedSlippage: 0,
        netGain: 0,
        reason: "No USDC balance to deposit",
      };
    }

    const costs = estimateCosts(usdcBalance, null);
    const netApy = riskAdjustedApy(bestOpportunity) - costs.totalCostPct;

    return {
      shouldRebalance: netApy > REBALANCE_THRESHOLDS.minApyImprovement,
      from: null,
      to: bestOpportunity,
      estimatedGasCost: BigInt(Math.floor(costs.gasCostUsd * 1e6)),
      estimatedSlippage: costs.slippagePct,
      netGain: netApy,
      reason:
        netApy > REBALANCE_THRESHOLDS.minApyImprovement
          ? `Deposit into ${bestOpportunity.name} for ${(netApy * 100).toFixed(2)}% net APY`
          : `Net APY ${(netApy * 100).toFixed(2)}% below threshold`,
    };
  }

  // Compare current position to best opportunity
  const currentAdjustedApy = currentPosition.apy * 0.85; // Apply similar risk adjustment
  const bestAdjustedApy = riskAdjustedApy(bestOpportunity);

  // If already in best protocol, no rebalance needed
  if (currentPosition.protocol === bestOpportunity.protocol) {
    return {
      shouldRebalance: false,
      from: currentPosition,
      to: bestOpportunity,
      estimatedGasCost: 0n,
      estimatedSlippage: 0,
      netGain: 0,
      reason: "Already in optimal position",
    };
  }

  // Calculate net gain from switching
  const costs = estimateCosts(currentPosition.assets, currentPosition);
  const apyImprovement = bestAdjustedApy - currentAdjustedApy;
  const netGain = apyImprovement - costs.totalCostPct;

  return {
    shouldRebalance: netGain > REBALANCE_THRESHOLDS.minApyImprovement,
    from: currentPosition,
    to: bestOpportunity,
    estimatedGasCost: BigInt(Math.floor(costs.gasCostUsd * 1e6)),
    estimatedSlippage: costs.slippagePct,
    netGain,
    reason:
      netGain > REBALANCE_THRESHOLDS.minApyImprovement
        ? `Rebalance from ${currentPosition.protocol} to ${bestOpportunity.name}: +${(netGain * 100).toFixed(2)}% net APY`
        : `Net gain ${(netGain * 100).toFixed(2)}% below ${(REBALANCE_THRESHOLDS.minApyImprovement * 100).toFixed(1)}% threshold`,
  };
}
