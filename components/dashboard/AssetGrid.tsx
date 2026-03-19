"use client";

import Image from "next/image";
import { SlidersHorizontal } from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { useWalletSelection } from "@/hooks/useWalletSelection";
import { useBalance } from "@/hooks/useBalance";
import { useYieldPositions } from "@/hooks/useOptimizer";
import { AssetCard } from "./AssetCard";

export function AssetGrid() {
  const { wallet } = useWallet();
  const { agentAddress } = useWalletSelection();
  const { displayableBalance, isLoading: balanceLoading } = useBalance();
  const { positions, isLoading: positionsLoading } = useYieldPositions(
    agentAddress ?? wallet?.address
  );

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
      <div className="flex items-center justify-between mb-4 px-1">
        <h3 className="font-bold text-sm uppercase tracking-widest text-[var(--pearl)]/40">
          Your Assets
        </h3>
        <button className="active:scale-95 transition-transform">
          <SlidersHorizontal className="w-5 h-5 text-[var(--pearl)]/40" />
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {["skel-1", "skel-2"].map((id) => (
            <div
              key={id}
              className="rounded-[20px] bg-white/60 h-[168px] animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
            <div className="bg-white/40 rounded-[20px] p-5 border border-dashed border-[var(--pearl)]/10 flex flex-col items-center justify-center text-center min-h-[168px]">
              <Image
                src="/usdc.svg"
                alt="USDC"
                width={28}
                height={28}
                className="opacity-20 mb-3"
                unoptimized
              />
              <p className="text-xs font-bold uppercase text-[var(--pearl)]/30">
                No active vaults
              </p>
              <p className="text-[10px] text-[var(--pearl)]/20 mt-1">
                Deposit to start brewing
              </p>
            </div>
          )}
        </div>
      )}

      {/* Total deposited summary */}
      {hasPositions && (
        <div className="mt-4 px-1 flex items-center justify-between">
          <span className="text-xs font-bold text-[var(--pearl)]/30">
            Total deposited
          </span>
          <span className="text-sm font-black text-[var(--pearl)]">
            ${totalDeposited.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      )}
    </div>
  );
}
