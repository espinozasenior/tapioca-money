"use client";

import { Login } from "@/components/Login";
import { MainScreen } from "@/components/MainScreen";
import { useAuth, useWallet } from "@/hooks/useWallet";
import { useConnectWallet } from "@privy-io/react-auth";
import { useProcessWithdrawal } from "@/hooks/useProcessWithdrawal";
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";

export function HomeContent() {
  const { wallet, isReady: walletReady, isSolanaWallet } = useWallet();
  const { status, isReady: authReady, user, ready, authenticated } = useAuth();

  useProcessWithdrawal(user?.id, wallet ?? undefined);

  const walletAddress = wallet?.address;
  // Allow login with any wallet type (EVM or Solana)
  const isLoggedIn = authenticated && !!wallet;

  // Timeout: stop waiting for wallet after 5s to avoid infinite spinner.
  // After refresh, Privy reports authenticated=true before useWallets() rehydrates.
  // If the wallet never arrives (extension slow, WalletConnect reconnect failure),
  // fall through to the login screen so the user can reconnect.
  const [walletTimeout, setWalletTimeout] = useState(false);
  useEffect(() => {
    if (!ready || !authenticated || wallet) {
      setWalletTimeout(false);
      return;
    }
    const timer = setTimeout(() => setWalletTimeout(true), 5000);
    return () => clearTimeout(timer);
  }, [ready, authenticated, wallet]);

  // Show loading if Privy SDK isn't ready OR if authenticated but wallet not loaded yet
  const isLoading = !ready || (authenticated && ready && !wallet && !walletTimeout);

  // Debug logging (only when state changes)
  useEffect(() => {
    console.log("[Home] State:", {
      ready,
      authenticated,
      walletReady,
      authReady,
      status,
      hasWallet: !!wallet,
      isLoggedIn,
      isLoading,
    });
  }, [ready, authenticated, walletReady, authReady, status, wallet, isLoggedIn, isLoading]);

  const { mutate: syncUser } = useMutation({
    mutationFn: async (data: { address: string; email?: string }) => {
      await fetch("/api/agent/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    onError: (err) => console.error("Failed to sync user to Postgres:", err),
  });

  // Sync user with Postgres on login
  useEffect(() => {
    if (isLoggedIn && walletAddress) {
      syncUser({
        address: walletAddress,
        email: user?.email,
      });
    }
  }, [isLoggedIn, walletAddress, user?.email, syncUser]);

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

  // Authenticated but wallet didn't connect (external wallet extension slow, page refresh).
  // Show a reconnect prompt instead of the Login screen — Login would show "Opening login..."
  // as a dead end since Privy won't re-trigger login() for already-authenticated users.
  if (authenticated && !wallet) {
    return <WalletReconnect />;
  }

  if (!isLoggedIn) {
    return <Login />;
  }

  return <MainScreen walletAddress={walletAddress} />;
}

/**
 * Shown when user is authenticated but wallet didn't reconnect after page refresh.
 * Offers reconnect (opens Privy wallet connector) or logout.
 */
function WalletReconnect() {
  const { connectWallet } = useConnectWallet();
  const { logout } = useAuth();

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-gray-600">Wallet disconnected. Please reconnect to continue.</p>
        <div className="flex gap-3">
          <button
            onClick={() => connectWallet()}
            className="bg-primary rounded-lg px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Reconnect Wallet
          </button>
          <button
            onClick={() => logout()}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
