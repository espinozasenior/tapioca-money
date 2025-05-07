"use client";

import { LoginButton } from "@/components/login";
import { MainScreen } from "@/components/main-screen";
import { useAuth, useWallet } from "@crossmint/client-sdk-react-ui";
import Image from "next/image";

export function HomeContent() {
	const { wallet, status: walletStatus } = useWallet();
	const { status, status: authStatus } = useAuth();

	const walletAddress = wallet?.address;
	const isLoggedIn = wallet != null && status === "logged-in";
	const isLoading =
		walletStatus === "in-progress" || authStatus === "initializing";

	if (isLoading) {
		return (
			<div className="flex justify-center items-center">
				<div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
			</div>
		);
	}

	if (!isLoggedIn) {
		return (
			<div className="flex flex-col gap-4 justify-center items-center">
				<Image
					src="/crossmint.svg"
					alt="Crossmint logo"
					priority
					width={150}
					height={150}
				/>
				<h1 className="text-xl font-medium">Solana Wallets Quickstart</h1>
				<div className="max-w-md mt-3 w-full min-h-[38px]">
					<LoginButton />
				</div>
			</div>
		);
	}

	return <MainScreen walletAddress={walletAddress} />;
}
