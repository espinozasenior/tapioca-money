"use client";

import { TrendingUp } from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { useYieldPositions } from "@/hooks/useOptimizer";

interface BalanceDisplayProps {
  balance: string;
}

export function BalanceDisplay({ balance }: BalanceDisplayProps) {
  const { wallet } = useWallet();
  const { positions } = useYieldPositions(wallet?.address);

  // Sum rewards earned across all positions
  const totalRewards = positions.reduce((sum, p) => {
    const earned = parseFloat(p.rewards?.totalEarned || "0");
    return sum + (isNaN(earned) ? 0 : earned);
  }, 0);

  const hasRewards = totalRewards > 0;

  return (
    <section className="mb-10 text-center md:text-left">
      <p className="text-[var(--pearl)]/40 mb-2 text-xs font-bold uppercase tracking-[0.2em]">
        Total Balance
      </p>
      <h2 className="mb-3 text-5xl font-black tracking-tight text-[var(--pearl)] md:text-6xl">
        ${balance}
      </h2>
      {hasRewards && (
        <div className="mx-auto flex w-fit items-center justify-center gap-1.5 rounded-full bg-[var(--matcha)] px-4 py-1.5 text-xs font-bold text-[var(--pearl)] md:mx-0 md:justify-start">
          <TrendingUp className="h-3.5 w-3.5" />
          +${totalRewards.toFixed(2)} earned
        </div>
      )}
    </section>
  );
}
