"use client";

import { PrivyProvider, dataSuffix } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { BUILDER_CODE_SUFFIX } from "@/lib/builder-code";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { base } from "viem/chains";
import { WalletSelectionProvider } from "@/hooks/useWalletSelection";

// Validate environment variables
if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
  throw new Error("NEXT_PUBLIC_PRIVY_APP_ID is not set");
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      refetchOnWindowFocus: false,
    },
  },
});

const solanaConnectors = toSolanaWalletConnectors({ shouldAutoConnect: false });

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <PrivyProvider
        appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
        config={{
          loginMethods: ["email", "wallet"],
          appearance: {
            theme: "light",
            accentColor: "#676FFF",
            walletChainType: "ethereum-and-solana",
            walletList: [
              "metamask",
              "coinbase_wallet",
              "rainbow",
              "phantom",
              "detected_ethereum_wallets",
              "wallet_connect_qr",
            ],
          },
          embeddedWallets: {
            ethereum: {
              createOnLogin: "all-users", // All users get embedded wallet (needed for ERC-4337 fallback)
            },
          },
          externalWallets: {
            solana: {
              connectors: solanaConnectors,
            },
          },
          defaultChain: base,
          plugins: [dataSuffix(BUILDER_CODE_SUFFIX)],
        }}
      >
        <WalletSelectionProvider>{children}</WalletSelectionProvider>
      </PrivyProvider>
    </QueryClientProvider>
  );
}
