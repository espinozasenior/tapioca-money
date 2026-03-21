"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

interface OpportunityCardProps {
  readonly symbol: string;
  readonly name: string;
  readonly iconSrc: string;
  readonly apy: string;
  readonly protocol: string;
  readonly deposited?: string;
  readonly featured?: boolean;
  readonly paused?: boolean;
  readonly onClick?: () => void;
}

export function OpportunityCard({
  symbol,
  name,
  iconSrc,
  apy,
  protocol,
  deposited,
  featured,
  paused,
  onClick,
}: OpportunityCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        "ios-shadow relative flex cursor-pointer flex-col overflow-hidden rounded-[20px] border bg-white p-5 transition-transform active:scale-95",
        featured ? "border-[var(--matcha)]/30" : "border-[var(--pearl)]/5"
      )}
    >
      {/* Top row: token icon + protocol badge */}
      <div className="mb-3 flex items-start justify-between">
        <Image
          src={iconSrc}
          alt={symbol}
          width={40}
          height={40}
          className="rounded-full"
          unoptimized
        />
        <span className="inline-block rounded-full bg-[var(--pearl)] px-3 py-1.5 text-sm font-bold text-[var(--matcha)]">
          {apy} APY
        </span>
      </div>

      {/* Token info */}
      <p className="text-[var(--pearl)]/40 text-[11px] font-bold uppercase">{symbol}</p>
      <p className="mt-0.5 truncate text-sm font-bold text-[var(--pearl)]">{name}</p>

      {/* Deposited amount */}
      <p className="mt-2 text-xl font-black tracking-tight text-[var(--pearl)]">
        {deposited ?? "$0.00"}
      </p>

      {/* Paused badge */}
      <div className="mt-3">
        {paused && (
          <span className="inline-block rounded-full bg-red-100 px-3 py-1.5 text-xs font-bold text-red-600">
            Paused
          </span>
        )}
      </div>
    </div>
  );
}
