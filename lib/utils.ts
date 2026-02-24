import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isValidEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function isValidSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

export function isValidAddress(address: string): boolean {
  return isValidEvmAddress(address) || isValidSolanaAddress(address);
}

export function isEmail(email: string) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Financial formatting utilities
export function formatUsd(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export function formatApyPct(apy: number) {
  return `${(apy * 100).toFixed(2)}%`;
}

// Gain calculation utilities
export function calculateTotalGains(
  rebalances: { amount: number; fromApy: number; toApy: number; timestamp: number }[]
) {
  if (rebalances.length === 0) {
    return {
      totalYearlyGain: 0,
      totalMonthlyGain: 0,
      totalCompoundedGain: 0,
      averageApyImprovement: 0,
    };
  }

  let totalYearlyGain = 0;
  let totalApyImprovement = 0;
  let totalWeight = 0;

  for (const r of rebalances) {
    const improvement = r.toApy - r.fromApy;
    // Only count positive improvements (avoid skewing if rebalance was forced/neutral)
    if (improvement > 0) {
      const yearlyGain = r.amount * improvement;
      totalYearlyGain += yearlyGain;

      // Weighted average APY improvement
      totalApyImprovement += improvement * r.amount;
      totalWeight += r.amount;
    }
  }

  const averageApyImprovement = totalWeight > 0 ? totalApyImprovement / totalWeight : 0;
  const totalMonthlyGain = totalYearlyGain / 12;

  // Simple compounding estimation (assuming monthly compounding)
  // For precise compounding, we'd need duration, but this is a projection
  const totalCompoundedGain = totalYearlyGain;

  return {
    totalYearlyGain,
    totalMonthlyGain,
    totalCompoundedGain,
    averageApyImprovement,
  };
}
