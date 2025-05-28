import Image from "next/image";
import React, { useState } from "react";
import {
	CrossmintCheckoutProvider,
	CrossmintProvider,
	useAuth,
} from "@crossmint/client-sdk-react-ui";
import { Checkout } from "./Checkout";
import { AmountInput } from "../common/AmountInput";
import { Modal } from "../common/Modal";
import clsx from "clsx";

interface DepositModalProps {
	open: boolean;
	onClose: () => void;
	walletAddress: string;
}

const CLIENT_API_KEY_CONSOLE_FUND =
	process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_API_KEY;

const MAX_AMOUNT = 50; // Max amount in USD allowed in staging

export function DepositModal({
	open,
	onClose,
	walletAddress,
}: DepositModalProps) {
	const [step, setStep] = useState<"options" | "processing" | "completed">("options");
	const { user } = useAuth();
	const receiptEmail = user?.email;
	const [amount, setAmount] = useState("");

	const restartFlow = () => {
		setStep("options");
		setAmount("");
	}

	const handleDone = () => {
		restartFlow();
		onClose();
	}


	return (
		<Modal
			open={open}
			onClose={onClose}
			showBackButton={step !== "processing"}
			onBack={step === "options" ? handleDone : restartFlow}
			className={clsx(amount && "min-h-[718px]")}
		>
			<div className="text-lg font-semibold mt-2">Deposit</div>
			{step !== "completed" &&
				< div className="flex flex-col items-center w-full mb-6">
					<AmountInput amount={amount} onChange={setAmount} />
					{Number(amount) > MAX_AMOUNT && <div className="text-red-600 text-center mt-1">Transaction amount exceeds the maximum allowed deposit limit of ${MAX_AMOUNT}</div>}
				</div>
			}
			<div className="flex flex-col items-center justify-center w-full">
				<CrossmintProvider apiKey={CLIENT_API_KEY_CONSOLE_FUND as string}>
					<CrossmintCheckoutProvider>
						<Checkout
							amount={amount}
							isAmountValid={Number(amount) <= MAX_AMOUNT && Number(amount) > 0}
							walletAddress={walletAddress}
							onPaymentCompleted={() => setStep("completed")}
							receiptEmail={receiptEmail || ""}
							onProcessingPayment={() => setStep("processing")}
						/>
					</CrossmintCheckoutProvider>
				</CrossmintProvider>
			</div>

			{
				step === "completed" && (
					<button
						className="w-full h-12 bg-[#0D42E4] text-white font-semibold rounded-full px-4 py-3 text-sm flex items-center justify-center gap-2 border transition"
						onClick={handleDone}
					>
						Done
					</button>
				)
			}
		</Modal >
	);
}
