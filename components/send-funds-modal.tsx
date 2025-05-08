import React, { useState } from "react";
import Image from "next/image";
import { useAuth, useWallet } from "@crossmint/client-sdk-react-ui";
import { type Address, encodeFunctionData, erc20Abi, isAddress } from "viem";

interface SendFundsModalProps {
	open: boolean;
	onClose: () => void;
	balance: string;
}

const isEmail = (email: string) => {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
};

const Details = ({
	values,
}: { values: { label: string; value: string }[] }) => {
	return (
		<div className="mt-2.5 text-base p-4 w-full gap-[18px] flex flex-col font-semibold bg-[#F8FAFC] rounded-2xl">
			{values.map((value) => (
				<div key={value.label} className="flex justify-between  text-[#64748B]">
					<div className="text-[#64748B]">{value.label}</div>
					<div className="text-[#334155]">{value.value}</div>
				</div>
			))}
		</div>
	);
};

export function SendFundsModal({
	open,
	onClose,
	balance,
}: SendFundsModalProps) {
	const { wallet, type } = useWallet();
	const { user } = useAuth();
	const [method, setMethod] = useState<"email" | "address">("email");
	const [email, setEmail] = useState("");
	const [address, setAddress] = useState("");
	const [amount, setAmount] = useState("");
	const [showPreview, setShowPreview] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [txnHash, setTxnHash] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [resolvedEmailAddress, setResolvedEmailAddress] = useState<
		string | null
	>(null);

	const isAddressValid =
		method === "address" ? isAddress(address) : isEmail(email);
	const isAmountValid =
		!!amount && !Number.isNaN(Number(amount)) && Number(amount) > 0;
	const canContinue = isAmountValid && isAddressValid;

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
		if (method === "email") {
			if (!email) {
				setError("Please enter an email address");
				return;
			}
			try {
				setIsLoading(true);
				const resolved = await getWalletAddressByEmail(email);
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
			if (method === "address") {
				if (!address || !isAddress(address)) {
					setError("Invalid recipient address");
					setIsLoading(false);
					return;
				}
				recipientAddress = address;
			} else if (method === "email") {
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
				args: [recipientAddress as Address, BigInt(Number(amount) * 10 ** 6)],
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
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 ">
			<div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 relative flex flex-col items-center min-h-[630px]">
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
						<div className="flex flex-col items-center justify-between w-full mb-6">
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
							<div className="text-gray-400">0.00 USDC</div>
						</div>
						<div className="w-full mb-8">
							<div className="text-gray-500 mb-2">Send to</div>
							<div className="flex flex-col gap-4">
								{/* Send to email */}
								<label
									className={`border rounded-xl p-4 flex items-center gap-4 cursor-pointer transition ${method === "email" ? "border-[#0D42E4]" : "border-gray-200 bg-white"}`}
								>
									<input
										type="radio"
										name="send-method"
										checked={method === "email"}
										onChange={() => setMethod("email")}
										className="accent-[#0D42E4]"
									/>
									<div className="flex flex-col flex-1">
										<span className="font-medium flex items-center gap-2">
											Send to email
										</span>
										<span className="text-gray-500 text-sm">
											Send money to wallet linked to email
										</span>
										<input
											type="email"
											placeholder="Enter email address"
											className="mt-2 px-3 py-2 border rounded-md text-sm w-full"
											disabled={method !== "email"}
											value={email}
											onChange={(e) => setEmail(e.target.value)}
										/>
									</div>
								</label>
								{/* Send to wallet address */}
								<label
									className={`border rounded-xl p-4 flex items-center gap-4 cursor-pointer transition ${method === "address" ? "border-[#0D42E4]" : "border-gray-200 bg-white"}`}
								>
									<input
										type="radio"
										name="send-method"
										checked={method === "address"}
										onChange={() => setMethod("address")}
										className="accent-[#0D42E4]"
									/>
									<div className="flex flex-col flex-1">
										<span className="font-medium flex items-center gap-2">
											<span className="inline-block w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center mr-2">
												<svg
													width="16"
													height="16"
													fill="none"
													viewBox="0 0 16 16"
													aria-label="Wallet icon"
												>
													<title>Wallet icon</title>
													<rect
														x="2.667"
														y="4.667"
														width="10.667"
														height="6.666"
														rx="2"
														stroke="#222"
														strokeWidth="1.2"
													/>
													<path
														d="M4.667 7.333h6.666"
														stroke="#222"
														strokeWidth="1.2"
													/>
												</svg>
											</span>
											Send to wallet address
										</span>
										<span className="text-gray-500 text-sm">
											Send money to a wallet address
										</span>
										<input
											type="text"
											placeholder="Enter wallet address"
											className="mt-2 px-3 py-2 border rounded-md text-sm w-full"
											disabled={method !== "address"}
											value={address}
											onChange={(e) => setAddress(e.target.value)}
										/>
									</div>
								</label>
							</div>
						</div>
						<button
							className={`w-full font-semibold rounded-full py-3 text-lg mt-2 transition ${canContinue ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
							disabled={!canContinue}
							type="button"
							onClick={handleContinue}
						>
							Continue
						</button>
					</>
				) : (
					// Order preview modal
					<div className="w-full flex justify-between flex-grow flex-col">
						<div>
							<div className="text-lg font-semibold mb-6 mt-2 text-center">
								Order Confirmation
							</div>
							<div className="uppercase text-sm font-semibold text-[#020617]">
								Details
							</div>
							<Details
								values={[
									{ label: "From", value: user?.email || "" },
									{ label: "To", value: address || email },
								]}
							/>
							<Details values={[{ label: "Amount", value: `$ ${amount}` }]} />
							{error && (
								<div className="text-red-500 text-center mb-2">{error}</div>
							)}
							{txnHash && (
								<a
									href={txnHash}
									target="_blank"
									rel="noopener noreferrer"
									className="block text-center text-blue-600 underline mt-2 mb-2"
								>
									View on Explorer
								</a>
							)}
						</div>
						<div>
							<button
								className={`w-full font-semibold rounded-full py-3 text-lg mt-2 transition ${isLoading ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"}`}
								type="button"
								onClick={txnHash ? () => onClose() : handleSend}
								disabled={isLoading}
							>
								{isLoading ? "Sending..." : txnHash ? "Done" : "Confirm"}
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
