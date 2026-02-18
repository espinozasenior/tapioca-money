// Yield Optimizer - Main Entry Point
export * from "./types";
export * from "./strategy/evaluator";

import { protocolRegistry } from "@/lib/protocols/adapter";
import { evaluateRebalance } from "./strategy/evaluator";
import type { YieldOpportunity, Position, RebalanceDecision } from "./types";

/**
 * Fetch all yield opportunities across protocols
 */
export async function getAllOpportunities(): Promise<YieldOpportunity[]> {
  const opportunities = await protocolRegistry.getAllOpportunities();
  return opportunities.sort((a, b) => b.apy - a.apy);
}

/**
 * Get user's current yield positions across all protocols
 * Returns array of positions as users can have multiple vaults
 */
export async function getCurrentPosition(userAddress: `0x${string}`): Promise<Position[]> {
  return protocolRegistry.getAllPositions(userAddress);
}

/**
 * Main optimization function - evaluates whether to rebalance
 */
export async function optimize(
  userAddress: `0x${string}`,
  usdcBalance: bigint
): Promise<RebalanceDecision> {
  const [opportunities, currentPositions] = await Promise.all([
    getAllOpportunities(),
    getCurrentPosition(userAddress), // Now returns Position[]
  ]);

  return evaluateRebalance(currentPositions, opportunities, usdcBalance);
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
