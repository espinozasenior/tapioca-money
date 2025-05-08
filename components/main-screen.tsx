import Image from "next/image";
import { useState } from "react";
import { DepositModal } from "@/components/deposit-modal";
import { WalletBalance } from "@/components/balance";
import { SendFundsModal } from "@/components/send-funds-modal";
import { ActivityFeed } from "@/components/activity-feed";

interface MainScreenProps {
	walletAddress?: string;
}

export function MainScreen({ walletAddress }: MainScreenProps) {
	const [showDepositModal, setShowDepositModal] = useState(false);
	const [showSendModal, setShowSendModal] = useState(false);

	// Placeholder for balance, ideally get from WalletBalance or context
	const [usdcBalance, setUsdcBalance] = useState("0.00");

	return (
		<div className="w-full flex flex-col items-center min-h-screen py-8">
			{/* Wallet Header */}
			<div className="w-full max-w-4xl flex items-center gap-2 mb-6 px-4">
				<Image src="/crossmint-logo.svg" alt="Wallet" width={28} height={28} />
				<span className="text-xl font-semibold ml-2">Wallet</span>
				<span className="text-gray-400 ml-2 text-base font-medium">
					{walletAddress
						? `(${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)})`
						: ""}
				</span>
			</div>
			{/* Balance Card */}
			<div className="w-full max-w-4xl bg-white rounded-2xl border shadow-sm flex flex-col md:flex-row items-center md:items-stretch justify-between px-8 py-7 mb-8">
				<WalletBalance />
				<div className="flex gap-4 w-full md:w-auto justify-end">
					<button
						type="button"
						className="bg-green-500 hover:bg-green-600 text-white font-semibold rounded-full px-8 py-2 text-lg flex items-center gap-2 transition"
						onClick={() => setShowDepositModal(true)}
					>
						<span className="text-xl">+</span> Deposit
					</button>
					<button
						type="button"
						className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-full px-8 py-2 text-lg flex items-center gap-2 border transition"
						onClick={() => setShowSendModal(true)}
					>
						<span className="text-xl">↗</span> Send
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
