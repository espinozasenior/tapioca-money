"use client";

import {
	CrossmintProvider,
	CrossmintAuthProvider,
} from "@crossmint/client-sdk-react-ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

if (
	!process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_API_KEY ||
	!process.env.NEXT_PUBLIC_CROSSMINT_SERVER_API_KEY
) {
	throw new Error(
		"NEXT_PUBLIC_CROSSMINT_CLIENT_API_KEY or NEXT_PUBLIC_CROSSMINT_SERVER_API_KEY is not set",
	);
}

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<CrossmintProvider
			apiKey={process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_API_KEY || ""}
		>
			<CrossmintAuthProvider
				authModalTitle="Wallets Quickstart"
				embeddedWallets={{
					createOnLogin: "all-users",
					type: "evm-smart-wallet",
					defaultChain: "base-sepolia",
					showPasskeyHelpers: true,
				}}
				loginMethods={["email", "google"]}
			>
				<QueryClientProvider client={queryClient}>
					{children}
				</QueryClientProvider>
			</CrossmintAuthProvider>
		</CrossmintProvider>
	);
}
