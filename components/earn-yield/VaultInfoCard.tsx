import React from "react";
import { YieldOpportunity } from "@/hooks/useOptimizer";
import { VaultSafetyDetails } from "./VaultSafetyDetails";

interface VaultInfoCardProps {
  yieldOpportunity: YieldOpportunity;
}

// Format APY for display
const formatApy = (apy: number) => {
  return `${(apy * 100).toFixed(2)}%`;
};

export function VaultInfoCard({ yieldOpportunity }: VaultInfoCardProps) {
  return (
    <div className="ios-shadow relative mb-6 overflow-hidden rounded-[20px] border border-white/10 bg-[var(--pearl)] p-6 text-white">
      <div className="bg-[var(--matcha)]/10 pointer-events-none absolute -right-4 -top-4 h-24 w-24 rounded-full blur-2xl" />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/50">
            Current APY (30 day)
          </p>
          <p className="text-2xl font-black text-[var(--matcha)]">
            {formatApy(yieldOpportunity.apy)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/50">Protocol</p>
          <p className="text-lg font-bold text-white">
            {yieldOpportunity.protocol.charAt(0).toUpperCase() + yieldOpportunity.protocol.slice(1)}
          </p>
        </div>
      </div>

      {yieldOpportunity.metadata.description && (
        <p className="mt-3 text-xs font-medium text-white/50">
          {yieldOpportunity.metadata.description}
        </p>
      )}

      {/* APY Breakdown */}
      {(yieldOpportunity.nativeApy != null || yieldOpportunity.rewardApy != null) && (
        <div className="mt-3 flex flex-col gap-1">
          {yieldOpportunity.nativeApy != null && yieldOpportunity.nativeApy > 0 && (
            <div className="flex items-center justify-between text-xs text-white/50">
              <span>Native APY</span>
              <span className="font-bold text-white/80">
                {formatApy(yieldOpportunity.nativeApy)}
              </span>
            </div>
          )}
          {yieldOpportunity.rewardApy != null && yieldOpportunity.rewardApy > 0 && (
            <div className="flex items-center justify-between text-xs text-white/50">
              <span>Reward APY</span>
              <span className="font-bold text-white/80">
                {formatApy(yieldOpportunity.rewardApy)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Safety Information */}
      <div className="mt-4 border-t border-white/10 pt-4">
        <VaultSafetyDetails vault={yieldOpportunity} />
      </div>
    </div>
  );
}
