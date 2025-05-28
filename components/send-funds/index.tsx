import React, { useState } from "react";
import { useAuth, useWallet } from "@crossmint/client-sdk-react-ui";
import { type Address, encodeFunctionData, erc20Abi, isAddress } from "viem";
import { AmountInput } from "./AmountInput";
import { OrderPreview } from "./OrderPreview";
import { RecipientInput } from "./RecipientInput";
import { useBalance } from "@/hooks/useBalance";

interface SendFundsModalProps {
	open: boolean;
	onClose: () => void;
	balance: string;
}

const isEmail = (email: string) => {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
};

export function SendFundsModal({
	open,
	onClose,
	balance,
}: SendFundsModalProps) {
	const { wallet, type } = useWallet();
	const { user } = useAuth();
	const [recipient, setRecipient] = useState("");
	const [amount, setAmount] = useState("");
	const [showPreview, setShowPreview] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [txnHash, setTxnHash] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [resolvedEmailAddress, setResolvedEmailAddress] = useState<string | null>(null);
	const { usdcBalance, formatBalance } = useBalance();

	const isRecipientValid = isAddress(recipient) || isEmail(recipient);
	const isAmountValid = !!amount && !Number.isNaN(Number(amount)) && Number(amount) > 0 && Number(amount) <= Number(formatBalance(usdcBalance));
	const canContinue = isRecipientValid && isAmountValid;

	async function getWalletAddressByEmail(email: string): Promise<string> {
		const apiKey = process.env.NEXT_PUBLIC_CROSSMINT_SERVER_API_KEY;
		if (!apiKey) throw new Error("Missing Crossmint API key");
		const locator = `email:${email}:evm-smart-wallet`;
		const res = await fetch(
			`https://staging.crossmint.com/api/2022-06-09/wallets/${locator}`,
			{
				headers: {
					"X-API-KEY": apiKey,
					accept: "application/json",
				},
			},
		);
		if (!res.ok) throw new Error("Could not resolve email to wallet address");
		const data = await res.json();
		return data.address;
	}

	async function handleContinue() {
		setError(null);
		if (isEmail(recipient)) {
			if (!recipient) {
				setError("Please enter a recipient");
				return;
			}
			try {
				setIsLoading(true);
				const resolved = await getWalletAddressByEmail(recipient);
				if (!resolved || !isAddress(resolved)) {
					setError("Could not resolve email to a valid wallet address");
					setIsLoading(false);
					return;
				}
				setResolvedEmailAddress(resolved);
				setShowPreview(true);
			} catch (e: unknown) {
				setError((e as Error).message || String(e));
			} finally {
				setIsLoading(false);
			}
		} else {
			setShowPreview(true);
		}
	}

	async function handleSend() {
		setError(null);
		setIsLoading(true);
		setTxnHash(null);
		try {
			if (!wallet || type !== "evm-smart-wallet") {
				setError("No EVM wallet connected");
				setIsLoading(false);
				return;
			}
			let recipientAddress: string | undefined;
			if (isAddress(recipient)) {
				if (!recipient || !isAddress(recipient)) {
					setError("Invalid recipient address");
					setIsLoading(false);
					return;
				}
				recipientAddress = recipient;
			} else if (isEmail(recipient)) {
				if (!resolvedEmailAddress) {
					setError("No resolved wallet address for email");
					setIsLoading(false);
					return;
				}
				recipientAddress = resolvedEmailAddress;
			}
			if (!amount) {
				setError("Missing amount");
				setIsLoading(false);
				return;
			}
			const usdcToken = process.env.NEXT_PUBLIC_USDC_TOKEN_MINT as Address;
			if (!usdcToken) {
				setError("USDC token address not set");
				setIsLoading(false);
				return;
			}
			const data = encodeFunctionData({
				abi: erc20Abi,
				functionName: "transfer",
				args: [recipientAddress as Address, BigInt(Math.round(Number(amount) * 10 ** 6))],
			});
			const txn = await wallet.sendTransaction({
				to: usdcToken,
				value: BigInt(0),
				data,
			});
			setTxnHash(`https://sepolia.basescan.org/tx/${txn}`);
		} catch (err: unknown) {
			setError((err as Error).message || String(err));
		} finally {
			setIsLoading(false);
		}
	}

	if (!open) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
			<div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 relative flex flex-col items-center">
				<button
					onClick={showPreview ? () => setShowPreview(false) : onClose}
					className="absolute top-4 left-4 w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200"
					aria-label="Back"
					type="button"
				>
					<span className="text-2xl">←</span>
				</button>
				{!showPreview ? (
					<>
						<div className="text-lg font-semibold mb-6 mt-2">Send</div>
						<AmountInput amount={amount} onChange={setAmount} />
						<RecipientInput recipient={recipient} onChange={setRecipient} />
						<button
							className={`w-full font-semibold rounded-full py-3 text-lg mt-8 transition ${
								canContinue
									? "bg-blue-600 text-white hover:bg-blue-700"
									: "bg-gray-100 text-gray-400 cursor-not-allowed"
							}`}
							disabled={!canContinue}
							type="button"
							onClick={handleContinue}
						>
							Continue
						</button>
					</>
				) : (
					<OrderPreview
						userEmail={user?.email || ""}
						recipient={recipient}
						amount={amount}
						error={error}
						txnHash={txnHash}
						isLoading={isLoading}
						onBack={() => setShowPreview(false)}
						onConfirm={handleSend}
						onClose={onClose}
					/>
				)}
			</div>
		</div>
	);
}
