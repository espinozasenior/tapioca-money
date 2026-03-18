"use client";

import { useEffect, useState } from "react";
import { redirect } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useAuth, useWallet } from "@/hooks/useWallet";
import { usePrivy, useConnectWallet } from "@privy-io/react-auth";
import { useProcessWithdrawal } from "@/hooks/useProcessWithdrawal";
import { BottomNav } from "@/components/tapioca/BottomNav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { wallet, isReady: walletReady } = useWallet();
  const { status, isReady: authReady, user, ready, authenticated } = useAuth();
  const { getAccessToken } = usePrivy();

  useProcessWithdrawal(user?.id, wallet ?? undefined);

  const isLoggedIn = authenticated && !!wallet;

  // Timeout: stop waiting for wallet after 5s to avoid infinite spinner.
  const [walletTimeout, setWalletTimeout] = useState(false);
  useEffect(() => {
    if (!ready || !authenticated || wallet) {
      setWalletTimeout(false);
      return;
    }
    const timer = setTimeout(() => setWalletTimeout(true), 5000);
    return () => clearTimeout(timer);
  }, [ready, authenticated, wallet]);

  const isLoading = !ready || (authenticated && ready && !wallet && !walletTimeout);

  // Sync user with Postgres on login
  const { mutate: syncUser } = useMutation({
    mutationFn: async (data: { address: string; email?: string }) => {
      const token = await getAccessToken();
      await fetch("/api/agent/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(data),
      });
    },
    onError: (err) => console.error("Failed to sync user to Postgres:", err),
  });

  const walletAddress = wallet?.address;

  useEffect(() => {
    if (isLoggedIn && walletAddress) {
      syncUser({
        address: walletAddress,
        email: user?.email,
      });
    }
  }, [isLoggedIn, walletAddress, user?.email, syncUser]);

  // Debug logging
  useEffect(() => {
    console.log("[Dashboard] State:", {
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

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-[var(--milktea)] font-[family-name:var(--font-quicksand)]">
        <div className="max-w-md md:max-w-5xl mx-auto px-6 md:px-10 py-4 md:py-8">
          {/* Header skeleton */}
          <div className="flex items-center justify-between py-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--pearl)]/10 animate-pulse" />
              <div className="w-20 h-5 rounded-full bg-[var(--pearl)]/10 animate-pulse hidden md:block" />
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--pearl)]/10 animate-pulse" />
              <div className="w-20 h-8 rounded-full bg-[var(--pearl)]/5 animate-pulse hidden md:block" />
            </div>
          </div>
          {/* Desktop: two-column skeleton / Mobile: stacked */}
          <div className="md:flex md:items-end md:justify-between mb-10 md:mb-12">
            <div className="flex flex-col items-center md:items-start gap-3">
              <div className="w-24 h-3 rounded-full bg-[var(--pearl)]/10 animate-pulse" />
              <div className="w-48 md:w-64 h-12 md:h-14 rounded-full bg-[var(--pearl)]/10 animate-pulse" />
              <div className="w-36 h-6 rounded-full bg-[var(--matcha)]/20 animate-pulse" />
            </div>
            {/* Desktop action button skeletons */}
            <div className="hidden md:flex items-center gap-3 mt-4 md:mt-0">
              <div className="w-28 h-10 rounded-full bg-white/80 animate-pulse" />
              <div className="w-24 h-10 rounded-full bg-white/80 animate-pulse" />
              <div className="w-32 h-10 rounded-full bg-[var(--pearl)]/10 animate-pulse" />
            </div>
          </div>
          {/* Mobile action buttons skeleton */}
          <div className="flex items-center justify-center gap-6 mb-8 md:hidden">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div className="w-12 h-12 rounded-full bg-white/80 animate-pulse" />
                <div className="w-10 h-2 rounded-full bg-[var(--pearl)]/10 animate-pulse" />
              </div>
            ))}
          </div>
          {/* Agent card + stats skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="md:col-span-2 rounded-[20px] md:rounded-[28px] bg-[var(--pearl)]/10 h-32 md:h-40 animate-pulse" />
            <div className="hidden md:block rounded-[28px] bg-white/60 h-40 animate-pulse" />
          </div>
          {/* Asset grid skeleton */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-[20px] bg-white/60 h-28 md:h-32 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Authenticated but wallet didn't reconnect
  if (authenticated && !wallet) {
    return <WalletReconnect />;
  }

  // Not authenticated — redirect to landing
  if (!isLoggedIn) {
    redirect("/");
  }

  return (
    <div className="min-h-dvh bg-[var(--milktea)] font-[family-name:var(--font-quicksand)]">
      <div className="pb-32 md:pb-12">{children}</div>
      {/* BottomNav — mobile only */}
      <div className="md:hidden">
        <BottomNav />
      </div>
    </div>
  );
}

function WalletReconnect() {
  const { connectWallet } = useConnectWallet();
  const { logout } = useAuth();

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-[var(--milktea)] font-[family-name:var(--font-quicksand)]">
      <div className="flex flex-col items-center gap-4 text-center px-6">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-3 h-3 rounded-full bg-[var(--matcha)] opacity-60" />
          <div className="w-2 h-2 rounded-full bg-[var(--pearl)] opacity-20" />
        </div>
        <p className="text-sm font-medium text-[var(--pearl)]/70">
          Wallet disconnected. Please reconnect to continue.
        </p>
        <div className="flex gap-3 mt-2">
          <button
            onClick={() => connectWallet()}
            className="pill-button bg-[var(--pearl)] text-white px-6 py-2.5 text-sm"
          >
            Reconnect Wallet
          </button>
          <button
            onClick={() => logout()}
            className="pill-button border border-[var(--pearl)]/10 bg-white text-[var(--pearl)]/60 px-6 py-2.5 text-sm"
          >
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
