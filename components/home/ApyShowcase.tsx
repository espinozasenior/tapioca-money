import { BarChart } from "@/components/tapioca/BarChart";

export function ApyShowcase() {
  return (
    <section id="menu" className="py-8 md:py-24 px-6 md:px-8 relative">
      <div className="max-w-[800px] mx-auto">
        {/* Mobile: solid white + ios-shadow / Desktop: glassmorphic bubbly-card */}
        <div className="bg-white md:bg-white/60 md:backdrop-blur-sm md:border-4 md:border-[var(--creamy)] rounded-[40px] p-8 md:p-20 text-center relative overflow-hidden ios-shadow">
          {/* Pearl motifs inside card (per Stitch web — hidden on mobile) */}
          <div className="pearl-motif w-20 h-20 -top-10 -right-10 absolute hidden md:block" />
          <div className="pearl-motif w-12 h-12 -bottom-4 left-20 absolute hidden md:block" />
          {/* Mobile pearl (per Stitch mobile) */}
          <div className="pearl-motif w-16 h-16 -top-6 -right-6 opacity-5 absolute md:hidden" />

          {/* Caption — smaller on mobile */}
          <p className="text-[var(--pearl)]/40 md:text-[var(--pearl)]/60 font-bold text-xs md:text-lg mb-4 uppercase tracking-widest md:tracking-[0.2em]">
            Current Sweetness
            <span className="hidden md:inline"> Level</span>
          </p>

          {/* APY display — 12.5% on mobile, 5.5% on desktop (matching respective Stitch files) */}
          <div className="flex flex-col items-center">
            {/* Mobile APY */}
            <h2 className="md:hidden text-6xl font-black text-[var(--pearl)] mb-4">
              12.5%{" "}
              <span className="text-xl align-top bg-[var(--pearl)] text-[var(--matcha)] px-2 py-0.5 rounded-md">
                APR
              </span>
            </h2>
            {/* Desktop APY */}
            <h3 className="hidden md:block text-8xl md:text-9xl font-black text-[var(--pearl)] leading-none mb-8">
              5.5%{" "}
              <span className="text-4xl align-top text-[var(--matcha)] bg-[var(--pearl)] px-3 py-1 rounded-lg">
                APR
              </span>
            </h3>
          </div>

          {/* 30+ Yield Pools badge */}
          <div className="inline-flex items-center gap-1.5 md:gap-3 bg-[var(--matcha)] text-[var(--pearl)] px-4 md:px-8 py-1.5 md:py-3 rounded-full text-sm md:text-lg font-extrabold md:font-bold border-2 border-[var(--pearl)]">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="md:w-5 md:h-5"
            >
              <circle cx="7.5" cy="11.5" r="4.5" />
              <circle cx="16.5" cy="11.5" r="4.5" />
              <circle cx="12" cy="5" r="4" />
            </svg>
            30+ Yield Pools
          </div>

          {/* Bar chart — shorter on mobile */}
          <div className="mt-10 md:mt-16 flex justify-center">
            <BarChart className="h-20 md:h-32" />
          </div>
        </div>
      </div>
    </section>
  );
}
