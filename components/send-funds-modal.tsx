import React, { useState } from "react";
import Image from "next/image";

interface SendFundsModalProps {
	open: boolean;
	onClose: () => void;
	balance: string;
}

export function SendFundsModal({
	open,
	onClose,
	balance,
}: SendFundsModalProps) {
	const [method, setMethod] = useState<"email" | "address">("email");
	const [email, setEmail] = useState("");
	const [address, setAddress] = useState("");
	const [amount, setAmount] = useState("");
	const [showPreview, setShowPreview] = useState(false);

	const isEmailValid = method === "email" ? /.+@.+\..+/.test(email) : true;
	const isAddressValid = method === "address" ? address.length > 0 : true;
	const isAmountValid =
		!!amount && !Number.isNaN(Number(amount)) && Number(amount) > 0;
	const canContinue =
		isAmountValid &&
		((method === "email" && isEmailValid) ||
			(method === "address" && isAddressValid));

	// Example fee calculation
	const fee = amount ? (0.004 * Number(amount)).toFixed(2) : "0.00";
	const total = amount ? Number(amount) + Number(fee) : 0;

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
							<div className="text-gray-400">0.00 USDC</div>
						</div>
						<div className="w-full mb-8">
							<div className="text-gray-500 mb-2">Send to</div>
							<div className="flex flex-col gap-4">
								{/* Send to email */}
								<label
									className={`border rounded-xl p-4 flex items-center gap-4 cursor-pointer transition ${method === "email" ? "border-green-400 bg-green-50" : "border-gray-200 bg-white"}`}
								>
									<input
										type="radio"
										name="send-method"
										checked={method === "email"}
										onChange={() => setMethod("email")}
										className="accent-green-500"
									/>
									<div className="flex flex-col flex-1">
										<span className="font-medium flex items-center gap-2">
											<span className="inline-block w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center mr-2">
												<svg
													width="16"
													height="16"
													fill="none"
													viewBox="0 0 16 16"
													aria-label="Email icon"
												>
													<title>Email icon</title>
													<path
														d="M2.667 4.667A2 2 0 0 1 4.667 2.667h6.666a2 2 0 0 1 2 2v6.666a2 2 0 0 1-2 2H4.667a2 2 0 0 1-2-2V4.667Z"
														stroke="#222"
														strokeWidth="1.2"
													/>
													<path
														d="m3.333 4.667 4.667 3.333 4.667-3.333"
														stroke="#222"
														strokeWidth="1.2"
													/>
												</svg>
											</span>
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
									className={`border rounded-xl p-4 flex items-center gap-4 cursor-pointer transition ${method === "address" ? "border-green-400 bg-green-50" : "border-gray-200 bg-white"}`}
								>
									<input
										type="radio"
										name="send-method"
										checked={method === "address"}
										onChange={() => setMethod("address")}
										className="accent-green-500"
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
							onClick={() => canContinue && setShowPreview(true)}
						>
							Continue
						</button>
					</>
				) : (
					// Order preview modal
					<div className="w-full">
						<div className="text-lg font-semibold mb-6 mt-2 text-center">
							Order preview
						</div>
						<div className="mb-6">
							<div className="font-semibold mb-2">Sent token</div>
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-3">
									<Image src="/usdc.svg" alt="USDC" width={36} height={36} />
									<span>USDC</span>
								</div>
								<span className="text-lg font-semibold">{amount}</span>
							</div>
						</div>
						<div className="mb-6">
							<div className="font-semibold mb-2">Order details</div>
							<div className="flex justify-between text-gray-500 mb-1">
								<span>Fees</span>
								<span>${fee}</span>
							</div>
							<div className="flex justify-between font-semibold">
								<span>Total</span>
								<span>${total.toFixed(2)}</span>
							</div>
						</div>
						<div className="mb-8">
							<div className="font-semibold mb-2">Destination</div>
							<div className="flex flex-col gap-1 text-gray-700">
								<span className="text-sm">
									{method === "email"
										? `Email: ${email}`
										: `Wallet: ${address}`}
								</span>
							</div>
						</div>
						<button
							className="w-full bg-blue-600 text-white font-semibold rounded-full py-3 text-lg mt-2 hover:bg-blue-700 transition"
							type="button"
							onClick={() => {
								/* TODO: Implement send logic here */
							}}
						>
							Confirm
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
