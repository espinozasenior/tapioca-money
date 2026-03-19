"use client";

import { useEffect, useState } from "react";
import { redirect } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useAuth, useWallet } from "@/hooks/useWallet";
import { usePrivy, useConnectWallet } from "@privy-io/react-auth";
import { useProcessWithdrawal } from "@/hooks/useProcessWithdrawal";
import { BottomNav } from "@/components/tapioca/BottomNav";

/**
 * Custom hook: returns true after `ms` if `active` stays true.
 * Replaces useState + useEffect for the wallet timeout pattern.
 */
function useWalletTimeout(waitingForWallet: boolean, ms: number): boolean {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!waitingForWallet) {
      setTimedOut(false);
      return;
    }
    const id = setTimeout(() => setTimedOut(true), ms);
    return () => clearTimeout(id);
  }, [waitingForWallet, ms]);

  return timedOut;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { wallet } = useWallet();
  const { user, ready, authenticated } = useAuth();
  const { getAccessToken } = usePrivy();

  useProcessWithdrawal(user?.id, wallet ?? undefined);

  const isLoggedIn = authenticated && !!wallet;
  const waitingForWallet = ready && authenticated && !wallet;
  const walletTimeout = useWalletTimeout(waitingForWallet, 5000);
  const isLoading = !ready || (waitingForWallet && !walletTimeout);

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
      syncUser({ address: walletAddress, email: user?.email });
    }
  }, [isLoggedIn, walletAddress, user?.email, syncUser]);

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-[var(--milktea)] font-[family-name:var(--font-quicksand)]">
        <div className="mx-auto max-w-md px-6 py-4 md:max-w-5xl md:px-10 md:py-8">
          {/* Header skeleton */}
          <div className="mb-4 flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="bg-[var(--pearl)]/10 h-10 w-10 animate-pulse rounded-full" />
              <div className="bg-[var(--pearl)]/10 hidden h-5 w-20 animate-pulse rounded-full md:block" />
            </div>
            <div className="flex items-center gap-3">
              <div className="bg-[var(--pearl)]/10 h-10 w-10 animate-pulse rounded-full" />
              <div className="bg-[var(--pearl)]/5 hidden h-8 w-20 animate-pulse rounded-full md:block" />
            </div>
          </div>
          {/* Desktop: two-column skeleton / Mobile: stacked */}
          <div className="mb-10 md:mb-12 md:flex md:items-end md:justify-between">
            <div className="flex flex-col items-center gap-3 md:items-start">
              <div className="bg-[var(--pearl)]/10 h-3 w-24 animate-pulse rounded-full" />
              <div className="bg-[var(--pearl)]/10 h-12 w-48 animate-pulse rounded-full md:h-14 md:w-64" />
              <div className="bg-[var(--matcha)]/20 h-6 w-36 animate-pulse rounded-full" />
            </div>
            {/* Desktop action button skeletons */}
            <div className="mt-4 hidden items-center gap-3 md:mt-0 md:flex">
              <div className="h-10 w-28 animate-pulse rounded-full bg-white/80" />
              <div className="h-10 w-24 animate-pulse rounded-full bg-white/80" />
              <div className="bg-[var(--pearl)]/10 h-10 w-32 animate-pulse rounded-full" />
            </div>
          </div>
          {/* Mobile action buttons skeleton */}
          <div className="mb-8 flex items-center justify-center gap-6 md:hidden">
            {["deposit", "send", "earn"].map((action) => (
              <div key={action} className="flex flex-col items-center gap-1.5">
                <div className="h-12 w-12 animate-pulse rounded-full bg-white/80" />
                <div className="bg-[var(--pearl)]/10 h-2 w-10 animate-pulse rounded-full" />
              </div>
            ))}
          </div>
          {/* Agent card + stats skeleton */}
          <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="bg-[var(--pearl)]/10 h-32 animate-pulse rounded-[20px] md:col-span-2 md:h-40 md:rounded-[28px]" />
            <div className="hidden h-40 animate-pulse rounded-[28px] bg-white/60 md:block" />
          </div>
          {/* Asset grid skeleton */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {["usdc", "eth", "wbtc", "tapi"].map((token) => (
              <div key={token} className="h-28 animate-pulse rounded-[20px] bg-white/60 md:h-32" />
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
    <div className="relative min-h-dvh bg-[var(--milktea)] font-[family-name:var(--font-quicksand)]">
      {/* Pearl floats — full viewport, not constrained by content max-width */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="pearl-motif absolute left-[5%] top-[15%] h-16 w-16 opacity-[0.03]" />
        <div className="pearl-motif absolute right-[5%] top-[65%] h-24 w-24 opacity-[0.04]" />
        <div className="pearl-motif absolute right-[30%] top-[40%] hidden h-20 w-20 opacity-[0.02] md:block" />
        <div className="pearl-motif absolute left-[15%] top-[85%] hidden h-12 w-12 opacity-[0.03] md:block" />
      </div>
      <div className="relative z-10 pb-32 md:pb-12">{children}</div>
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
      <div className="flex flex-col items-center gap-4 px-6 text-center">
        <div className="mb-2 flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-[var(--matcha)] opacity-60" />
          <div className="h-2 w-2 rounded-full bg-[var(--pearl)] opacity-20" />
        </div>
        <p className="text-[var(--pearl)]/70 text-sm font-medium">
          Wallet disconnected. Please reconnect to continue.
        </p>
        <div className="mt-2 flex gap-3">
          <button
            onClick={() => connectWallet()}
            className="pill-button bg-[var(--pearl)] px-6 py-2.5 text-sm text-white"
          >
            Reconnect Wallet
          </button>
          <button
            onClick={() => logout()}
            className="pill-button border-[var(--pearl)]/10 text-[var(--pearl)]/60 border bg-white px-6 py-2.5 text-sm"
          >
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
