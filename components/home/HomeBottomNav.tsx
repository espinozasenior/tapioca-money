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
      <div className="bg-[var(--pearl)]/95 backdrop-blur-xl border border-white/10 rounded-[32px] p-2 flex justify-between items-center ios-shadow">
        {navItems.map(({ icon: Icon, label, active }) => (
          <button
            key={label}
            className={`flex flex-col items-center justify-center w-16 py-1 ${
              active ? "text-[var(--matcha)]" : "text-white/50"
            }`}
          >
            <Icon className="w-6 h-6" strokeWidth={active ? 2.5 : 2} />
            <span className="text-[10px] font-bold mt-1 uppercase">
              {label}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
