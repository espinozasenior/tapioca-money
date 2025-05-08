import Image from "next/image";
import { useState } from "react";
import { DepositModal } from "@/components/deposit-modal";
import { WalletBalance } from "@/components/balance";
import { SendFundsModal } from "@/components/send-funds-modal";
import { ActivityFeed } from "@/components/activity-feed";
import { DepositButton } from "./deposit-button";

interface MainScreenProps {
	walletAddress?: string;
}

export function MainScreen({ walletAddress }: MainScreenProps) {
	const [showDepositModal, setShowDepositModal] = useState(false);
	const [showSendModal, setShowSendModal] = useState(false);

	// Placeholder for balance, ideally get from WalletBalance or context
	const [usdcBalance, setUsdcBalance] = useState("0.00");

	return (
		<div className="w-full h-full py-8 flex justify-center items-center flex-col">
			{/* Wallet Header */}
			<div className="w-full max-w-5xl flex items-center gap-2 mb-6 px-4">
				<Image src="/crossmint-logo.png" alt="Wallet" width={54} height={54} />
				<span className="text-xl font-semibold ml-2">Home</span>
			</div>
			{/* Balance Card */}
			<div className="w-full max-w-5xl bg-white rounded-3xl border flex flex-col md:flex-row items-center md:items-stretch justify-between px-10 py-4 mb-8 shadow-md">
				<WalletBalance />
				<div className="flex gap-2 w-full md:w-auto justify-end items-center">
					<DepositButton onClick={() => setShowDepositModal(true)} />
					<button
						type="button"
						className="w-40 h-12 bg-[#EAEEFF] hover:bg-[#CFD9FA] text-[#0D42E4] font-semibold rounded-full px-4 py-3 text-sm flex items-center justify-center gap-2 border transition"
						onClick={() => setShowSendModal(true)}
					>
						<Image src="/arrow-up-right-icon.svg" alt="Add" width={24} height={24} /> Send
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
			<SendFundsModal
				open={showSendModal}
				onClose={() => setShowSendModal(false)}
				balance={usdcBalance}
			/>
		</div>
	);
}
