export function Footer() {
  return (
    <footer className="relative z-10 py-20 border-t-4 border-[var(--pearl)]/5">
      <div className="max-w-7xl mx-auto px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-10">
          {/* Left — Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[var(--pearl)] rounded-full flex items-center justify-center">
              <div className="w-4 h-4 bg-[var(--matcha)] rounded-full" />
            </div>
            <span className="font-black text-2xl text-[var(--pearl)]">
              Tapioca
            </span>
          </div>

          {/* Center — Links (future pages, use buttons until routes exist) */}
          <div className="flex flex-wrap justify-center gap-10 text-[var(--pearl)]/60 text-sm font-bold uppercase tracking-widest">
            <button className="hover:text-[var(--matcha)] transition-colors">
              Flavor Guide
            </button>
            <button className="hover:text-[var(--matcha)] transition-colors">
              Lab Tests
            </button>
            <button className="hover:text-[var(--matcha)] transition-colors">
              Recipe Book
            </button>
          </div>

          {/* Right — Social icon in dark circle (per Stitch) */}
          <div className="flex gap-4">
            <a
              href="https://x.com/tapiocamoney"
              target="_blank"
              rel="noopener noreferrer"
              className="w-12 h-12 flex items-center justify-center rounded-full bg-[var(--pearl)] text-[var(--matcha)] hover:scale-110 transition-all"
              aria-label="Follow us on X"
            >
              <svg
                className="w-5 h-5 fill-current"
                viewBox="0 0 24 24"
              >
                <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.84 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
              </svg>
            </a>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-20 text-center text-[var(--pearl)]/30 text-xs font-black tracking-[0.4em] uppercase">
          &copy; 2026 TAPIOCA FINANCE &bull; BREWED WITH LOVE
        </div>
      </div>
    </footer>
  );
}
