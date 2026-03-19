"use client";

import { Bell, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useWallet";

export function BalanceHeader() {
  const { logout } = useAuth();

  return (
    <header className="nav-blur sticky top-0 z-50 flex h-20 items-center justify-between px-6 md:px-10">
      <div className="flex items-center gap-3">
        {/* Mobile: bubble cluster */}
        <div className="relative flex h-10 w-10 items-center justify-center md:hidden">
          <div className="absolute -left-1 -top-1 h-6 w-6 rounded-full bg-[var(--pearl)]" />
          <div className="absolute right-0 top-4 h-4 w-4 rounded-full bg-[var(--pearl)] opacity-80" />
          <div className="absolute bottom-0 left-2 h-3 w-3 rounded-full bg-[var(--pearl)] opacity-60" />
          <div className="absolute z-10 h-2 w-2 rounded-full bg-[var(--matcha)]" />
        </div>

        {/* Desktop: logo + wordmark */}
        <div className="hidden items-center gap-3 md:flex">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[var(--pearl)]">
            <div className="h-6 w-6 rounded-full bg-[var(--matcha)] opacity-80 blur-[1px]" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-[var(--pearl)]">Tapioca</span>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-[var(--pearl)] md:hidden">Home</h1>

        {/* Desktop: Dashboard label */}
        <span className="text-[var(--pearl)]/40 ml-4 hidden text-sm font-bold uppercase tracking-widest md:block">
          Dashboard
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* Bell */}
        <button className="ios-shadow relative flex h-10 w-10 items-center justify-center rounded-full bg-white transition-transform active:scale-95">
          <Bell className="h-5 w-5 text-[var(--pearl)] md:h-[22px] md:w-[22px]" />
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full border border-white bg-[var(--matcha)]" />
        </button>

        {/* Desktop: logout */}
        <button
          onClick={() => logout()}
          className="text-[var(--pearl)]/50 hidden items-center gap-2 rounded-full px-3 py-2 text-sm font-bold transition-colors hover:bg-white/50 hover:text-[var(--pearl)] md:flex"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </div>
    </header>
  );
}
