"use client";

import { LoginButton } from "@/components/login";
import { MainScreen } from "@/components/main-screen";
import { useAuth, useWallet } from "@crossmint/client-sdk-react-ui";

export function HomeContent() {
  const { wallet, status: walletStatus } = useWallet();
  const { status, status: authStatus } = useAuth();

  const walletAddress = wallet?.address;
  const isLoggedIn = wallet != null && status === "logged-in";
  const isLoading = walletStatus === "in-progress" || authStatus === "initializing";

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#0D42E4] border-t-transparent" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return <LoginButton />;
  }

  return <MainScreen walletAddress={walletAddress} />;
}
