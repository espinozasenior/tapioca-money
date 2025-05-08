"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@crossmint/client-sdk-react-ui";

export function WalletBalance() {
	const { wallet, type } = useWallet();
	const [balances, setBalances] = useState<any>([]);

	useEffect(() => {
		async function fetchBalances() {
			if (!wallet || type !== "evm-smart-wallet") return;
			try {
				const balances = await wallet.getBalances(["usdc" as any]);
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
		balances?.find((t: any) => t.token === "usdc")?.balances.total || "0";

	return (
		<div className="flex flex-col items-start w-full md:w-auto mb-6 md:mb-0">
			<span className="text-gray-500 text-base mb-1">Your balance</span>
			<span className="text-4xl font-semibold">
				${formatBalance(usdcBalance, 6)}
			</span>
		</div>
	);
}
