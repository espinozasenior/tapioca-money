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
    <nav className="fixed bottom-8 left-6 right-6 z-[100] max-w-md mx-auto px-4 pointer-events-none">
      <div className="bg-[var(--pearl)]/95 backdrop-blur-xl border border-white/10 rounded-full p-2 flex justify-between items-center shadow-2xl pointer-events-auto">
        {navItems.map(({ icon: Icon, label, href }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center justify-center flex-1 py-1 transition-colors",
                isActive
                  ? "text-[var(--matcha)]"
                  : "text-white/40"
              )}
            >
              <Icon className="w-6 h-6" strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-bold mt-1 uppercase tracking-tighter">
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
