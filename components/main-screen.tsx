import Image from "next/image";
import { useState } from "react";
import { DepositModal } from "@/components/deposit";
import { WalletBalance } from "@/components/balance";
import { SendFundsModal } from "@/components/send-funds";
import { ActivityFeed } from "@/components/activity-feed";
import { DepositButton } from "./deposit-button";
import { useAuth } from "@crossmint/client-sdk-react-ui";

interface MainScreenProps {
  walletAddress?: string;
}

export function MainScreen({ walletAddress }: MainScreenProps) {
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const { logout } = useAuth();

  return (
    <div className="flex h-full w-full items-center justify-center gap-2 py-8">
      <div className="h-full space-y-[14px] px-3">
        <Image src="/logo.png" alt="Wallet" width={54} height={54} className="mx-auto" />
        <div className="cursor-pointer space-y-1">
          <div className="rounded-2xl bg-[#E9EEFD] p-3">
            <Image src="/home.svg" alt="Home" width={30} height={30} className="mx-auto" />
          </div>
          <div className="text-center text-base font-semibold text-[#1C42B2]">Home</div>
        </div>
        <div className="group cursor-pointer space-y-1">
          <div className="rounded-2xl p-3 transition group-hover:bg-[#E9EEFD]">
            <Image src="/card.svg" alt="Home" width={30} height={30} className="mx-auto" />
          </div>
          <div className="text-center text-base font-semibold text-[#64748B]">Card</div>
        </div>
        <div className="group cursor-pointer space-y-1">
          <div className="rounded-2xl p-3 transition group-hover:bg-[#E9EEFD]">
            <Image src="/security.svg" alt="Home" width={30} height={30} className="mx-auto" />
          </div>
          <div className="text-center text-base font-semibold text-[#64748B]">Security</div>
        </div>
      </div>
      <div className="h-full w-full max-w-5xl">
        {/* Wallet Header */}
        <div className="flex h-14 w-full max-w-5xl items-center justify-between px-2">
          <div className="flex w-full max-w-5xl items-center gap-2 px-4">
            <span className="ml-2 text-xl font-semibold">Home</span>
          </div>
          <button onClick={logout} className="flex items-center gap-1 text-base text-[#0D42E4]">
            Logout
            <Image src="/logout-icon.svg" alt="Logout" width={24} height={24} />
          </button>
        </div>
        {/* Balance Card */}
        <div className="mb-8 flex w-full max-w-5xl flex-col items-center justify-between rounded-3xl border bg-white px-10 py-4 shadow-md md:flex-row md:items-stretch">
          <WalletBalance />
          <div className="flex w-full items-center justify-end gap-2 md:w-auto">
            <DepositButton onClick={() => setShowDepositModal(true)} />
            <button
              type="button"
              className="flex h-12 w-40 items-center justify-center gap-2 rounded-full border bg-[#EAEEFF] px-4 py-3 text-sm font-semibold text-[#0D42E4] transition hover:bg-[#CFD9FA]"
              onClick={() => setShowSendModal(true)}
            >
              <Image src="/arrow-up-right-icon-blue.svg" alt="Add" width={24} height={24} /> Send
            </button>
          </div>
        </div>
        {/* Activity Feed Card */}
        <ActivityFeed
          onDepositClick={() => setShowDepositModal(true)}
          walletAddress={walletAddress || ""}
        />

        {/* Deposit Modal */}
        <DepositModal
          open={showDepositModal}
          onClose={() => setShowDepositModal(false)}
          walletAddress={walletAddress || ""}
        />
        <SendFundsModal open={showSendModal} onClose={() => setShowSendModal(false)} />
      </div>
    </div>
  );
}
