import React, { useState } from "react";

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

	if (!open) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
			<div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 relative flex flex-col items-center">
				<button
					onClick={onClose}
					className="absolute top-4 left-4 w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200"
					aria-label="Back"
					type="button"
				>
					<span className="text-2xl">←</span>
				</button>
				<div className="text-lg font-semibold mb-6 mt-2">Send</div>
				<div className="text-4xl font-bold mb-1">${balance}</div>
				<div className="text-gray-400 mb-6">0.00 USDC</div>
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
					className="w-full bg-gray-100 text-gray-400 font-semibold rounded-full py-3 text-lg mt-2 cursor-not-allowed"
					disabled
					type="button"
				>
					Continue
				</button>
			</div>
		</div>
	);
}
