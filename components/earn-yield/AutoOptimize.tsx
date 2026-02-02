"use client";

import { useOptimizer, useRebalance, useAgent, formatApy, getProtocolColor, YieldOpportunity } from "@/hooks/useOptimizer";
import { Loader2, TrendingUp, ArrowRight, Zap, Shield, AlertCircle } from "lucide-react";

interface AutoOptimizeProps {
  usdcBalance: bigint;
}

export function AutoOptimize({ usdcBalance }: AutoOptimizeProps) {
  const { data, isLoading, error } = useOptimizer(usdcBalance);
  const {
    isRegistered,
    autoOptimizeEnabled,
    hasAuthorization,
    isLoading: isStatusLoading,
    register,
    isRegistering,
    toggleAutoOptimize,
    isTogglingAutoOptimize,
    registerError,
    toggleError
  } = useAgent();
  const rebalance = useRebalance();

  const handleToggle = () => {
    console.log("[AutoOptimize] Toggle clicked", {
      hasAuthorization,
      autoOptimizeEnabled,
      isRegistered
    });

    if (!hasAuthorization) {
      // First time - need to register and get EIP-7702 authorization
      console.log("[AutoOptimize] Calling register()");
      register();
    } else {
      // Already authorized, just toggle the auto-optimize setting
      console.log("[AutoOptimize] Calling toggleAutoOptimize()");
      toggleAutoOptimize(!autoOptimizeEnabled);
    }
  };

  const isTogglingDisabled = isRegistering || isTogglingAutoOptimize;
  const hasAgentError = registerError || toggleError;

  if (isLoading || isStatusLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Scanning yield opportunities...</span>
        </div>
      </div>
    );
  }

  // Always show the toggle if we have the registration status
  return (
    <div className="space-y-4">
      {/* Auto-Optimize Toggle */}
      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-500/10 p-2">
            {isTogglingDisabled ? (
              <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
            ) : (
              <Zap className="h-5 w-5 text-emerald-600" />
            )}
          </div>
          <div>
            <h3 className="font-medium text-gray-900">Auto-Optimize</h3>
            <p className="text-sm text-gray-500">
              {isRegistering ? "Upgrading wallet..." : isTogglingAutoOptimize ? "Updating settings..." : "Automatically rebalance to highest yield (ERC-7702)"}
            </p>
          </div>
        </div>
        <button
          onClick={handleToggle}
          disabled={isTogglingDisabled}
          className={`relative h-6 w-11 rounded-full transition-colors ${
            autoOptimizeEnabled ? "bg-emerald-500" : "bg-gray-300"
          } ${isTogglingDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
              autoOptimizeEnabled ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>

      {/* Error States */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to fetch optimization data.</span>
        </div>
      )}
      {hasAgentError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          <span>
            {registerError
              ? `Failed to register agent: ${registerError.message}`
              : `Failed to update settings: ${toggleError?.message}`}
          </span>
        </div>
      )}

      {/* Current Recommendation */}
      {data?.decision?.shouldRebalance && data?.decision?.to && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-3">
            <TrendingUp className="mt-0.5 h-5 w-5 text-emerald-600" />
            <div className="flex-1">
              <h4 className="font-medium text-emerald-700">Optimization Available</h4>
              <p className="mt-1 text-sm text-gray-600">{data.decision.reason}</p>

              <div className="mt-3 flex items-center gap-2">
                {data.decision.from && (
                  <>
                    <span
                      className="rounded px-2 py-1 text-xs font-medium"
                      style={{
                        backgroundColor: getProtocolColor(data.decision.from.protocol) + "20",
                        color: getProtocolColor(data.decision.from.protocol),
                      }}
                    >
                      {data.decision.from.protocol}
                    </span>
                    <ArrowRight className="h-4 w-4 text-gray-400" />
                  </>
                )}
                <span
                  className="rounded px-2 py-1 text-xs font-medium"
                  style={{
                    backgroundColor: getProtocolColor(data.decision.to.protocol) + "20",
                    color: getProtocolColor(data.decision.to.protocol),
                  }}
                >
                  {data.decision.to.name}
                </span>
                <span className="ml-auto text-sm font-medium text-emerald-600">
                  +{(data.decision.netGain * 100).toFixed(2)}% APY
                </span>
              </div>

              {!autoOptimizeEnabled && (
                <button
                  onClick={() => rebalance.mutate({ balance: usdcBalance })}
                  disabled={rebalance.isPending}
                  className="mt-3 w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {rebalance.isPending ? "Optimizing..." : "Optimize Now"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Opportunities List */}
      {data?.opportunities && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <h4 className="mb-3 text-sm font-medium text-gray-500">Available Protocols</h4>
          <div className="space-y-2">
            {data.opportunities.map((opp: YieldOpportunity) => (
              <div
                key={opp.id}
                className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: getProtocolColor(opp.protocol) }}
                  />
                  <span className="text-sm text-gray-900">{opp.name}</span>
                  {opp.riskScore < 0.2 && (
                    <div title="Low risk">
                      <Shield className="h-3 w-3 text-emerald-600" />
                    </div>
                  )}
                </div>
                <span className="text-sm font-medium text-emerald-600">{formatApy(opp.apy)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
