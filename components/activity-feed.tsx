import React, { useEffect, useState } from "react";
import { DepositButton } from "./deposit-button";
import Image from "next/image";

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
		<div className={`w-full max-w-5xl bg-white rounded-2xl border shadow-sm flex flex-col px-10 py-4 min-h-[350px] flex-grow`}>
			<div className="text-[#64748B] text-base mb-2">Last activity</div>
			<div className={`flex flex-col items-center flex-1 w-full ${loading ? "justify-center" : "justify-start"}`}>
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
				<div className={`w-full flex items-center ${loading ? "justify-center" : "justify-start"}`}>
					{loading && (
						<div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin border-[#0D42E4]" />
					)}
					{error && <div className="text-center text-red-500">{error}</div>}
					{!loading && !error && events.length > 0 && (
						<ul className="w-full">
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
										<div className="w-[50px] h-[50px] rounded-full  flex items-center justify-center bg-[#F1F5F9]">
											{isOutgoing ? <Image src="/arrow-up-right-icon.svg" alt="Sent" width={24} height={24} /> : <Image src="/plus-icon-black.svg" alt="Received" width={24} height={24} />}
										</div>
										<div className="flex-1">
											<div className="font-medium text-[#020617] text-base">
												{counterparty.slice(0, 6)}...{counterparty.slice(-4)}
											</div>
											<div className="text-sm text-[#64748B]">
												{new Date(event.timestamp).toLocaleString()}
											</div>
										</div>
										<div>
										<div className={`text-base font-semibold ${isOutgoing ? "text-[#0F172A]" : "text-[#0BAF5C]"}`}>
											{isOutgoing ? "-" : "+"} {Number(event.amount).toFixed(2)}
										</div>
										<div className="text-sm text-[#64748B] text-right">
											{event.token_symbol}
										</div>
										</div>
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
