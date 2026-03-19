"use client";

import { cn } from "@/lib/utils";
import { Wallet, Coffee, Bell, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { icon: Wallet, label: "Balance", href: "/dashboard" },
  { icon: Coffee, label: "Brewing", href: "/dashboard/brewing" },
  { icon: Bell, label: "Alerts", href: "/dashboard/alerts" },
  { icon: User, label: "Profile", href: "/dashboard/profile" },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="pointer-events-none fixed bottom-8 left-6 right-6 z-[100] mx-auto max-w-md px-4">
      <div className="bg-[var(--pearl)]/95 pointer-events-auto flex items-center justify-between rounded-full border border-white/10 p-2 shadow-2xl backdrop-blur-xl">
        {navItems.map(({ icon: Icon, label, href }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center py-1 transition-colors",
                isActive ? "text-[var(--matcha)]" : "text-white/40"
              )}
            >
              <Icon className="h-6 w-6" strokeWidth={isActive ? 2.5 : 2} />
              <span className="mt-1 text-[10px] font-bold uppercase tracking-tighter">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
