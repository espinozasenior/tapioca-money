import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface AssetCardProps {
  ticker: string;
  amount: string;
  iconBg: string;
  iconColor: string;
  icon: LucideIcon;
  brewing?: boolean;
  accentBorder?: boolean;
}

export function AssetCard({
  ticker,
  amount,
  iconBg,
  iconColor,
  icon: Icon,
  brewing,
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
      {/* Top row — mb-4 per Stitch */}
      <div className="flex justify-between items-start mb-4">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: iconBg }}
        >
          <Icon className="w-5 h-5" style={{ color: iconColor }} />
        </div>
        {brewing && (
          <div className="flex items-center gap-1 bg-[var(--matcha)]/20 px-2 py-0.5 rounded-full">
            <div className="w-1.5 h-1.5 bg-[var(--matcha)] rounded-full animate-pulse" />
            <span className="text-[8px] font-black uppercase text-[var(--pearl)]/60">
              Brewing
            </span>
          </div>
        )}
      </div>

      {/* Ticker */}
      <p className="text-xs font-bold text-[var(--pearl)]/40 uppercase mb-0.5">
        {ticker}
      </p>

      {/* Amount */}
      <p className="text-lg font-bold tracking-tight text-[var(--pearl)]">
        {amount}
      </p>
    </div>
  );
}
