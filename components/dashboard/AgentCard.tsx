"use client";

import { Zap, Power, AlertTriangle } from "lucide-react";
import { useAgent, useYieldPositions } from "@/hooks/useOptimizer";
import { useWalletSelection } from "@/hooks/useWalletSelection";

export function AgentCard() {
  const { agentAddress } = useWalletSelection();
  const { isRegistered, autoOptimizeEnabled, isLoading: agentLoading } = useAgent();
  const { positions, isLoading: positionsLoading } = useYieldPositions(agentAddress ?? undefined);

  const isLoading = agentLoading || positionsLoading;

  // Find the active position with best APY
  const activePosition = positions
    .filter((p) => parseFloat(p.amountUsd || p.amount || "0") > 0)
    .sort((a, b) => b.apy - a.apy)[0];

  const vaultName = activePosition?.vaultName || activePosition?.protocol || null;
  const apy = activePosition?.apy ? `${(activePosition.apy * 100).toFixed(1)}%` : null;

  const isActive = isRegistered && autoOptimizeEnabled;

  // Check if any funded positions are in paused vaults
  const hasPausedPositions = positions.some(
    (p) => p.paused === true && parseFloat(p.amountUsd || p.amount || "0") > 0
  );

  if (isLoading) {
    return (
      <div className="bg-[var(--pearl)]/10 h-32 animate-pulse rounded-[20px] md:h-40 md:rounded-[28px]" />
    );
  }

  // Agent not registered — show activation prompt
  if (!isRegistered) {
    return (
      <div className="ios-shadow relative overflow-hidden rounded-[20px] border border-white/10 bg-[var(--pearl)] p-6 text-white md:rounded-[28px] md:p-8">
        <div className="bg-[var(--matcha)]/5 absolute -right-4 -top-4 h-24 w-24 rounded-full blur-2xl md:h-40 md:w-40 md:blur-3xl" />
        <div className="mb-4 flex items-center gap-2.5">
          <Power className="h-4 w-4 text-white/40" />
          <span className="text-xs font-bold uppercase tracking-wide text-white/40">
            Agent Offline
          </span>
        </div>
        <p className="relative z-10 text-lg font-medium leading-snug text-white/60 md:text-xl">
          Register your agent to start{" "}
          <span className="font-bold text-[var(--matcha)]">brewing</span> yield automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="ios-shadow relative overflow-hidden rounded-[20px] border border-white/10 bg-[var(--pearl)] p-6 text-white md:rounded-[28px] md:p-8">
      {/* Matcha glow */}
      <div className="bg-[var(--matcha)]/10 absolute -right-4 -top-4 h-24 w-24 rounded-full blur-2xl md:h-40 md:w-40 md:blur-3xl" />

      {/* Header row */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {isActive ? (
            <div className="pulse-matcha" />
          ) : (
            <div className="h-2 w-2 rounded-full bg-white/30" />
          )}
          <span
            className={`text-xs font-bold uppercase tracking-wide ${
              isActive ? "text-[var(--matcha)]" : "text-white/40"
            }`}
          >
            {isActive ? "Active Agent" : "Agent Paused"}
          </span>
        </div>
        {isActive && (
          <span className="rounded-md bg-white/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-white/60">
            Live
          </span>
        )}
      </div>

      {/* Main text */}
      <p className="relative z-10 text-lg font-medium leading-snug md:text-xl">
        {isActive && vaultName ? (
          <>
            Agent is currently <span className="font-bold text-[var(--matcha)]">brewing</span> in{" "}
            {vaultName}
          </>
        ) : isActive ? (
          <>
            Agent is <span className="font-bold text-[var(--matcha)]">monitoring</span> for the best
            yield opportunities.
          </>
        ) : (
          <>
            Auto-optimize is paused. Enable it to let the agent{" "}
            <span className="font-bold text-white/80">brew</span> for you.
          </>
        )}
      </p>

      {/* Paused vault warning */}
      {hasPausedPositions && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-400" />
          <p className="text-xs font-medium leading-snug text-red-300">
            Some of your positions are in paused vaults. The agent cannot rebalance these
            automatically.
          </p>
        </div>
      )}

      {/* Footer */}
      {isActive && apy && (
        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-[var(--matcha)]" />
            <span className="text-xs font-bold text-white/70">Yield Optimized</span>
          </div>
          <span className="text-xs font-black text-[var(--matcha)]">{apy} APY</span>
        </div>
      )}
    </div>
  );
}
