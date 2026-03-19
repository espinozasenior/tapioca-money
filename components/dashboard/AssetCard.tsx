"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

interface AssetCardProps {
  ticker: string;
  label?: string;
  amount: string;
  iconSrc?: string;
  brewing?: boolean;
  apy?: string;
  accentBorder?: boolean;
}

export function AssetCard({
  ticker,
  label,
  amount,
  iconSrc = "/usdc.svg",
  brewing,
  apy,
  accentBorder,
}: AssetCardProps) {
  return (
    <div
      className={cn(
        "bg-white rounded-[20px] p-5 flex flex-col transition-transform active:scale-95 cursor-pointer border relative overflow-hidden ios-shadow",
        accentBorder
          ? "border-[var(--matcha)]/30"
          : "border-[var(--pearl)]/5"
      )}
    >
      {/* Top row: token icon + brewing badge */}
      <div className="flex justify-between items-start mb-2">
        <Image
          src={iconSrc}
          alt={ticker}
          width={40}
          height={40}
          className="rounded-full"
          unoptimized
        />
        {/* {brewing && (
          <div className="flex items-center gap-1 bg-[var(--matcha)]/20 px-2 py-0.5 rounded-full">
            <div className="w-1.5 h-1.5 bg-[var(--matcha)] rounded-full animate-pulse" />
            <span className="text-[8px] font-black uppercase text-[var(--pearl)]/60">
              Brewing
            </span>
          </div>
        )} */}
        {/* APY pill badge */}
        {apy && (
          <div className="mt-2">
            <span className="inline-block bg-[var(--pearl)] text-[var(--matcha)] text-xs font-bold px-2 py-0.5 rounded-md">
              {apy} APY
            </span>
          </div>
        )}
      </div>

      {/* Ticker */}
      <p className="text-sm font-bold text-[var(--pearl)] uppercase tracking-wide">
        {ticker}
      </p>

      {/* Label (vault name or "Wallet") */}
      {label && (
        <p className="text-xs font-medium text-[var(--pearl)]/40 mt-0.5 truncate">
          {label}
        </p>
      )}
      <div className="flex justify-between items-end">
      {/* Amount — primary data, clear hierarchy */}
      <p className="text-xl font-black tracking-tight text-[var(--pearl)] mt-2">
        {amount}
      </p>
      
      </div>
    </div>
  );
}
