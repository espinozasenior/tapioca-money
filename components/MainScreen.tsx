import Image from "next/image";
import { useState } from "react";
import { DepositModal } from "@/components/deposit";
import { WalletBalance } from "@/components/Balance";
import { SendFundsModal } from "@/components/send-funds";
import { ActivityFeed } from "@/components/ActivityFeed";
import { DepositButton } from "./common/DepositButton";
import { useAuth } from "@crossmint/client-sdk-react-ui";
import { Container } from "./common/Container";
import { NewProducts } from "./NewProducts";

interface MainScreenProps {
  walletAddress?: string;
}

export function MainScreen({ walletAddress }: MainScreenProps) {
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const { logout } = useAuth();

  return (
    <div className="flex h-full w-full items-center justify-center gap-2 px-3 py-8">
      <div className="h-full w-full max-w-5xl">
        <div className="mb-2 flex h-14 w-full max-w-5xl items-center justify-between px-2">
          <Image src="/logo.png" alt="Logo" width={54} height={54} />
          <div className="ml-2 text-xl font-semibold">Dashboard</div>
          <button onClick={logout} className="flex items-center gap-1 text-base text-[#0D42E4]">
            Logout
            <Image src="/logout-icon.svg" alt="Logout" width={24} height={24} />
          </button>
        </div>
        <Container className="flex w-full max-w-5xl flex-col items-center justify-between md:flex-row md:items-stretch">
          <WalletBalance />
          <div className="flex w-full items-center gap-2 md:w-auto md:justify-end">
            <DepositButton onClick={() => setShowDepositModal(true)} />
            <button
              type="button"
              className="w-31 flex h-12 items-center justify-center gap-2 rounded-full border bg-[#EAEEFF] px-4 py-3 text-sm font-semibold text-[#0D42E4] transition hover:bg-[#CFD9FA] md:w-40"
              onClick={() => setShowSendModal(true)}
            >
              <Image src="/arrow-up-right-icon-blue.svg" alt="Add" width={24} height={24} /> Send
            </button>
          </div>
        </Container>
        <NewProducts />
        <ActivityFeed
          onDepositClick={() => setShowDepositModal(true)}
          walletAddress={walletAddress || ""}
        />
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
