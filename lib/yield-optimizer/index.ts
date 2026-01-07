// Yield Optimizer - Main Entry Point
export * from "./types";
export * from "./strategy/evaluator";
export * from "./morpho-api";

import { getMorphoOpportunities, getMorphoPosition, getMorphoVaultPosition } from "./protocols/morpho";
import { getAaveOpportunities, getAavePosition } from "./protocols/aave";
import { getMoonwellOpportunities, getMoonwellPosition } from "./protocols/moonwell";
import { evaluateRebalance } from "./strategy/evaluator";
import type { YieldOpportunity, Position, RebalanceDecision } from "./types";

/**
 * Fetch all yield opportunities across protocols
 */
export async function getAllOpportunities(): Promise<YieldOpportunity[]> {
  const [morpho, aave, moonwell] = await Promise.all([
    getMorphoOpportunities(),
    getAaveOpportunities(),
    getMoonwellOpportunities(),
  ]);

  return [...morpho, ...aave, ...moonwell].sort((a, b) => b.apy - a.apy);
}

/**
 * Get user's current yield position (if any)
 */
export async function getCurrentPosition(userAddress: `0x${string}`): Promise<Position | null> {
  // Check each protocol for existing position
  const [morpho, aave, moonwell] = await Promise.all([
    getMorphoPosition(userAddress),
    getAavePosition(userAddress),
    getMoonwellPosition(userAddress),
  ]);

  // Return first found position (user should only have one)
  return morpho || aave || moonwell || null;
}

/**
 * Main optimization function - evaluates whether to rebalance
 */
export async function optimize(
  userAddress: `0x${string}`,
  usdcBalance: bigint
): Promise<RebalanceDecision> {
  const [opportunities, currentPosition] = await Promise.all([
    getAllOpportunities(),
    getCurrentPosition(userAddress),
  ]);

  return evaluateRebalance(currentPosition, opportunities, usdcBalance);
}

/**
 * Format APY for display
 */
export function formatApy(apy: number): string {
  return `${(apy * 100).toFixed(2)}%`;
}

/**
 * Get protocol display info
 */
export function getProtocolInfo(protocol: string) {
  const info: Record<string, { name: string; color: string; icon: string }> = {
    morpho: { name: "Morpho", color: "#00D395", icon: "🔷" },
    aave: { name: "Aave", color: "#B6509E", icon: "👻" },
    moonwell: { name: "Moonwell", color: "#7B3FE4", icon: "🌙" },
  };
  return info[protocol] || { name: protocol, color: "#888", icon: "💰" };
}
