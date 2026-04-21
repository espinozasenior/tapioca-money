"use client";

import { useLoginRedirect } from "@/hooks/useLoginRedirect";
import { PillButton } from "./PillButton";
import { cn } from "@/lib/utils";
import { DOCS_LINKS } from "@/lib/constants/links";

interface TopNavProps {
  className?: string;
}

export function TopNav({ className }: TopNavProps) {
  const handleClick = useLoginRedirect();

  return (
    <nav
      className={cn(
        "bg-[var(--milktea)]/90 border-[var(--pearl)]/5 sticky top-0 z-50 border-b-2 backdrop-blur-md",
        className
      )}
    >
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-8">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[var(--pearl)]">
            <div className="h-6 w-6 rounded-full bg-[var(--matcha)] opacity-80 blur-[1px]" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-[var(--pearl)]">Tapioca</span>
        </div>

        {/* Desktop nav */}
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
          <a
            href={DOCS_LINKS.home}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-bold text-[var(--pearl)] transition-colors hover:text-[var(--matcha)]"
          >
            Recipe Book
          </a>
          <PillButton variant="nav" onClick={handleClick}>
            Start Sipping
          </PillButton>
        </div>
      </div>
    </nav>
  );
}
