import Image from "next/image";
import { WalletBalance } from "./WalletBallance";
import { DepositButton } from "../common/DepositButton";
import { Container } from "../common/Container";
import { ArrowsRightLeftIcon, WalletIcon } from "@heroicons/react/24/outline";
import { Dropdown } from "../common/Dropdown";
import { useState } from "react";
import { WalletDetails } from "./WalletDetails";

interface DashboardSummaryProps {
  onDepositClick: () => void;
  onSendClick: () => void;
}

export function DashboardSummary({ onDepositClick, onSendClick }: DashboardSummaryProps) {
  const [showWalletDetails, setShowWalletDetails] = useState(false);
  const dropdownOptions = [
    {
      icon: <ArrowsRightLeftIcon className="h-4 w-4" />,
      label: "Withdraw",
    },
    {
      icon: <WalletIcon className="h-4 w-4" />,
      label: "Wallet Details",
      onClick: () => {
        setShowWalletDetails(true);
      },
    },
  ];

  const dropdownTrigger = (
    <button className="rounded-full bg-indigo-50 p-2.5 hover:bg-indigo-100">
      <Image src="/dots-vertical.svg" alt="Settings" width={24} height={24} />
    </button>
  );

  return (
    <Container className="flex w-full max-w-5xl flex-col items-center justify-between md:flex-row md:items-stretch">
      <WalletBalance />
      <div className="flex w-full items-center gap-2 md:w-auto md:justify-end">
        <DepositButton onClick={onDepositClick} />
        <button
          type="button"
          className="w-31 flex h-12 items-center justify-center gap-2 rounded-full bg-indigo-50 px-4 py-3 text-sm font-semibold text-blue-600 transition hover:bg-indigo-100 md:w-40"
          onClick={onSendClick}
        >
          <Image src="/arrow-up-right-icon-blue.svg" alt="Add" width={24} height={24} /> Send
        </button>
        <Dropdown trigger={dropdownTrigger} options={dropdownOptions} />
      </div>
      <WalletDetails onClose={() => setShowWalletDetails(false)} open={showWalletDetails} />
    </Container>
  );
}
