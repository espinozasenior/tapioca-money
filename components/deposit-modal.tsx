import Image from "next/image";
import React, { useState } from "react";
import {
	CrossmintCheckoutProvider,
	CrossmintEmbeddedCheckout,
	CrossmintProvider,
	useAuth,
	useCrossmintCheckout,
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

interface AmountBreakdownProps {
	quote: {
		status: "valid" | "item-unavailable" | "expired" | "requires-recipient";
		charges?: {
			unit: {
				currency: string;
				amount: string;
			};
			totalPrice?: {
				currency: string;
				amount: string;
			};
		};
	};
	total: number;
}

function AmountBreakdown({ quote, total }: AmountBreakdownProps) {
	const amount = quote.charges?.unit.amount
		? Number.parseFloat(quote.charges.unit.amount)
		: 0;
	const fees = total - amount;

	return (
		<div className="mt-6 text-[15px] pt-3 pb-5">
			<div className="flex justify-between text-console-text-secondary py-2">
				<span className="text-gray-500">Amount</span>
				<span className="text-gray-500">${total.toFixed(2)}</span>
			</div>
			<div className="flex justify-between border-t text-console-text-secondary border-[#E5E7EB] py-2">
				<span className="text-gray-500">Transaction fees</span>
				<span className="text-gray-500">${fees.toFixed(2)}</span>
			</div>
			<div className="flex justify-between border-t border-[#E5E7EB] text-console-label py-2">
				<span className="text-gray-500">Total added to wallet</span>
				<span className="text-gray-500">{amount.toFixed(2)} USDC</span>
			</div>
		</div>
	);
}

function CheckoutContent({
	amount,
	walletAddress,
	receiptEmail,
}: { amount: string; walletAddress: string; receiptEmail?: string }) {
	const { order } = useCrossmintCheckout();
	const isUserInputPhase =
		order?.phase == null ||
		order.phase === "quote" ||
		order.phase === "payment";

	return (
		<>
			{isUserInputPhase &&
				order?.phase === "payment" &&
				order.lineItems[0].quote.status === "valid" && (
					<AmountBreakdown
						quote={order.lineItems[0].quote}
						total={Number.parseFloat(amount)}
					/>
				)}
			<CrossmintEmbeddedCheckout
				recipient={{
					walletAddress,
				}}
				lineItems={{
					tokenLocator: USDC_LOCATOR,
					executionParameters: {
						mode: "exact-in",
						amount: amount || "0.00",
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
					receiptEmail: receiptEmail,
				}}
				appearance={CHECKOUT_APPEARANCE}
			/>
		</>
	);
}

export function DepositModal({
	open,
	onClose,
	walletAddress,
}: DepositModalProps) {
	const [step, setStep] = useState<"options" | "card">("options");
	const { user } = useAuth();
	const receiptEmail = user?.email;
	const [amount, setAmount] = useState("");
	const [showCheckout, setShowCheckout] = useState(false);

	if (!open) return null;
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
			<div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 relative flex flex-col items-center">
				<button
					onClick={() =>
						showCheckout
							? setShowCheckout(false)
							: step === "options"
								? onClose()
								: setStep("options")
					}
					className="absolute top-4 left-4 w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200"
					aria-label="Back"
					type="button"
				>
					<span className="text-2xl">←</span>
				</button>
				{step === "options" && !showCheckout ? (
					<>
						<div className="text-lg font-semibold mb-6 mt-2">Deposit</div>
						<div className="flex flex-col items-center w-full mb-6">
							<input
								type="number"
								min="0"
								step="0.01"
								placeholder="$0.00"
								className="text-4xl font-bold text-center border-none outline-none focus:ring-0 w-full mb-1"
								value={amount}
								onChange={(e) => setAmount(e.target.value)}
								style={{ maxWidth: 200 }}
							/>
							<div className="text-gray-400">USDC</div>
						</div>
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
							className="w-full bg-green-500 text-white font-semibold rounded-full py-3 text-lg mt-2 hover:bg-green-600 transition"
							type="button"
							disabled={
								!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0
							}
							onClick={() => setShowCheckout(true)}
						>
							Continue
						</button>
					</>
				) : (
					<div className="flex flex-col items-center justify-center w-full min-h-[300px]">
						<CrossmintProvider apiKey={CLIENT_API_KEY_CONSOLE_FUND as string}>
							<CrossmintCheckoutProvider>
								<CheckoutContent
									amount={amount}
									walletAddress={walletAddress}
									receiptEmail={receiptEmail}
								/>
							</CrossmintCheckoutProvider>
						</CrossmintProvider>
					</div>
				)}
			</div>
		</div>
	);
}
