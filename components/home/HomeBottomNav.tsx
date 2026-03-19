"use client";

import { UtensilsCrossed, Coffee, Bell, User } from "lucide-react";

const navItems = [
  { icon: UtensilsCrossed, label: "Menu", active: true },
  { icon: Coffee, label: "Brewing", active: false },
  { icon: Bell, label: "Alerts", active: false },
  { icon: User, label: "Profile", active: false },
] as const;

export function HomeBottomNav() {
  return (
    <nav className="fixed bottom-8 left-6 right-6 z-[100] md:hidden">
      <div className="bg-[var(--pearl)]/95 ios-shadow flex items-center justify-between rounded-[32px] border border-white/10 p-2 backdrop-blur-xl">
        {navItems.map(({ icon: Icon, label, active }) => (
          <button
            key={label}
            className={`flex w-16 flex-col items-center justify-center py-1 ${
              active ? "text-[var(--matcha)]" : "text-white/50"
            }`}
          >
            <Icon className="h-6 w-6" strokeWidth={active ? 2.5 : 2} />
            <span className="mt-1 text-[10px] font-bold uppercase">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
