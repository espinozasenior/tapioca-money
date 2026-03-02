import { useState } from "react";
import Image from "next/image";
import { useAuth } from "@/hooks/useWallet";
import { DepositModal } from "@/components/deposit";
import { SendFundsModal } from "@/components/send-funds";
import { EarnYieldModal } from "@/components/earn-yield";
import { AccountsList } from "@/components/AccountsList";
import { NewProducts } from "./NewProducts";
import { DashboardSummary } from "./dashboard-summary";
import type { YieldOpportunity } from "@/hooks/useOptimizer";

interface MainScreenProps {
  walletAddress?: string;
}

export function MainScreen({ walletAddress }: MainScreenProps) {
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showEarnYieldModal, setShowEarnYieldModal] = useState(false);
  const [selectedVaultForDeposit, setSelectedVaultForDeposit] = useState<YieldOpportunity | null>(null);
  const { logout } = useAuth();

  return (
    <div className="flex h-full w-full justify-center gap-2 px-4 py-6">
      <div className="h-full w-full max-w-4xl">
        <div className="mb-4 flex h-12 w-full items-center justify-between px-1">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              className="h-fit w-12"
              alt="Logo"
              width={48}
              height={48}
              priority
              unoptimized
            />
            <div className="text-xl font-semibold text-gray-900">Dashboard</div>
          </div>
          <button onClick={logout} className="text-muted-foreground text-sm hover:text-gray-700">
            Log out
          </button>
        </div>
        <DashboardSummary
          onDepositClick={() => setShowDepositModal(true)}
          onSendClick={() => setShowSendModal(true)}
        />
        <NewProducts onEarnYieldClick={() => setShowEarnYieldModal(true)} />
        <AccountsList
          onDepositToVault={(vault) => {
            setSelectedVaultForDeposit(vault);
            setShowEarnYieldModal(true);
          }}
        />
        <DepositModal
          open={showDepositModal}
          onClose={() => setShowDepositModal(false)}
          walletAddress={walletAddress || ""}
        />
        <SendFundsModal open={showSendModal} onClose={() => setShowSendModal(false)} />
        <EarnYieldModal
          open={showEarnYieldModal}
          onClose={() => {
            setShowEarnYieldModal(false);
            setSelectedVaultForDeposit(null);
          }}
          initialYield={selectedVaultForDeposit ?? undefined}
        />
      </div>
    </div>
  );
}
