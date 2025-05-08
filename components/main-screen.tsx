import Image from "next/image";
import { useState } from "react";
import { DepositModal } from "@/components/deposit-modal";
import { WalletBalance } from "@/components/balance";
import { SendFundsModal } from "@/components/send-funds-modal";
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

	// Placeholder for balance, ideally get from WalletBalance or context
	const [usdcBalance, setUsdcBalance] = useState("0.00");

	return (
		<div className="w-full h-full py-8 flex justify-center items-center gap-2">
			<div className="h-full px-3 space-y-[14px]">
				<Image src="/crossmint-logo.png" alt="Wallet" width={54} height={54} />
				<div className="space-y-1 cursor-pointer">
					<div className="p-3 bg-[#E9EEFD] rounded-2xl">
						<Image src="/home.svg" alt="Home" width={30} height={30} className="mx-auto" />
					</div>
					<div className="text-[#1C42B2] text-base font-semibold text-center">Home</div>
				</div>
				<div className="space-y-1 cursor-pointer group">
					<div className="p-3 group-hover:bg-[#E9EEFD] rounded-2xl transition">
						<Image src="/card.svg" alt="Home" width={30} height={30} className="mx-auto" />
					</div>
					<div className="text-[#64748B] text-base font-semibold text-center">Card</div>
				</div>
				<div className="space-y-1 cursor-pointer group">
					<div className="p-3 group-hover:bg-[#E9EEFD] rounded-2xl transition">
						<Image src="/security.svg" alt="Home" width={30} height={30} className="mx-auto" />
					</div>
					<div className="text-[#64748B] text-base font-semibold text-center">Security</div>
				</div>
			</div>
			<div className="w-full max-w-5xl h-full">
				{/* Wallet Header */}
				<div className="w-full max-w-5xl flex justify-between items-center px-2 h-14">
					<div className="w-full max-w-5xl flex items-center gap-2 px-4">
						<span className="text-xl font-semibold ml-2">Home</span>
					</div>
					<button onClick={logout} className="flex items-center gap-1 text-base text-[#0D42E4]">
						Logout
						<Image src="/logout-icon.svg" alt="Logout" width={24} height={24} />
					</button>
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
		</div>
	);
}
