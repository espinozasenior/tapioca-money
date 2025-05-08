import Image from "next/image";
import React, { useEffect, useState } from "react";
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

const CLIENT_API_KEY_CONSOLE_FUND =
	process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_API_KEY;
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
				size: "16px",
				weight: "400",
			},
			colors: {
				text: "#000000",
				background: "#FFFFFF",
				border: "#E0E0E0",
				boxShadow: "none",
				placeholder: "#999999",
			},
			hover: {
				colors: {
					border: "#0074D9",
				},
			},
			focus: {
				colors: {
					border: "#0074D9",
					boxShadow: "none",
				},
			},
		},
		PrimaryButton: {
			colors: {
				background: "#0D42E4",
			},
			hover: {
				colors: {
					background: "#0A2FA2",
				},
			},
			disabled: {
				colors: {
					background: "#F1F5F9",
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
		<div className="mt-6 text-base p-4 w-full gap-[18px] flex flex-col font-semibold bg-[#F8FAFC] rounded-2xl">
			<div className="flex justify-between  text-[#64748B]">
				<span className="text-[#64748B]">Amount</span>
				<span className="text-[#334155]">${total.toFixed(2)}</span>
			</div>
			<div className="flex justify-between text-console-text-secondary">
				<span className="text-[#64748B]">Transaction fees</span>
				<span className="text-[#334155]">${fees.toFixed(2)}</span>
			</div>
			<div className="flex justify-between  text-console-label">
				<span className="text-[#64748B]">Total added to wallet</span>
				<span className="text-[#334155]">{amount.toFixed(2)} USDC</span>
			</div>
		</div>
	);
}

function CheckoutContent({
	amount,
	walletAddress,
	onPaymentCompleted,
}: { amount: string; walletAddress: string; onPaymentCompleted: () => void }) {
	const { order } = useCrossmintCheckout();
	const isUserInputPhase =
		order?.phase == null ||
		order.phase === "quote" ||
		order.phase === "payment";

	useEffect(() => {
		if (order?.phase === "completed") {
			onPaymentCompleted();
		}
	}, [order]);

	return (
		<div className="space-y-4 w-full">
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
					receiptEmail: "angel@paella.dev",
				}}
				appearance={CHECKOUT_APPEARANCE}
			/>
		</div>
	);
}

export function DepositModal({
	open,
	onClose,
	walletAddress,
}: DepositModalProps) {
	const [step, setStep] = useState<"options" | "card" | "completed">("options");
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
					className="absolute top-4 left-4 w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100"
					aria-label="Back"
					type="button"
				>
					<span className="text-2xl">←</span>
				</button>
				{!showCheckout && (
					<>
						<div className="text-lg font-semibold mt-2">Deposit</div>
						{step === "options" && (
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
						)}
						{amount && step === "options" && (
							<div className="w-full mb-8">
								<div className="text-gray-500 mb-2">From</div>
								<div className="bg-white border rounded-xl flex items-center p-4 gap-4 shadow-sm">
									<div className="bg-gray-100 rounded-lg p-2">
										<Image
											src="/credit-card.svg"
											alt="Card"
											width={32}
											height={20}
										/>
									</div>
									<div className="flex-1">
										<div className="font-medium">Deposit from card</div>
										<div className="text-gray-400 text-sm">
											Add debit/credit card
										</div>
									</div>
									<button
										className=" hover:bg-gray-100 rounded-full w-8 h-8 flex items-center justify-center"
										type="button"
										onClick={() => setStep("card")}
									>
										<Image
											className="text-black"
											src="/plus-icon-black.svg"
											alt="Add"
											width={24}
											height={24}
										/>
									</button>
								</div>
							</div>
						)}
					</>
				)}
				{(step === "card" || step === "completed") && (
					<div className="flex flex-col items-center justify-center w-full min-h-[300px]">
						<CrossmintProvider apiKey={CLIENT_API_KEY_CONSOLE_FUND as string}>
							<CrossmintCheckoutProvider>
								<CheckoutContent
									amount={amount}
									walletAddress={walletAddress}
									onPaymentCompleted={() => setStep("completed")}
								/>
							</CrossmintCheckoutProvider>
						</CrossmintProvider>
					</div>
				)}
				{step === "completed" && (
					<button
						className="w-full h-12 bg-[#0D42E4] text-white font-semibold rounded-full px-4 py-3 text-sm flex items-center justify-center gap-2 border transition"
						onClick={onClose}
					>
						Done
					</button>
				)}
			</div>
		</div>
	);
}
