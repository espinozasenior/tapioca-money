"use client";

import Image from "next/image";
import { SlidersHorizontal } from "lucide-react";
import { useBalance } from "@/hooks/useBalance";
import { useYieldPositions } from "@/hooks/useOptimizer";
import { useWalletSelection } from "@/hooks/useWalletSelection";
import { AssetCard } from "./AssetCard";

export function AssetGrid() {
  const { agentAddress } = useWalletSelection();
  const { displayableBalance, isLoading: balanceLoading } = useBalance();
  const { positions, isLoading: positionsLoading } = useYieldPositions(agentAddress ?? undefined);

  const isLoading = balanceLoading || positionsLoading;

  // Wallet USDC (idle, not deposited)
  const walletUsdcRaw = parseFloat(displayableBalance?.replace(/,/g, "") || "0");
  const walletUsdc = isNaN(walletUsdcRaw) ? 0 : walletUsdcRaw;

  // Deposited positions (all USDC strategies)
  const depositedPositions = positions.filter(
    (p) => parseFloat(p.amountUsd || p.amount || "0") > 0
  );

  const totalDeposited = depositedPositions.reduce(
    (sum, p) => sum + parseFloat(p.amountUsd || p.amount || "0"),
    0
  );

  const hasPositions = depositedPositions.length > 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between px-1">
        <h3 className="text-[var(--pearl)]/40 text-sm font-bold uppercase tracking-widest">
          Your Assets
        </h3>
        <button className="transition-transform active:scale-95">
          <SlidersHorizontal className="text-[var(--pearl)]/40 h-5 w-5" />
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {["skel-1", "skel-2"].map((id) => (
            <div key={id} className="h-[168px] animate-pulse rounded-[20px] bg-white/60" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {/* Deposited USDC positions */}
          {depositedPositions.map((position) => {
            const amt = parseFloat(position.amountUsd || position.amount || "0");
            return (
              <AssetCard
                key={position.id}
                ticker="USDC"
                label={position.vaultName || position.protocol}
                amount={`$${amt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                iconSrc="/usdc.svg"
                brewing
                apy={position.apy > 0 ? `${(position.apy * 100).toFixed(1)}%` : undefined}
              />
            );
          })}

          {/* Empty state when no positions */}
          {!hasPositions && (
            <div className="border-[var(--pearl)]/10 flex min-h-[168px] flex-col items-center justify-center rounded-[20px] border border-dashed bg-white/40 p-5 text-center">
              <Image
                src="/usdc.svg"
                alt="USDC"
                width={28}
                height={28}
                className="mb-3 opacity-20"
                unoptimized
              />
              <p className="text-[var(--pearl)]/30 text-xs font-bold uppercase">No active vaults</p>
              <p className="text-[var(--pearl)]/20 mt-1 text-[10px]">Deposit to start brewing</p>
            </div>
          )}
        </div>
      )}

      {/* Total deposited summary */}
      {hasPositions && (
        <div className="mt-4 flex items-center justify-between px-1">
          <span className="text-[var(--pearl)]/30 text-xs font-bold">Total deposited</span>
          <span className="text-sm font-black text-[var(--pearl)]">
            $
            {totalDeposited.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
      )}
    </div>
  );
}
