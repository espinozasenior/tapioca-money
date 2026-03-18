import { TrendingUp } from "lucide-react";

interface BalanceDisplayProps {
  balance: string;
}

export function BalanceDisplay({ balance }: BalanceDisplayProps) {
  return (
    <section className="text-center md:text-left mb-10">
      <p className="text-[var(--pearl)]/40 font-bold text-xs uppercase tracking-[0.2em] mb-2">
        Total Balance
      </p>
      <h2 className="text-5xl md:text-6xl font-black text-[var(--pearl)] tracking-tight mb-3">
        ${balance}
      </h2>
      {/* Weekly gain badge */}
      <div className="flex items-center justify-center md:justify-start gap-1.5 text-[var(--pearl)] bg-[var(--matcha)] px-4 py-1.5 rounded-full w-fit mx-auto md:mx-0 font-bold text-xs">
        <TrendingUp className="w-3.5 h-3.5" />
        +$127.43 this week
      </div>
    </section>
  );
}
