"use client";

import { Login } from "@/components/Login";
import { MainScreen } from "@/components/MainScreen";
import { EVMSmartWallet, useAuth, useWallet } from "@crossmint/client-sdk-react-ui";
import { useEffect } from "react";
import { useProcessWithdrawal } from "@/hooks/useProcessWithdrawal";

export function HomeContent() {
  const { wallet, status: walletStatus, getOrCreateWallet } = useWallet();
  const { status, status: authStatus, user } = useAuth();

  useProcessWithdrawal(user?.id, wallet as EVMSmartWallet);

  const walletAddress = wallet?.address;
  const isLoggedIn = wallet != null && status === "logged-in";
  const isLoading = walletStatus === "in-progress" || authStatus === "initializing";

  useEffect(() => {
    if (walletStatus === "loading-error") {
      getOrCreateWallet({
        type: "evm-smart-wallet",
        args: {
          chain: process.env.NEXT_PUBLIC_CHAIN_ID as any,
        },
      });
    }
  }, [walletStatus]);

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Login />;
  }

  return <MainScreen walletAddress={walletAddress} />;
}
