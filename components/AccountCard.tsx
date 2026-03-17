import Image from "next/image";
import { Plus } from "lucide-react";

interface AccountCardProps {
  name: string;
  ticker: string;
  icon: string;
  iconBg: string;
  balanceUsd: string;
  balanceToken: string;
  apy: number;
  onDeposit: () => void;
}

export function AccountCard({
  name,
  ticker,
  icon,
  iconBg,
  balanceUsd,
  balanceToken,
  apy,
  onDeposit,
}: AccountCardProps) {
  const hasBalance = balanceUsd !== "$0.00";

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${iconBg}`}>
            <Image src={icon} alt={ticker} width={24} height={24} />
          </div>
          <div>
            <div className="text-sm font-semibold text-neutral-900">{name}</div>
            <div className="text-xs text-neutral-400">{ticker}</div>
          </div>
        </div>
        <button
          onClick={onDeposit}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white transition hover:bg-emerald-600 active:scale-95"
          aria-label={`Deposit ${ticker}`}
          type="button"
        >
          <Plus className="h-4 w-4" strokeWidth={3} />
        </button>
      </div>

      {/* Balance */}
      <div className="border-t border-neutral-100 px-6 py-4">
        <div
          className={`text-3xl font-normal ${hasBalance ? "text-neutral-900" : "text-neutral-400"}`}
        >
          {balanceUsd}
        </div>
        <div className="mt-0.5 text-sm text-neutral-400">
          {balanceToken} {ticker}
        </div>
      </div>

      {/* APY Footer */}
      <div className="border-t border-neutral-100 p-4">
        <div className="text-xs text-neutral-400">APY</div>
        <div className="text-lg font-semibold text-emerald-500">{(apy * 100).toFixed(1)}%</div>
      </div>
    </div>
  );
}
