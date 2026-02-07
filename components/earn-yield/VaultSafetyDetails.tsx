"use client";

import { Shield, AlertTriangle, Award, Coins } from "lucide-react";
import {
  getRiskLevel,
  getRiskColor,
  isTrustedCurator,
} from "@/lib/morpho/risk-scoring";

interface VaultSafetyDetailsProps {
  vault: any;
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
        <span className="text-sm font-medium text-gray-700">Safety Rating</span>
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4" style={{ color: riskColor }} />
          <span
            className="text-sm font-semibold capitalize"
            style={{ color: riskColor }}
          >
            {riskLevel} Risk
          </span>
        </div>
      </div>

      {/* Warnings */}
      {warnings && warnings.length > 0 && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-800">Warnings</p>
              {warnings.map((w: any, i: number) => (
                <p key={i} className="text-xs text-yellow-700 mt-1">
                  {w.type.replace(/_/g, " ")}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Curator */}
      {curators?.items && curators.items.length > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Curator</span>
          <div className="flex items-center gap-1">
            {isTrustedCurator(curators.items[0].name) && (
              <Award className="h-3 w-3 text-emerald-600" />
            )}
            <span className="font-medium text-gray-900">
              {curators.items[0].name}
            </span>
          </div>
        </div>
      )}

      {/* TVL Size */}
      {totalAssetsUsd > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Total Value Locked</span>
          <span className="font-medium text-gray-900">
            $
            {totalAssetsUsd.toLocaleString("en-US", {
              maximumFractionDigits: 0,
            })}
          </span>
        </div>
      )}

      {/* Liquidity */}
      {liquidityUsd !== undefined && totalAssetsUsd > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Available Liquidity</span>
          <div className="flex items-center gap-1">
            <Coins className="h-3 w-3 text-gray-400" />
            <span className="font-medium text-gray-900">
              {((liquidityUsd / totalAssetsUsd) * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}

      {/* Fees */}
      {(performanceFee || managementFee) && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Fees</span>
          <div className="text-right">
            {performanceFee ? (
              <div className="text-xs text-gray-900">
                {(performanceFee * 100).toFixed(1)}% performance
              </div>
            ) : null}
            {managementFee ? (
              <div className="text-xs text-gray-500">
                {(managementFee * 100).toFixed(2)}% annual
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Whitelisted Badge */}
      {whitelisted && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-2">
          <Shield className="h-3 w-3 text-emerald-600" />
          <span className="text-xs font-medium text-emerald-700">
            Morpho Whitelisted
          </span>
        </div>
      )}
    </div>
  );
}
