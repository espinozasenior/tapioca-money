import { DOCS_LINKS, AUTOMATA_URL } from "@/lib/constants/links";

export function Footer() {
  return (
    <footer className="border-[var(--pearl)]/5 relative z-10 border-t-4 py-20">
      <div className="mx-auto max-w-7xl px-8">
        <div className="flex flex-col items-center justify-between gap-10 md:flex-row">
          {/* Left — Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--pearl)]">
              <div className="h-4 w-4 rounded-full bg-[var(--matcha)]" />
            </div>
            <span className="text-2xl font-black text-[var(--pearl)]">Tapioca</span>
          </div>

          {/* Center — Primary footer links (mix of future pages + live docs) */}
          <div className="text-[var(--pearl)]/60 flex flex-wrap justify-center gap-10 text-sm font-bold uppercase tracking-widest">
            <button className="transition-colors hover:text-[var(--matcha)]">Flavor Guide</button>
            <button className="transition-colors hover:text-[var(--matcha)]">Lab Tests</button>
            <a
              href={DOCS_LINKS.home}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-[var(--matcha)]"
            >
              Recipe Book
            </a>
          </div>

          {/* Right — Social icon in dark circle (per Stitch) */}
          <div className="flex gap-4">
            <a
              href="https://x.com/tapiocamoney"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--pearl)] text-[var(--matcha)] transition-all hover:scale-110"
              aria-label="Follow us on X"
            >
              <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.84 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
              </svg>
            </a>
          </div>
        </div>

        {/* Legal links — smaller, above copyright */}
        <div className="text-[var(--pearl)]/40 mt-16 flex flex-wrap justify-center gap-8 text-xs font-bold uppercase tracking-[0.2em]">
          <a
            href={DOCS_LINKS.terms}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-[var(--matcha)]"
          >
            Terms
          </a>
          <a
            href={DOCS_LINKS.privacy}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-[var(--matcha)]"
          >
            Privacy
          </a>
        </div>

        {/* Powered by Automata AI */}
        <div className="text-[var(--pearl)]/40 mt-6 text-center text-[10px] font-bold uppercase tracking-[0.3em]">
          Powered by{" "}
          <a
            href={AUTOMATA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-[var(--matcha)]"
          >
            Automata AI
          </a>
        </div>

        {/* Copyright */}
        <div className="text-[var(--pearl)]/30 mt-3 text-center text-xs font-black uppercase tracking-[0.4em]">
          &copy; 2026 TAPIOCA FINANCE &bull; BREWED WITH LOVE
        </div>
      </div>
    </footer>
  );
}
