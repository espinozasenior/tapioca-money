// Rewards Calculator for Yield Positions

import { Position } from "./types";

export interface PositionRewards {
  totalEarned: number; // Cumulative rewards in USDC
  earnedSinceEntry: number; // Rewards since initial deposit
  currentMonthlyRate: number; // Current monthly earnings estimate
  daysActive: number; // Duration position has been held
}

/**
 * Calculate accrued rewards for a position based on time elapsed and APY.
 *
 * Note: This calculation assumes constant APY over the entire period.
 * It does not account for:
 * - Historical APY changes
 * - Compounding effects within the vault (already reflected in assets)
 * - Additional deposits/withdrawals after entry
 *
 * For most use cases, this provides a reasonable estimate of earnings.
 */
export function calculateAccruedRewards(position: Position): PositionRewards {
  const now = Date.now();
  const entryTime = position.enteredAt;

  // Calculate time elapsed
  const millisecondsElapsed = now - entryTime;
  const daysActive = Math.floor(millisecondsElapsed / (1000 * 60 * 60 * 24));
  const yearsElapsed = millisecondsElapsed / (1000 * 60 * 60 * 24 * 365.25);

  // Convert assets from smallest unit to USDC (6 decimals)
  const assetsInUsdc = Number(position.assets) / 1e6;

  // Calculate earnings based on time and APY
  // This is an approximation assuming constant APY
  const totalEarned = assetsInUsdc * position.apy * yearsElapsed;

  // Current monthly rate based on current APY and balance
  const currentMonthlyRate = (assetsInUsdc * position.apy) / 12;

  return {
    totalEarned,
    earnedSinceEntry: totalEarned, // Same as totalEarned for initial implementation
    currentMonthlyRate,
    daysActive,
  };
}

/**
 * Calculate aggregate rewards across multiple positions
 */
export function calculateTotalRewards(
  positions: Position[]
): {
  totalEarned: number;
  monthlyRate: number;
  positionCount: number;
} {
  if (positions.length === 0) {
    return {
      totalEarned: 0,
      monthlyRate: 0,
      positionCount: 0,
    };
  }

  let totalEarned = 0;
  let monthlyRate = 0;

  for (const position of positions) {
    const rewards = calculateAccruedRewards(position);
    totalEarned += rewards.totalEarned;
    monthlyRate += rewards.currentMonthlyRate;
  }

  return {
    totalEarned,
    monthlyRate,
    positionCount: positions.length,
  };
}
