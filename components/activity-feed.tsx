import React from "react";

interface ActivityFeedProps {
	onDepositClick: () => void;
}

export function ActivityFeed({ onDepositClick }: ActivityFeedProps) {
	return (
		<div className="w-full max-w-4xl bg-white rounded-2xl border shadow-sm flex flex-col px-8 py-16 min-h-[350px]">
			<div className="text-gray-400 text-base mb-8">Last activity</div>
			<div className="flex flex-col items-center justify-center flex-1 w-full mt-12">
				<div className="text-xl font-semibold mb-2 text-center">
					Your activity feed
				</div>
				<div className="text-gray-400 text-center mb-6 max-w-xl">
					When you add, send and receive money it shows up here.
					<br />
					Get started with making a deposit to your account
				</div>
				<button
					type="button"
					className="bg-green-500 hover:bg-green-600 text-white font-semibold rounded-full px-8 py-2 text-lg flex items-center gap-2 transition"
					onClick={onDepositClick}
				>
					<span className="text-xl">+</span> Deposit
				</button>
			</div>
		</div>
	);
}
