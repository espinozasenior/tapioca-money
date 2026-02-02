/**
 * APY Gain Calculator
 * Calculates simple and compounded yield improvements from rebalancing
 */

export interface ApyGainResult {
  beforeApy: number;
  afterApy: number;
  apyImprovement: number;
  estimatedYearlyGain: number;
  estimatedMonthlyGain: number;
  compoundedValue: number;
}

/**
 * Calculate APY gains from a position rebalance
 * @param amount - Principal amount in USDC (e.g., 1000)
 * @param fromApy - Current APY (decimal, e.g., 0.05 = 5%)
 * @param toApy - New APY after rebalancing (decimal)
 * @param daysElapsed - Days since rebalance (for compound calculation)
 * @returns Detailed gain breakdown
 */
export function calculateApyGain(
  amount: number,
  fromApy: number,
  toApy: number,
  daysElapsed: number = 0
): ApyGainResult {
  const apyImprovement = toApy - fromApy;

  // Simple gains (linear approximation)
  const estimatedYearlyGain = amount * apyImprovement;
  const estimatedMonthlyGain = estimatedYearlyGain / 12;

  // Compounded value calculation
  let compoundedValue = amount;
  if (daysElapsed > 0) {
    const years = daysElapsed / 365;
    const beforeValue = amount * Math.pow(1 + fromApy, years);
    const afterValue = amount * Math.pow(1 + toApy, years);
    compoundedValue = afterValue - beforeValue;
  }

  return {
    beforeApy: fromApy,
    afterApy: toApy,
    apyImprovement,
    estimatedYearlyGain,
    estimatedMonthlyGain,
    compoundedValue,
  };
}

/**
 * Calculate total gains across multiple rebalances
 * @param rebalances - Array of rebalance records with amounts and APY improvements
 * @returns Aggregated gains
 */
export function calculateTotalGains(
  rebalances: Array<{
    amount: number;
    fromApy: number;
    toApy: number;
    timestamp: number;
  }>
): {
  totalYearlyGain: number;
  totalMonthlyGain: number;
  averageApyImprovement: number;
  totalCompoundedGain: number;
} {
  if (rebalances.length === 0) {
    return {
      totalYearlyGain: 0,
      totalMonthlyGain: 0,
      averageApyImprovement: 0,
      totalCompoundedGain: 0,
    };
  }

  const now = Date.now();
  let totalYearlyGain = 0;
  let totalApyImprovement = 0;
  let totalCompoundedGain = 0;

  for (const rebalance of rebalances) {
    const daysElapsed = (now - rebalance.timestamp) / (1000 * 60 * 60 * 24);
    const result = calculateApyGain(
      rebalance.amount,
      rebalance.fromApy,
      rebalance.toApy,
      daysElapsed
    );

    totalYearlyGain += result.estimatedYearlyGain;
    totalApyImprovement += result.apyImprovement;
    totalCompoundedGain += result.compoundedValue;
  }

  return {
    totalYearlyGain,
    totalMonthlyGain: totalYearlyGain / 12,
    averageApyImprovement: totalApyImprovement / rebalances.length,
    totalCompoundedGain,
  };
}

/**
 * Calculate break-even time for a rebalance
 * @param gasCostUsd - Gas cost in USD
 * @param amount - Principal amount in USDC
 * @param apyImprovement - APY improvement (decimal)
 * @returns Days until gas cost is recovered
 */
export function calculateBreakEven(
  gasCostUsd: number,
  amount: number,
  apyImprovement: number
): number {
  if (apyImprovement <= 0) {
    return Infinity;
  }

  const dailyGain = (amount * apyImprovement) / 365;
  return gasCostUsd / dailyGain;
}

/**
 * Format APY as percentage string
 */
export function formatApyPct(apy: number, decimals: number = 2): string {
  return `${(apy * 100).toFixed(decimals)}%`;
}

/**
 * Format USD amount
 */
export function formatUsd(amount: number, decimals: number = 2): string {
  return `$${amount.toFixed(decimals)}`;
}
