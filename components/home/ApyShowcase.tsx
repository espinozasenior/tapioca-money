import { BarChart } from "@/components/tapioca/BarChart";

export function ApyShowcase() {
  return (
    <section id="menu" className="relative px-6 py-8 md:px-8 md:py-24">
      <div className="mx-auto max-w-[800px]">
        {/* Mobile: solid white + ios-shadow / Desktop: glassmorphic bubbly-card */}
        <div className="ios-shadow relative overflow-hidden rounded-[40px] bg-white p-8 text-center md:border-4 md:border-[var(--creamy)] md:bg-white/60 md:p-20 md:backdrop-blur-sm">
          {/* Pearl motifs inside card (per Stitch web — hidden on mobile) */}
          <div className="pearl-motif absolute -right-10 -top-10 hidden h-20 w-20 md:block" />
          <div className="pearl-motif absolute -bottom-4 left-20 hidden h-12 w-12 md:block" />
          {/* Mobile pearl (per Stitch mobile) */}
          <div className="pearl-motif absolute -right-6 -top-6 h-16 w-16 opacity-5 md:hidden" />

          {/* Caption — smaller on mobile */}
          <p className="text-[var(--pearl)]/40 md:text-[var(--pearl)]/60 mb-4 text-xs font-bold uppercase tracking-widest md:text-lg md:tracking-[0.2em]">
            Current Sweetness
            <span className="hidden md:inline"> Level</span>
          </p>

          {/* APY display — 12.5% on mobile, 5.5% on desktop (matching respective Stitch files) */}
          <div className="flex flex-col items-center">
            {/* Mobile APY */}
            <h2 className="mb-4 text-6xl font-black text-[var(--pearl)] md:hidden">
              12.5%{" "}
              <span className="rounded-md bg-[var(--pearl)] px-2 py-0.5 align-top text-xl text-[var(--matcha)]">
                APR
              </span>
            </h2>
            {/* Desktop APY */}
            <h3 className="mb-8 hidden text-8xl font-black leading-none text-[var(--pearl)] md:block md:text-9xl">
              5.5%{" "}
              <span className="rounded-lg bg-[var(--pearl)] px-3 py-1 align-top text-4xl text-[var(--matcha)]">
                APR
              </span>
            </h3>
          </div>

          {/* 30+ Yield Pools badge */}
          <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--pearl)] bg-[var(--matcha)] px-4 py-1.5 text-sm font-extrabold text-[var(--pearl)] md:gap-3 md:px-8 md:py-3 md:text-lg md:font-bold">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="md:h-5 md:w-5"
            >
              <circle cx="7.5" cy="11.5" r="4.5" />
              <circle cx="16.5" cy="11.5" r="4.5" />
              <circle cx="12" cy="5" r="4" />
            </svg>
            30+ Yield Pools
          </div>

          {/* Bar chart — shorter on mobile */}
          <div className="mt-10 flex justify-center md:mt-16">
            <BarChart className="h-20 md:h-32" />
          </div>
        </div>
      </div>
    </section>
  );
}
