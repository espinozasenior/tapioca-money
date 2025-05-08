import React, { useEffect, useState } from "react";
import { DepositButton } from "./deposit-button";

interface ActivityFeedProps {
	onDepositClick: () => void;
	walletAddress: string;
}

interface ActivityEvent {
	token_symbol: string;
	transaction_hash: string;
	to_address: string;
	from_address: string;
	timestamp: number; // Unix ms
	amount: string;
	type: string;
}

async function fetchWalletActivity(
	walletLocator: string,
): Promise<ActivityEvent[]> {
	const res = await fetch(
		`https://staging.crossmint.com/api/2022-06-09/wallets/${walletLocator}/activity?chain=base-sepolia`,
		{
			headers: {
				"X-API-Key": process.env.NEXT_PUBLIC_CROSSMINT_SERVER_API_KEY!,
				accept: "application/json",
			},
		},
	);
	if (!res.ok) throw new Error("Failed to fetch wallet activity");
	const data = await res.json();
	return data.events || [];
}

export function ActivityFeed({
	onDepositClick,
	walletAddress,
}: ActivityFeedProps) {
	const [events, setEvents] = useState<ActivityEvent[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!walletAddress) return;
		setLoading(true);
		fetchWalletActivity(walletAddress)
			.then((data) => setEvents(data))
			.catch((e) => setError(e.message))
			.finally(() => setLoading(false));
	}, [walletAddress]);

	return (
		<div className="w-full max-w-5xl bg-white rounded-2xl border shadow-sm flex flex-col px-10 py-4 min-h-[350px] flex-grow">
			<div className="text-[#64748B] text-base mb-2">Last activity</div>
			<div className="flex flex-col items-center justify-center flex-1 w-full">
				{!loading && events.length === 0 && (
					<>
						<div className="text-base text-[##020617] font-semibold mb-2 text-center">
							Your activity feed
						</div>
						<div className="text-[#64748B] text-center mb-7 max-w-xl">
							When you add, send and receive money it shows up here.
							<br />
							Get started with making a deposit to your account
						</div>
						<DepositButton onClick={onDepositClick} />
					</>
				)}
				<div className="w-full max-w-2xl flex justify-center items-center">
					{loading && (
						<div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin border-[#0D42E4]" />
					)}
					{error && <div className="text-center text-red-500">{error}</div>}
					{!loading && !error && events.length > 0 && (
						<ul className="divide-y divide-gray-100">
							{events.slice(0, 10).map((event) => {
								const isOutgoing =
									event.from_address.toLowerCase() ===
									walletAddress.toLowerCase();
								const counterparty = isOutgoing
									? event.to_address
									: event.from_address;
								const direction = isOutgoing ? "Sent" : "Received";
								return (
									<li
										key={event.transaction_hash}
										className="py-4 flex items-center gap-4"
									>
										<div className="w-8 h-8 rounded-full border flex items-center justify-center bg-gray-100">
											<span className="text-lg">{event.token_symbol[0]}</span>
										</div>
										<div className="flex-1">
											<div className="font-medium">
												{direction} {event.amount} {event.token_symbol}
											</div>
											<div className="text-xs text-gray-500">
												{direction === "Sent" ? "to" : "from"}{" "}
												{counterparty.slice(0, 6)}...{counterparty.slice(-4)}
											</div>
											<div className="text-xs text-gray-400">
												{new Date(event.timestamp).toLocaleString()}
											</div>
										</div>
										<a
											href={`https://sepolia.basescan.org/tx/${event.transaction_hash}`}
											target="_blank"
											rel="noopener noreferrer"
											className="text-blue-600 underline text-xs"
										>
											View
										</a>
									</li>
								);
							})}
						</ul>
					)}
				</div>
			</div>
		</div>
	);
}
