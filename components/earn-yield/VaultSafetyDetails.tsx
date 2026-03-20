"use client";

import { Shield, AlertTriangle, Award, Coins } from "lucide-react";
import { getRiskLevel, getRiskColor, isTrustedCurator } from "@/lib/morpho/risk-scoring";

interface VaultSafetyDetailsProps {
  vault: any;
}

function formatTvl(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}b`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}m`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}k`;
  return `$${value.toFixed(2)}`;
}

export function VaultSafetyDetails({ vault }: VaultSafetyDetailsProps) {
  // Extract metadata or use vault data directly
  const riskScore = vault.riskScore ?? 0.2;
  const totalAssetsUsd = vault.totalAssetsUsd ?? 0;
  const warnings = vault.warnings ?? vault.metadata?.warnings;
  const whitelisted = vault.whitelisted ?? vault.metadata?.whitelisted;
  const curators = vault.curators ?? vault.metadata?.curators;
  const performanceFee = vault.performanceFee ?? vault.metadata?.performanceFee;
  const managementFee = vault.managementFee ?? vault.metadata?.managementFee;
  const liquidityUsd = vault.liquidityUsd ?? vault.metadata?.liquidityUsd;

  const riskLevel = getRiskLevel(riskScore);
  const riskColor = getRiskColor(riskLevel);

  return (
    <div className="space-y-3">
      {/* Risk Level Badge */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-white/50">Safety Rating</span>
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4" style={{ color: riskColor }} />
          <span className="text-xs font-bold capitalize" style={{ color: riskColor }}>
            {riskLevel} Risk
          </span>
        </div>
      </div>

      {/* TVL Size */}
      {totalAssetsUsd > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white/50">Total Value Locked</span>
          <span className="text-xs font-bold text-white/80">{formatTvl(totalAssetsUsd)}</span>
        </div>
      )}

      {/* Warnings */}
      {warnings && warnings.length > 0 && (
        <div className="rounded-[12px] border border-yellow-500/30 bg-yellow-500/10 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-yellow-400" />
            <div>
              <p className="text-xs font-bold text-yellow-300">Warnings</p>
              {warnings.map((w: any) => (
                <p key={w.type} className="mt-1 text-[10px] font-medium text-yellow-400/70">
                  {w.type.replace(/_/g, " ")}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Curator */}
      {curators?.items && curators.items.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white/50">Curator</span>
          <div className="flex items-center gap-1">
            {isTrustedCurator(curators.items[0].name) && (
              <Award className="h-3 w-3 text-[var(--matcha)]" />
            )}
            <span className="text-xs font-bold text-white/80">{curators.items[0].name}</span>
          </div>
        </div>
      )}

      {/* Liquidity */}
      {liquidityUsd !== undefined && totalAssetsUsd > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white/50">Available Liquidity</span>
          <div className="flex items-center gap-1">
            <Coins className="h-3 w-3 text-white/40" />
            <span className="text-xs font-bold text-white/80">
              {((liquidityUsd / totalAssetsUsd) * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}

      {/* Fees */}
      {(performanceFee || managementFee) && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white/50">Fees</span>
          <div className="text-right">
            {performanceFee ? (
              <div className="text-[10px] font-bold text-white/80">
                {(performanceFee * 100).toFixed(1)}% performance
              </div>
            ) : null}
            {managementFee ? (
              <div className="text-[10px] font-medium text-white/50">
                {(managementFee * 100).toFixed(2)}% annual
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Whitelisted Badge */}
      {whitelisted && (
        <div className="bg-[var(--matcha)]/10 flex items-center gap-2 rounded-full px-3 py-1.5">
          <Shield className="h-3 w-3 text-[var(--matcha)]" />
          <span className="text-[10px] font-bold text-[var(--matcha)]">Morpho Whitelisted</span>
        </div>
      )}
    </div>
  );
}
