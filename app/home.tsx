"use client";

import { LoginButton } from "@/components/login";
import { MainScreen } from "@/components/main-screen";
import { useAuth, useWallet } from "@crossmint/client-sdk-react-ui";

export function HomeContent() {
	const { wallet, status: walletStatus } = useWallet();
	const { status, status: authStatus, login } = useAuth();

	const walletAddress = wallet?.address;
	const isLoggedIn = wallet != null && status === "logged-in";
	const isLoading =
		walletStatus === "in-progress" || authStatus === "initializing";


	if (isLoading) {
		return (
			<div className="flex justify-center items-center w-full h-full">
				<div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin border-[#0D42E4]" />
			</div>
		);
	}

	if (!isLoggedIn) {
		return (
			<LoginButton />
		);
	}

	return (
		<MainScreen walletAddress={walletAddress} />
	);
}
