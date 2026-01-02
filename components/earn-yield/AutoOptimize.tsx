"use client";

import { useState } from "react";
import { useOptimizer, useRebalance, formatApy, getProtocolColor, YieldOpportunity } from "@/hooks/useOptimizer";
import { Loader2, TrendingUp, ArrowRight, Zap, Shield } from "lucide-react";

interface AutoOptimizeProps {
  usdcBalance: bigint;
}

export function AutoOptimize({ usdcBalance }: AutoOptimizeProps) {
  const [autoEnabled, setAutoEnabled] = useState(false);
  const { data, isLoading, error } = useOptimizer(usdcBalance);
  const rebalance = useRebalance();

  if (isLoading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex items-center gap-2 text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Scanning yield opportunities...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return null;
  }

  const { decision, opportunities } = data;

  return (
    <div className="space-y-4">
      {/* Auto-Optimize Toggle */}
      <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-500/10 p-2">
            <Zap className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="font-medium text-white">Auto-Optimize</h3>
            <p className="text-sm text-zinc-400">Automatically rebalance to highest yield</p>
          </div>
        </div>
        <button
          onClick={() => setAutoEnabled(!autoEnabled)}
          className={`relative h-6 w-11 rounded-full transition-colors ${
            autoEnabled ? "bg-emerald-500" : "bg-zinc-700"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              autoEnabled ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>

      {/* Current Recommendation */}
      {decision.shouldRebalance && decision.to && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="flex items-start gap-3">
            <TrendingUp className="mt-0.5 h-5 w-5 text-emerald-400" />
            <div className="flex-1">
              <h4 className="font-medium text-emerald-400">Optimization Available</h4>
              <p className="mt-1 text-sm text-zinc-300">{decision.reason}</p>

              <div className="mt-3 flex items-center gap-2">
                {decision.from && (
                  <>
                    <span
                      className="rounded px-2 py-1 text-xs font-medium"
                      style={{
                        backgroundColor: getProtocolColor(decision.from.protocol) + "20",
                        color: getProtocolColor(decision.from.protocol),
                      }}
                    >
                      {decision.from.protocol}
                    </span>
                    <ArrowRight className="h-4 w-4 text-zinc-500" />
                  </>
                )}
                <span
                  className="rounded px-2 py-1 text-xs font-medium"
                  style={{
                    backgroundColor: getProtocolColor(decision.to.protocol) + "20",
                    color: getProtocolColor(decision.to.protocol),
                  }}
                >
                  {decision.to.name}
                </span>
                <span className="ml-auto text-sm font-medium text-emerald-400">
                  +{(decision.netGain * 100).toFixed(2)}% APY
                </span>
              </div>

              {!autoEnabled && (
                <button
                  onClick={() => rebalance.mutate({ balance: usdcBalance })}
                  disabled={rebalance.isPending}
                  className="mt-3 w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  {rebalance.isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Optimizing...
                    </span>
                  ) : (
                    "Optimize Now"
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Opportunities List */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h4 className="mb-3 text-sm font-medium text-zinc-400">Available Protocols</h4>
        <div className="space-y-2">
          {opportunities.map((opp: YieldOpportunity) => (
            <div
              key={opp.id}
              className="flex items-center justify-between rounded-lg bg-zinc-800/50 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: getProtocolColor(opp.protocol) }}
                />
                <span className="text-sm text-white">{opp.name}</span>
                {opp.riskScore < 0.2 && (
                  <div title="Low risk">
                    <Shield className="h-3 w-3 text-emerald-400" />
                  </div>
                )}
              </div>
              <span className="text-sm font-medium text-emerald-400">{formatApy(opp.apy)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
