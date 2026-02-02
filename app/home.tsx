"use client";

import { Login } from "@/components/Login";
import { MainScreen } from "@/components/MainScreen";
import { useAuth, useWallet } from "@/hooks/useWallet";
import { useProcessWithdrawal } from "@/hooks/useProcessWithdrawal";
import { useEffect } from "react";

export function HomeContent() {
  const { wallet, isReady: walletReady } = useWallet();
  const { status, isReady: authReady, user, ready, authenticated } = useAuth();

  useProcessWithdrawal(user?.id, wallet ?? undefined);

  const walletAddress = wallet?.address;
  const isLoggedIn = authenticated && !!wallet;

  // Show loading if Privy SDK isn't ready OR if authenticated but wallet not loaded yet
  const isLoading = !ready || (authenticated && ready && !wallet);

  // Debug logging (only when state changes)
  useEffect(() => {
    console.log('[Home] State:', {
      ready,
      authenticated,
      walletReady,
      authReady,
      status,
      hasWallet: !!wallet,
      isLoggedIn,
      isLoading
    });
  }, [ready, authenticated, walletReady, authReady, status, wallet, isLoggedIn, isLoading]);

  // Sync user with Postgres on login
  useEffect(() => {
    if (isLoggedIn && walletAddress) {
      fetch("/api/agent/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: walletAddress,
          email: user?.email
        }),
      }).catch(err => console.error("Failed to sync user to Postgres:", err));
    }
  }, [isLoggedIn, walletAddress, user?.email]);

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
          <p className="text-sm text-gray-600">Loading wallet...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Login />;
  }

  return <MainScreen walletAddress={walletAddress} />;
}
