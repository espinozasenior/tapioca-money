"use client";

import { Zap } from "lucide-react";

interface AgentCardProps {
  vaultName?: string;
  apy?: string;
}

export function AgentCard({
  vaultName = "Morpho Matcha",
  apy = "12.5%",
}: AgentCardProps) {
  return (
    <div className="bg-[var(--pearl)] text-white rounded-[20px] md:rounded-[28px] p-6 md:p-8 ios-shadow border border-white/10 relative overflow-hidden">
      {/* Matcha glow */}
      <div className="absolute -right-4 -top-4 w-24 h-24 md:w-40 md:h-40 bg-[var(--matcha)]/10 rounded-full blur-2xl md:blur-3xl" />

      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="pulse-matcha" />
          <span className="font-bold text-xs tracking-wide uppercase text-[var(--matcha)]">
            Active Agent
          </span>
        </div>
        <span className="bg-white/10 text-white/60 text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-wider">
          Live
        </span>
      </div>

      {/* Main text */}
      <p className="text-lg md:text-xl font-medium leading-snug relative z-10">
        Agent is currently{" "}
        <span className="text-[var(--matcha)] font-bold">brewing</span> in{" "}
        {vaultName}
      </p>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between pt-4 border-t border-white/10">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-[var(--matcha)]" />
          <span className="text-xs font-bold text-white/70">Yield Optimized</span>
        </div>
        <span className="text-xs font-black text-[var(--matcha)]">{apy} APY</span>
      </div>
    </div>
  );
}
