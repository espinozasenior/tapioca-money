"use client";

import { DollarSign, Hexagon, Bitcoin, Circle, SlidersHorizontal } from "lucide-react";
import { AssetCard } from "./AssetCard";

const assets = [
  {
    ticker: "USDC",
    amount: "$12,450.00",
    iconBg: "rgba(39, 117, 202, 0.1)",
    iconColor: "#2775CA",
    icon: DollarSign,
    brewing: true,
  },
  {
    ticker: "ETH",
    amount: "$8,240.12",
    iconBg: "rgba(98, 126, 234, 0.1)",
    iconColor: "#627EEA",
    icon: Hexagon,
    brewing: false,
  },
  {
    ticker: "WBTC",
    amount: "$3,157.41",
    iconBg: "rgba(247, 147, 26, 0.1)",
    iconColor: "#F7931A",
    icon: Bitcoin,
    brewing: false,
  },
  {
    ticker: "Tapioca",
    amount: "$1,000.00",
    iconBg: "var(--pearl)",
    iconColor: "var(--matcha)",
    icon: Circle,
    brewing: true,
    accentBorder: true,
  },
] as const;

export function AssetGrid() {
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

      {/* Mobile: 2x2 / Desktop: 4-column row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {assets.map((asset) => (
          <AssetCard
            key={asset.ticker}
            ticker={asset.ticker}
            amount={asset.amount}
            iconBg={asset.iconBg}
            iconColor={asset.iconColor}
            icon={asset.icon}
            brewing={asset.brewing}
            accentBorder={"accentBorder" in asset && asset.accentBorder}
          />
        ))}
      </div>
    </div>
  );
}
