import Image from "next/image";
import React, { useState } from "react";
import {
	CrossmintCheckoutProvider,
	CrossmintEmbeddedCheckout,
	CrossmintProvider,
	useAuth,
} from "@crossmint/client-sdk-react-ui";

interface DepositModalProps {
	open: boolean;
	onClose: () => void;
	walletAddress: string;
}

const CLIENT_API_KEY_CONSOLE_FUND = process.env.NEXT_PUBLIC_CROSSMINT_API_KEY;
const USDC_LOCATOR = `base-sepolia:${process.env.NEXT_PUBLIC_USDC_TOKEN_MINT}:${process.env.NEXT_PUBLIC_USDC_TOKEN_MINT}`;

const CHECKOUT_APPEARANCE = {
	rules: {
		Label: {
			font: {
				family: "Inter",
				size: "14px",
				weight: "500",
			},
			colors: {
				text: "#374151",
			},
		},
		Input: {
			borderRadius: "8px",
			font: {
				family: "Inter",
				size: "14px",
				weight: "400",
			},
			colors: {
				text: "#000000",
				background: "#FFFFFF",
				border: "#E2E8F0",
				boxShadow: "none",
				placeholder: "#64748B",
			},
			hover: {
				colors: {
					border: "#4ADE80",
				},
			},
			focus: {
				colors: {
					border: "#4ADE80",
					boxShadow: "0 0 0 2px rgba(0,116,217,0.2)",
				},
			},
		},
		DestinationInput: {
			display: "hidden",
		},
		ReceiptEmailInput: {
			display: "hidden",
		},
	},
} as const;

export function DepositModal({
	open,
	onClose,
	walletAddress,
}: DepositModalProps) {
	const [step, setStep] = useState<"options" | "card">("options");
	const { user } = useAuth();
	const receiptEmail = user?.email;
	if (!open) return null;
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
			<div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 relative flex flex-col items-center">
				<button
					onClick={() => (step === "options" ? onClose() : setStep("options"))}
					className="absolute top-4 left-4 w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200"
					aria-label="Back"
					type="button"
				>
					<span className="text-2xl">←</span>
				</button>
				{step === "options" ? (
					<>
						<div className="text-lg font-semibold mb-6 mt-2">Deposit</div>
						<div className="text-4xl font-bold mb-1">$0.00</div>
						<div className="text-gray-400 mb-6">0.00 USDC</div>
						<div className="w-full mb-8">
							<div className="text-gray-500 mb-2">From</div>
							<div className="bg-white border rounded-xl flex items-center p-4 gap-4 shadow-sm">
								<div className="bg-gray-100 rounded-lg p-2">
									<Image src="/card.svg" alt="Card" width={32} height={20} />
								</div>
								<div className="flex-1">
									<div className="font-medium">Deposit from card</div>
									<div className="text-gray-400 text-sm">
										Add debit/credit card
									</div>
								</div>
								<button
									className="ml-2 bg-gray-100 hover:bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center"
									type="button"
									onClick={() => setStep("card")}
								>
									<span className="text-2xl font-bold">+</span>
								</button>
							</div>
						</div>
						<button
							className="w-full bg-gray-100 text-gray-400 font-semibold rounded-full py-3 text-lg mt-2 cursor-not-allowed"
							disabled
							type="button"
						>
							Continue
						</button>
					</>
				) : (
					<div className="flex flex-col items-center justify-center w-full min-h-[300px]">
						<CrossmintProvider apiKey={CLIENT_API_KEY_CONSOLE_FUND!}>
							<CrossmintCheckoutProvider>
								<CrossmintEmbeddedCheckout
									recipient={{
										walletAddress,
									}}
									lineItems={{
										tokenLocator: USDC_LOCATOR,
										executionParameters: {
											mode: "exact-in",
											amount: "5.00",
											maxSlippageBps: "500",
										},
									}}
									payment={{
										crypto: { enabled: false },
										fiat: {
											enabled: true,
											allowedMethods: {
												card: true,
												applePay: false,
												googlePay: false,
											},
										},
										receiptEmail: "angel@paella.dev",
									}}
									appearance={CHECKOUT_APPEARANCE}
								/>
							</CrossmintCheckoutProvider>
						</CrossmintProvider>
					</div>
				)}
			</div>
		</div>
	);
}
