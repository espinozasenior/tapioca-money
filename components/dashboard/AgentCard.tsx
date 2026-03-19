"use client";

import { Zap, Power } from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { useWalletSelection } from "@/hooks/useWalletSelection";
import { useAgent, useYieldPositions } from "@/hooks/useOptimizer";

export function AgentCard() {
  const { wallet } = useWallet();
  const { agentAddress } = useWalletSelection();
  const { isRegistered, autoOptimizeEnabled, isLoading: agentLoading } = useAgent();
  const { positions, isLoading: positionsLoading } = useYieldPositions(
    agentAddress ?? wallet?.address
  );

  const isLoading = agentLoading || positionsLoading;

  // Find the active position with best APY
  const activePosition = positions
    .filter((p) => parseFloat(p.amountUsd || p.amount || "0") > 0)
    .sort((a, b) => b.apy - a.apy)[0];

  const vaultName = activePosition?.vaultName || activePosition?.protocol || null;
  const apy = activePosition?.apy
    ? `${(activePosition.apy * 100).toFixed(1)}%`
    : null;

  const isActive = isRegistered && autoOptimizeEnabled;

  if (isLoading) {
    return (
      <div className="bg-[var(--pearl)]/10 rounded-[20px] md:rounded-[28px] h-32 md:h-40 animate-pulse" />
    );
  }

  // Agent not registered — show activation prompt
  if (!isRegistered) {
    return (
      <div className="bg-[var(--pearl)] text-white rounded-[20px] md:rounded-[28px] p-6 md:p-8 ios-shadow border border-white/10 relative overflow-hidden">
        <div className="absolute -right-4 -top-4 w-24 h-24 md:w-40 md:h-40 bg-[var(--matcha)]/5 rounded-full blur-2xl md:blur-3xl" />
        <div className="flex items-center gap-2.5 mb-4">
          <Power className="w-4 h-4 text-white/40" />
          <span className="font-bold text-xs tracking-wide uppercase text-white/40">
            Agent Offline
          </span>
        </div>
        <p className="text-lg md:text-xl font-medium leading-snug text-white/60 relative z-10">
          Register your agent to start <span className="text-[var(--matcha)] font-bold">brewing</span> yield automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--pearl)] text-white rounded-[20px] md:rounded-[28px] p-6 md:p-8 ios-shadow border border-white/10 relative overflow-hidden">
      {/* Matcha glow */}
      <div className="absolute -right-4 -top-4 w-24 h-24 md:w-40 md:h-40 bg-[var(--matcha)]/10 rounded-full blur-2xl md:blur-3xl" />

      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          {isActive ? (
            <div className="pulse-matcha" />
          ) : (
            <div className="w-2 h-2 rounded-full bg-white/30" />
          )}
          <span
            className={`font-bold text-xs tracking-wide uppercase ${
              isActive ? "text-[var(--matcha)]" : "text-white/40"
            }`}
          >
            {isActive ? "Active Agent" : "Agent Paused"}
          </span>
        </div>
        {isActive && (
          <span className="bg-white/10 text-white/60 text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-wider">
            Live
          </span>
        )}
      </div>

      {/* Main text */}
      <p className="text-lg md:text-xl font-medium leading-snug relative z-10">
        {isActive && vaultName ? (
          <>
            Agent is currently{" "}
            <span className="text-[var(--matcha)] font-bold">brewing</span> in{" "}
            {vaultName}
          </>
        ) : isActive ? (
          <>
            Agent is <span className="text-[var(--matcha)] font-bold">monitoring</span> for the best yield opportunities.
          </>
        ) : (
          <>
            Auto-optimize is paused. Enable it to let the agent{" "}
            <span className="text-white/80 font-bold">brew</span> for you.
          </>
        )}
      </p>

      {/* Footer */}
      {(isActive && apy) && (
        <div className="mt-4 flex items-center justify-between pt-4 border-t border-white/10">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-[var(--matcha)]" />
            <span className="text-xs font-bold text-white/70">Yield Optimized</span>
          </div>
          <span className="text-xs font-black text-[var(--matcha)]">{apy} APY</span>
        </div>
      )}
    </div>
  );
}
