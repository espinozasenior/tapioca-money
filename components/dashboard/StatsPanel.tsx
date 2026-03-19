"use client";

import { useWallet } from "@/hooks/useWallet";
import { useWalletSelection } from "@/hooks/useWalletSelection";
import { useYieldPositions, useYields } from "@/hooks/useOptimizer";

export function StatsPanel() {
  const { wallet } = useWallet();
  const { agentAddress } = useWalletSelection();
  const { positions, isLoading: posLoading } = useYieldPositions(
    agentAddress ?? wallet?.address
  );
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
      <div className="bg-white/60 backdrop-blur-sm rounded-[28px] border border-[var(--pearl)]/5 p-8 animate-pulse h-40" />
    );
  }

  return (
    <div className="bg-white/60 backdrop-blur-sm rounded-[28px] border border-[var(--pearl)]/5 p-8 flex flex-col justify-between">
      <div>
        <p className="font-bold text-xs uppercase tracking-widest text-[var(--pearl)]/40 mb-3">
          Performance
        </p>
        <p className="text-3xl font-black text-[var(--pearl)] tracking-tight">
          {bestApyPct}
        </p>
        <p className="text-sm font-medium text-[var(--pearl)]/50 mt-1">
          Best available APY
        </p>
      </div>
      <div className="border-t border-[var(--pearl)]/5 pt-4 mt-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-[var(--pearl)]/40">Deposited</span>
          <span className="text-sm font-bold text-[var(--pearl)]">
            ${totalDeposited.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        {totalRewards > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--pearl)]/40">Earned</span>
            <span className="text-sm font-bold text-[var(--matcha)]">
              +${totalRewards.toFixed(2)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
