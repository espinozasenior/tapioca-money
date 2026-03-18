"use client";

import { PillButton } from "./PillButton";
import { cn } from "@/lib/utils";

interface TopNavProps {
  onCtaClick?: () => void;
  className?: string;
}

export function TopNav({ onCtaClick, className }: TopNavProps) {
  return (
    <nav
      className={cn(
        "sticky top-0 z-50 bg-[var(--milktea)]/90 backdrop-blur-md border-b-2 border-[var(--pearl)]/5",
        className
      )}
    >
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-8">
        {/* Logo — dark circle with blurred matcha inner (per Stitch) */}
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 bg-[var(--pearl)] rounded-full flex items-center justify-center">
            <div className="w-6 h-6 bg-[var(--matcha)] rounded-full opacity-80 blur-[1px]" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-[var(--pearl)]">
            Tapioca
          </span>
        </div>

        {/* Desktop nav — not uppercase, gap-10 (per Stitch) */}
        <div className="hidden items-center gap-10 md:flex">
          <a
            href="#menu"
            className="text-sm font-bold text-[var(--pearl)] transition-colors hover:text-[var(--matcha)]"
          >
            Our Menu
          </a>
          <a
            href="#how-it-works"
            className="text-sm font-bold text-[var(--pearl)] transition-colors hover:text-[var(--matcha)]"
          >
            Daily Toppings
          </a>
          <PillButton variant="nav" onClick={onCtaClick}>
            Start Sipping
          </PillButton>
        </div>
      </div>
    </nav>
  );
}
