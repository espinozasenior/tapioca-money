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
        "ios-shadow relative flex cursor-pointer flex-col overflow-hidden rounded-[20px] border bg-white p-5 transition-transform active:scale-95",
        accentBorder ? "border-[var(--matcha)]/30" : "border-[var(--pearl)]/5"
      )}
    >
      {/* Top row: token icon + brewing badge */}
      <div className="mb-2 flex items-start justify-between">
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
            <span className="inline-block rounded-md bg-[var(--pearl)] px-2 py-0.5 text-xs font-bold text-[var(--matcha)]">
              {apy} APY
            </span>
          </div>
        )}
      </div>

      {/* Ticker */}
      <p className="text-sm font-bold uppercase tracking-wide text-[var(--pearl)]">{ticker}</p>

      {/* Label (vault name or "Wallet") */}
      {label && (
        <p className="text-[var(--pearl)]/40 mt-0.5 truncate text-xs font-medium">{label}</p>
      )}
      <div className="flex items-end justify-between">
        {/* Amount — primary data, clear hierarchy */}
        <p className="mt-2 text-xl font-black tracking-tight text-[var(--pearl)]">{amount}</p>
      </div>
    </div>
  );
}
