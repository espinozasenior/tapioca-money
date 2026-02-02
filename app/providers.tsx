"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { base } from "viem/chains";

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

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <PrivyProvider
        appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
        config={{
          loginMethods: ['email', 'google'],
          appearance: {
            theme: 'light',
            accentColor: '#676FFF',
          },
          embeddedWallets: {
            ethereum: {
              createOnLogin: 'all-users', // Force embedded wallet creation for all users
            },
          },
          defaultChain: base,
        }}
      >
        {children}
      </PrivyProvider>
    </QueryClientProvider>
  );
}
