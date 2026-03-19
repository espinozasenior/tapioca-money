"use client";

import { Bell, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useWallet";

export function BalanceHeader() {
  const { logout } = useAuth();

  return (
    <header className="sticky top-0 z-50 nav-blur px-6 md:px-10 h-20 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {/* Mobile: bubble cluster */}
        <div className="relative flex items-center justify-center w-10 h-10 md:hidden">
          <div className="absolute rounded-full bg-[var(--pearl)] w-6 h-6 -top-1 -left-1" />
          <div className="absolute rounded-full bg-[var(--pearl)] w-4 h-4 top-4 right-0 opacity-80" />
          <div className="absolute rounded-full bg-[var(--pearl)] w-3 h-3 bottom-0 left-2 opacity-60" />
          <div className="w-2 h-2 bg-[var(--matcha)] rounded-full absolute z-10" />
        </div>

        {/* Desktop: logo + wordmark */}
        <div className="hidden md:flex items-center gap-3">
          <div className="relative w-10 h-10 bg-[var(--pearl)] rounded-full flex items-center justify-center">
            <div className="w-6 h-6 bg-[var(--matcha)] rounded-full opacity-80 blur-[1px]" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-[var(--pearl)]">
            Tapioca
          </span>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-[var(--pearl)] md:hidden">
          Home
        </h1>

        {/* Desktop: Dashboard label */}
        <span className="hidden md:block text-sm font-bold text-[var(--pearl)]/40 uppercase tracking-widest ml-4">
          Dashboard
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* Bell */}
        <button className="w-10 h-10 flex items-center justify-center relative bg-white rounded-full ios-shadow active:scale-95 transition-transform">
          <Bell className="w-5 h-5 md:w-[22px] md:h-[22px] text-[var(--pearl)]" />
          <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-[var(--matcha)] border border-white" />
        </button>

        {/* Desktop: logout */}
        <button
          onClick={() => logout()}
          className="hidden md:flex items-center gap-2 text-sm font-bold text-[var(--pearl)]/50 hover:text-[var(--pearl)] transition-colors px-3 py-2 rounded-full hover:bg-white/50"
        >
          <LogOut className="w-4 h-4" />
          Log out
        </button>
      </div>
    </header>
  );
}
