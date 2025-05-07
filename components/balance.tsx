"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
	useWallet,
	type WalletBalance as WalletBalanceType,
} from "@crossmint/client-sdk-react-ui";

export function WalletBalance() {
	const { wallet, type } = useWallet();
	const [balances, setBalances] = useState<WalletBalanceType>([]);
	const [copied, setCopied] = useState(false);

	const address = wallet?.address;

	useEffect(() => {
		async function fetchBalances() {
			if (!wallet || type !== "solana-smart-wallet") return;
			try {
				const balances = await wallet.getBalances(["usdc"]);
				setBalances(balances);
			} catch (error) {
				console.error("Error fetching wallet balances:", error);
				alert(`Error fetching wallet balances: ${error}`);
			}
		}
		fetchBalances();
	}, [wallet, type]);

	const formatBalance = (balance: string, decimals: number) => {
		return (Number(balance) / 10 ** decimals).toFixed(2);
	};

	const usdcBalance =
		balances?.find((t) => t.token === "usdc")?.balances.total || "0";

	const shortAddress = address
		? `${address.slice(0, 4)}...${address.slice(-4)}`
		: "";

	const handleCopy = () => {
		if (!address) return;
		navigator.clipboard.writeText(address);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="flex flex-col items-start w-full md:w-auto mb-6 md:mb-0">
			<div className="flex items-center gap-2 mb-2">
				<span className="text-gray-400 text-base font-medium">
					{address ? `(${shortAddress})` : ""}
				</span>
				{address && (
					<button
						type="button"
						onClick={handleCopy}
						className="text-gray-400 hover:text-gray-700 transition"
						aria-label="Copy address"
					>
						{copied ? (
							<Image src="/check.svg" alt="Copied" width={16} height={16} />
						) : (
							<Image src="/copy.svg" alt="Copy" width={16} height={16} />
						)}
					</button>
				)}
			</div>
			<span className="text-gray-500 text-base mb-1">Your balance</span>
			<span className="text-4xl font-semibold">
				${formatBalance(usdcBalance, 6)}
			</span>
		</div>
	);
}
