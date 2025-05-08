import React, { useEffect, useState } from "react";
import { DepositButton } from "./deposit-button";

interface ActivityFeedProps {
	onDepositClick: () => void;
	walletAddress: string;
}

interface TokenTransfer {
	token_name: string;
	token_symbol: string;
	token_logo: string;
	token_decimals: string;
	transaction_hash: string;
	block_timestamp: string;
	to_address: string;
	from_address: string;
	value: string;
}

async function fetchWalletTokenTransfers(
	address: string,
): Promise<TokenTransfer[]> {
	const res = await fetch(
		`https://deep-index.moralis.io/api/v2.2/${address}/erc20/transfers?chain=0x14a34&order=DESC`,
		{
			headers: {
				"X-API-Key":
					"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjA4NDhkNTIyLTAxNDktNGNlNC05NDhmLTAxMzIyMjJmMTlkNyIsIm9yZ0lkIjoiNDQ1OTk4IiwidXNlcklkIjoiNDU4ODcxIiwidHlwZUlkIjoiMmJmNjBmNGQtNjRkMy00MjE3LTgwM2MtOGUxMWE1MDdiZmY2IiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NDY3MTU2ODMsImV4cCI6NDkwMjQ3NTY4M30.T0bkG7B7KUbNGrTDzWcOWJM5OcLjvnU0ntAP6TqgxVM",
				accept: "application/json",
			},
		},
	);
	if (!res.ok) throw new Error("Failed to fetch token transfers");
	const data = await res.json();
	return data.result || [];
}

export function ActivityFeed({
	onDepositClick,
	walletAddress,
}: ActivityFeedProps) {
	const [transfers, setTransfers] = useState<TokenTransfer[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!walletAddress) return;
		setLoading(true);
		fetchWalletTokenTransfers(walletAddress)
			.then((data) => setTransfers(data))
			.catch((e) => setError(e.message))
			.finally(() => setLoading(false));
	}, [walletAddress]);

	return (
		<div className="w-full max-w-5xl bg-white rounded-2xl border shadow-sm flex flex-col px-10 py-4 min-h-[350px] flex-grow">
			<div className="text-[#64748B] text-base mb-2">Last activity</div>
			<div className="flex flex-col items-center justify-center flex-1 w-full">
			{!loading && transfers.length === 0 && <>
				<div className="text-base text-[##020617] font-semibold mb-2 text-center">
					Your activity feed
				</div>
				<div className="text-[#64748B] text-center mb-7 max-w-xl">
					When you add, send and receive money it shows up here.
					<br />
					Get started with making a deposit to your account
				</div>
				<DepositButton onClick={onDepositClick} /></>}
				<div className="w-full max-w-2xl flex justify-center items-center">
					{loading && (<div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin border-[#0D42E4]" />)}
					{error && <div className="text-center text-red-500">{error}</div>}
					{!loading && !error && transfers.length > 0 && (
						<ul className="divide-y divide-gray-100">
							{transfers.slice(0, 10).map((tx) => {
								const isOutgoing =
									tx.from_address.toLowerCase() === walletAddress.toLowerCase();
								const counterparty = isOutgoing
									? tx.to_address
									: tx.from_address;
								const direction = isOutgoing ? "Sent" : "Received";
								const amount =
									Number(tx.value) / 10 ** Number(tx.token_decimals);
								return (
									<li
										key={tx.transaction_hash}
										className="py-4 flex items-center gap-4"
									>
										<img
											src={tx.token_logo}
											alt={tx.token_symbol}
											className="w-8 h-8 rounded-full border"
										/>
										<div className="flex-1">
											<div className="font-medium">
												{direction} {amount} {tx.token_symbol}
											</div>
											<div className="text-xs text-gray-500">
												{direction === "Sent" ? "to" : "from"}{" "}
												{counterparty.slice(0, 6)}...{counterparty.slice(-4)}
											</div>
											<div className="text-xs text-gray-400">
												{new Date(tx.block_timestamp).toLocaleString()}
											</div>
										</div>
										<a
											href={`https://sepolia.basescan.org/tx/${tx.transaction_hash}`}
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
