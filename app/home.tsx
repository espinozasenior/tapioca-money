"use client";

import { Login } from "@/components/Login";
import { MainScreen } from "@/components/MainScreen";
import { useAuth, useWallet } from "@crossmint/client-sdk-react-ui";
import { useEffect } from "react";

export function HomeContent() {
  const { wallet, status: walletStatus, getOrCreateWallet } = useWallet();
  const { status, status: authStatus } = useAuth();

  const walletAddress = wallet?.address;
  const isLoggedIn = wallet != null && status === "logged-in";
  const isLoading = walletStatus === "in-progress" || authStatus === "initializing";

  useEffect(() => {
    if (walletStatus === "loading-error") {
      getOrCreateWallet({
        type: "evm-smart-wallet",
        args: {
          chain: "base-sepolia",
        },
      });
    }
  }, [walletStatus]);

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Login />;
  }

  return <MainScreen walletAddress={walletAddress} />;
}
