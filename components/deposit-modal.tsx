import Image from "next/image";
import React from "react";

interface DepositModalProps {
	open: boolean;
	onClose: () => void;
}

export function DepositModal({ open, onClose }: DepositModalProps) {
	if (!open) return null;
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
			<div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 relative flex flex-col items-center">
				<button
					onClick={onClose}
					className="absolute top-4 left-4 w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200"
					aria-label="Close"
					type="button"
				>
					<span className="text-2xl">←</span>
				</button>
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
							<div className="text-gray-400 text-sm">Add debit/credit card</div>
						</div>
						<button
							className="ml-2 bg-gray-100 hover:bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center"
							type="button"
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
			</div>
		</div>
	);
}
