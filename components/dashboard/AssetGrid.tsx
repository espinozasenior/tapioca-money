"use client";

import { SlidersHorizontal, AlertTriangle } from "lucide-react";
import { useYields, useYieldPositions } from "@/hooks/useOptimizer";
import { useWalletSelection } from "@/hooks/useWalletSelection";
import { SUPPORTED_TOKENS, getTokenIcon } from "@/lib/config";
import { OpportunityCard } from "./OpportunityCard";
import type { YieldOpportunity, YieldPosition } from "@/hooks/useOptimizer";

/** Token display order and mapping to user-friendly names */
const TOKEN_DISPLAY = [
  { key: "USDC", label: "USD", matchAssets: ["usdc"] },
  { key: "cbBTC", label: "BTC", matchAssets: ["cbbtc", "wbtc", "btc"] },
  { key: "EURC", label: "EUR", matchAssets: ["eurc", "eur"] },
  { key: "WETH", label: "ETH", matchAssets: ["weth", "eth"] },
] as const;

/** Find the best yield opportunity for a given token (prefers non-paused vaults) */
function bestYieldForToken(
  yields: YieldOpportunity[],
  matchAssets: readonly string[]
): YieldOpportunity | undefined {
  const matching = yields.filter((y) =>
    matchAssets.some(
      (a) =>
        y.asset.toLowerCase().includes(a) ||
        y.underlying?.symbol?.toLowerCase() === a ||
        y.metadata?.name?.toLowerCase().includes(a)
    )
  );
  if (matching.length === 0) return undefined;

  // Prefer non-paused vaults; fall back to paused only if no active vaults exist
  const active = matching.filter((y) => !y.paused);
  const pool = active.length > 0 ? active : matching;
  return pool.reduce((best, curr) => (curr.apy > best.apy ? curr : best));
}

/** Format APY from decimal (0.125) to display string ("12.5%") */
function formatApy(apy: number): string {
  return `${(apy * 100).toFixed(1)}%`;
}

/** Sum deposited USD for positions matching a token */
function depositedForToken(positions: YieldPosition[], matchAssets: readonly string[]): number {
  return positions
    .filter((p) =>
      matchAssets.some(
        (a) => p.underlyingSymbol?.toLowerCase() === a || p.vaultName?.toLowerCase().includes(a)
      )
    )
    .reduce((sum, p) => sum + parseFloat(p.amountUsd || p.amount || "0"), 0);
}

function formatUsd(value: number): string {
  if (value === 0) return "$0.00";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface AssetGridProps {
  readonly onSelectYield?: (yield_: YieldOpportunity) => void;
}

export function AssetGrid({ onSelectYield }: AssetGridProps) {
  const { agentAddress } = useWalletSelection();
  const { yields, isLoading } = useYields();
  const { positions } = useYieldPositions(agentAddress ?? undefined);

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between px-1">
        <h3 className="text-[var(--pearl)]/40 text-sm font-bold uppercase tracking-widest">
          Opportunities
        </h3>
        <button className="transition-transform active:scale-95">
          <SlidersHorizontal className="text-[var(--pearl)]/40 h-5 w-5" />
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {["skel-1", "skel-2", "skel-3", "skel-4"].map((id) => (
            <div key={id} className="h-[220px] animate-pulse rounded-[20px] bg-white/60" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {TOKEN_DISPLAY.map((token, idx) => {
            const config = SUPPORTED_TOKENS[token.key];
            const bestYield = bestYieldForToken(yields, token.matchAssets);
            const deposited = depositedForToken(positions, token.matchAssets);

            return (
              <OpportunityCard
                key={token.key}
                symbol={config?.symbol ?? token.key}
                name={bestYield?.metadata?.name ?? bestYield?.name ?? `${token.label} Vault`}
                iconSrc={config?.icon ?? "/usdc.svg"}
                apy={bestYield ? formatApy(bestYield.apy) : "—"}
                protocol={bestYield?.protocol ?? "—"}
                deposited={formatUsd(deposited)}
                featured={idx === 0}
                paused={bestYield?.paused}
                onClick={() => {
                  if (bestYield && onSelectYield && !bestYield.paused) {
                    onSelectYield(bestYield);
                  }
                }}
              />
            );
          })}
        </div>
      )}

      {/* Paused positions — show vaults where user has funds but the vault is paused */}
      {!isLoading &&
        (() => {
          // Cross-reference positions with yields to find paused vaults with user funds
          const pausedPositions = positions.filter((p) => {
            const hasBalance = parseFloat(p.amountUsd || p.amount || "0") > 0;
            if (!hasBalance) return false;
            // Check if the position itself is marked paused (enriched from API)
            if (p.paused) return true;
            // Fallback: check if the matching opportunity is paused
            const matchingYield = yields.find(
              (y) => y.address.toLowerCase() === p.vaultAddress.toLowerCase()
            );
            return matchingYield?.paused === true;
          });

          if (pausedPositions.length === 0) return null;

          return (
            <div className="mt-6">
              <div className="mb-4 flex items-center gap-2 px-1">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <h3 className="text-sm font-bold uppercase tracking-widest text-red-500/70">
                  Your Paused Positions
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {pausedPositions.map((pos) => {
                  const matchingYield = yields.find(
                    (y) => y.address.toLowerCase() === pos.vaultAddress.toLowerCase()
                  );
                  const symbol = pos.underlyingSymbol ?? matchingYield?.asset ?? "—";
                  const deposited = parseFloat(pos.amountUsd || pos.amount || "0");

                  return (
                    <OpportunityCard
                      key={pos.vaultAddress}
                      symbol={symbol}
                      name={pos.vaultName ?? matchingYield?.metadata?.name ?? "Paused Vault"}
                      iconSrc={getTokenIcon(symbol) ?? "/usdc.svg"}
                      apy={matchingYield ? formatApy(matchingYield.apy) : "—"}
                      protocol={pos.protocol ?? matchingYield?.protocol ?? "—"}
                      deposited={formatUsd(deposited)}
                      paused
                      onClick={() => {
                        if (matchingYield && onSelectYield) {
                          onSelectYield(matchingYield);
                        }
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })()}
    </div>
  );
}
