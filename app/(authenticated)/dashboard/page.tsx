"use client";

import { useState } from "react";
import { Plus, ArrowUpRight, Sparkles } from "lucide-react";
import { useBalance } from "@/hooks/useBalance";
import { useWallet } from "@/hooks/useWallet";
import { DepositModal } from "@/components/deposit";
import { SendFundsModal } from "@/components/send-funds";
import { EarnYieldModal } from "@/components/earn-yield";
import { BalanceHeader } from "@/components/dashboard/BalanceHeader";
import { BalanceDisplay } from "@/components/dashboard/BalanceDisplay";
import { AgentCard } from "@/components/dashboard/AgentCard";
import { AssetGrid } from "@/components/dashboard/AssetGrid";
import type { YieldOpportunity } from "@/hooks/useOptimizer";

export default function DashboardPage() {
  const { wallet } = useWallet();
  const { displayableBalance } = useBalance();
  const walletAddress = wallet?.address ?? "";

  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showEarnYieldModal, setShowEarnYieldModal] = useState(false);
  const [selectedVaultForDeposit, setSelectedVaultForDeposit] =
    useState<YieldOpportunity | null>(null);

  return (
    <div className="max-w-md md:max-w-5xl mx-auto relative">
      {/* Pearl floats */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden max-w-md md:max-w-5xl mx-auto">
        <div className="pearl-motif w-16 h-16 absolute top-[15%] -left-8 opacity-[0.03]" />
        <div className="pearl-motif w-24 h-24 absolute top-[65%] -right-12 opacity-[0.04]" />
        <div className="pearl-motif w-20 h-20 absolute top-[40%] right-[30%] opacity-[0.02] hidden md:block" />
      </div>

      <BalanceHeader />

      {/* ====== MOBILE LAYOUT ====== */}
      <main className="relative z-10 px-6 py-4 md:hidden">
        <BalanceDisplay balance={displayableBalance} />

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-6 mb-8">
          <ActionButton icon={Plus} label="Deposit" onClick={() => setShowDepositModal(true)} />
          <ActionButton icon={ArrowUpRight} label="Send" onClick={() => setShowSendModal(true)} />
          <ActionButton icon={Sparkles} label="Earn" onClick={() => setShowEarnYieldModal(true)} />
        </div>

        <section className="mb-8">
          <AgentCard />
        </section>

        <section className="mb-8">
          <AssetGrid />
        </section>
      </main>

      {/* ====== DESKTOP LAYOUT ====== */}
      <main className="relative z-10 px-10 py-8 hidden md:block">
        {/* Top row: Balance + Actions */}
        <div className="flex items-end justify-between mb-12">
          <BalanceDisplay balance={displayableBalance} />

          {/* Desktop action buttons — horizontal row with labels */}
          <div className="flex items-center gap-3">
            <DesktopActionButton
              icon={Plus}
              label="Deposit"
              onClick={() => setShowDepositModal(true)}
            />
            <DesktopActionButton
              icon={ArrowUpRight}
              label="Send"
              onClick={() => setShowSendModal(true)}
            />
            <DesktopActionButton
              icon={Sparkles}
              label="Earn Yield"
              onClick={() => setShowEarnYieldModal(true)}
              primary
            />
          </div>
        </div>

        {/* Two-column: Agent card + placeholder */}
        <div className="grid grid-cols-3 gap-6 mb-10">
          <div className="col-span-2">
            <AgentCard />
          </div>
          {/* Quick stats panel */}
          <div className="bg-white/60 backdrop-blur-sm rounded-[28px] border border-[var(--pearl)]/5 p-8 flex flex-col justify-between">
            <div>
              <p className="font-bold text-xs uppercase tracking-widest text-[var(--pearl)]/40 mb-3">
                Performance
              </p>
              <p className="text-3xl font-black text-[var(--pearl)] tracking-tight">
                +5.2%
              </p>
              <p className="text-sm font-medium text-[var(--pearl)]/50 mt-1">
                30-day return
              </p>
            </div>
            <div className="border-t border-[var(--pearl)]/5 pt-4 mt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--pearl)]/40">Total deposited</span>
                <span className="text-sm font-bold text-[var(--pearl)]">$24,847.53</span>
              </div>
            </div>
          </div>
        </div>

        {/* Assets — full width, 4 columns on desktop */}
        <section>
          <AssetGrid />
        </section>
      </main>

      {/* Modals */}
      <DepositModal
        open={showDepositModal}
        onClose={() => setShowDepositModal(false)}
        walletAddress={walletAddress}
      />
      <SendFundsModal
        open={showSendModal}
        onClose={() => setShowSendModal(false)}
      />
      <EarnYieldModal
        open={showEarnYieldModal}
        onClose={() => {
          setShowEarnYieldModal(false);
          setSelectedVaultForDeposit(null);
        }}
        initialYield={selectedVaultForDeposit ?? undefined}
      />
    </div>
  );
}

/* Mobile action button — circular icon */
function ActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Plus;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
    >
      <div className="bg-white rounded-full p-4 ios-shadow">
        <Icon className="w-5 h-5 text-[var(--pearl)]" />
      </div>
      <span className="text-xs font-bold text-[var(--pearl)]/60">{label}</span>
    </button>
  );
}

/* Desktop action button — pill with icon + label */
function DesktopActionButton({
  icon: Icon,
  label,
  onClick,
  primary,
}: {
  icon: typeof Plus;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm transition-all hover:scale-[1.02] active:scale-95 ${
        primary
          ? "bg-[var(--pearl)] text-[var(--matcha)] shadow-lg"
          : "bg-white text-[var(--pearl)] border border-[var(--pearl)]/10 ios-shadow"
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}
