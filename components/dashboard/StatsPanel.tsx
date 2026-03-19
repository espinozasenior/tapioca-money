"use client";

import { useWallet } from "@/hooks/useWallet";
import { useYieldPositions, useYields } from "@/hooks/useOptimizer";

export function StatsPanel() {
  const { wallet } = useWallet();
  const { positions, isLoading: posLoading } = useYieldPositions(wallet?.address);
  const { bestApy, isLoading: yieldsLoading } = useYields();

  const isLoading = posLoading || yieldsLoading;

  const totalDeposited = positions.reduce(
    (sum, p) => sum + parseFloat(p.amountUsd || p.amount || "0"),
    0
  );

  const totalRewards = positions.reduce(
    (sum, p) => sum + parseFloat(p.rewards?.totalEarned || "0"),
    0
  );

  const bestApyPct = bestApy > 0 ? `${(bestApy * 100).toFixed(1)}%` : "—";

  if (isLoading) {
    return (
      <div className="border-[var(--pearl)]/5 h-40 animate-pulse rounded-[28px] border bg-white/60 p-8 backdrop-blur-sm" />
    );
  }

  return (
    <div className="border-[var(--pearl)]/5 flex flex-col justify-between rounded-[28px] border bg-white/60 p-8 backdrop-blur-sm">
      <div>
        <p className="text-[var(--pearl)]/40 mb-3 text-xs font-bold uppercase tracking-widest">
          Performance
        </p>
        <p className="text-3xl font-black tracking-tight text-[var(--pearl)]">{bestApyPct}</p>
        <p className="text-[var(--pearl)]/50 mt-1 text-sm font-medium">Best available APY</p>
      </div>
      <div className="border-[var(--pearl)]/5 mt-4 space-y-2 border-t pt-4">
        <div className="flex items-center justify-between">
          <span className="text-[var(--pearl)]/40 text-xs font-bold">Deposited</span>
          <span className="text-sm font-bold text-[var(--pearl)]">
            $
            {totalDeposited.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
        {totalRewards > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[var(--pearl)]/40 text-xs font-bold">Earned</span>
            <span className="text-sm font-bold text-[var(--matcha)]">
              +${totalRewards.toFixed(2)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
