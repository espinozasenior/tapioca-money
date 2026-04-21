import { DOCS_LINKS, AUTOMATA_URL } from "@/lib/constants/links";

/**
 * Minimal legal links row. Shown inside authenticated layouts where there
 * is no marketing footer. Stays above mobile BottomNav via sufficient
 * bottom padding on the parent container.
 */
export function LegalFooter() {
  return (
    <footer className="mx-auto mt-16 max-w-5xl px-6 pb-4 md:mt-20 md:pb-0">
      <div className="text-[var(--pearl)]/40 flex flex-wrap items-center justify-center gap-6 text-[10px] font-bold uppercase tracking-[0.2em]">
        <a
          href={DOCS_LINKS.home}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-[var(--matcha)]"
        >
          Recipe Book
        </a>
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
      <div className="text-[var(--pearl)]/30 mt-3 text-center text-[10px] font-bold uppercase tracking-[0.3em]">
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
    </footer>
  );
}
