"use client";

import { useReducer } from "react";
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
import { StatsPanel } from "@/components/dashboard/StatsPanel";
import type { YieldOpportunity } from "@/hooks/useOptimizer";

type ModalState = {
  deposit: boolean;
  send: boolean;
  earnYield: boolean;
  selectedVault: YieldOpportunity | null;
};

type ModalAction =
  | { type: "open"; modal: "deposit" | "send" | "earnYield" }
  | { type: "close"; modal: "deposit" | "send" | "earnYield" };

function modalReducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case "open":
      return { ...state, [action.modal]: true };
    case "close":
      return {
        ...state,
        [action.modal]: false,
        ...(action.modal === "earnYield" ? { selectedVault: null } : {}),
      };
  }
}

const initialModalState: ModalState = {
  deposit: false,
  send: false,
  earnYield: false,
  selectedVault: null,
};

export default function DashboardPage() {
  const { wallet } = useWallet();
  const { displayableBalance } = useBalance();
  const walletAddress = wallet?.address ?? "";

  const [modals, dispatch] = useReducer(modalReducer, initialModalState);

  return (
    <div className="max-w-md md:max-w-5xl mx-auto relative">
      <BalanceHeader />

      {/* ====== MOBILE LAYOUT ====== */}
      <main className="relative z-10 px-6 py-4 md:hidden">
        <BalanceDisplay balance={displayableBalance} />

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-6 mb-8">
          <ActionButton icon={Plus} label="Deposit" onClick={() => dispatch({ type: "open", modal: "deposit" })} />
          <ActionButton icon={ArrowUpRight} label="Send" onClick={() => dispatch({ type: "open", modal: "send" })} />
          <ActionButton icon={Sparkles} label="Earn" onClick={() => dispatch({ type: "open", modal: "earnYield" })} />
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
              onClick={() => dispatch({ type: "open", modal: "deposit" })}
            />
            <DesktopActionButton
              icon={ArrowUpRight}
              label="Send"
              onClick={() => dispatch({ type: "open", modal: "send" })}
            />
            <DesktopActionButton
              icon={Sparkles}
              label="Earn Yield"
              onClick={() => dispatch({ type: "open", modal: "earnYield" })}
              primary
            />
          </div>
        </div>

        {/* Two-column: Agent card + placeholder */}
        <div className="grid grid-cols-3 gap-6 mb-10">
          <div className="col-span-2">
            <AgentCard />
          </div>
          <StatsPanel />
        </div>

        {/* Assets — full width, 4 columns on desktop */}
        <section>
          <AssetGrid />
        </section>
      </main>

      {/* Modals */}
      <DepositModal
        open={modals.deposit}
        onClose={() => dispatch({ type: "close", modal: "deposit" })}
        walletAddress={walletAddress}
      />
      <SendFundsModal
        open={modals.send}
        onClose={() => dispatch({ type: "close", modal: "send" })}
      />
      <EarnYieldModal
        open={modals.earnYield}
        onClose={() => dispatch({ type: "close", modal: "earnYield" })}
        initialYield={modals.selectedVault ?? undefined}
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
