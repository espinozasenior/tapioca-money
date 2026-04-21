"use client";

import { useState, useCallback, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { m, AnimatePresence } from "framer-motion";
import { useLoginRedirect } from "@/hooks/useLoginRedirect";
import { DOCS_LINKS, AUTOMATA_URL } from "@/lib/constants/links";

const navLinks = [
  { label: "Our Menu", href: "#menu" },
  { label: "Daily Toppings", href: "#how-it-works" },
];

const legalLinks = [
  { label: "Recipe Book", href: DOCS_LINKS.home },
  { label: "Terms", href: DOCS_LINKS.terms },
  { label: "Privacy", href: DOCS_LINKS.privacy },
];

export function MobileHeader() {
  const [open, setOpen] = useState(false);
  const loginRedirect = useLoginRedirect();

  const close = useCallback(() => setOpen(false), []);

  const handleStartSipping = () => {
    close();
    loginRedirect();
  };

  // Lock body scroll when menu is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header
        className={`sticky top-0 flex h-16 items-center justify-between px-6 transition-colors duration-200 md:hidden ${
          open
            ? "z-[60] border-b border-transparent bg-transparent"
            : "nav-blur border-[var(--pearl)]/5 z-50 border-b"
        }`}
      >
        {/* Logo — hidden when menu is open (dark-on-dark wouldn't read) */}
        <div
          className={`flex items-center gap-2 transition-opacity duration-200 ${
            open ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--pearl)]">
            <div className="h-5 w-5 rounded-full bg-[var(--matcha)] opacity-90 blur-[0.5px]" />
          </div>
          <span className="text-xl font-bold tracking-tight text-[var(--pearl)]">Tapioca</span>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 items-center justify-center"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          <AnimatePresence mode="wait" initial={false}>
            {open ? (
              <m.span
                key="close"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <X className="h-7 w-7 text-[var(--milktea)]" />
              </m.span>
            ) : (
              <m.span
                key="menu"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Menu className="h-7 w-7 text-[var(--pearl)]" />
              </m.span>
            )}
          </AnimatePresence>
        </button>
      </header>

      {/* Full-screen mobile menu overlay */}
      <AnimatePresence>
        {open && (
          <m.div
            className="fixed inset-0 z-[55] flex flex-col md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Backdrop */}
            <m.div
              className="absolute inset-0 bg-[var(--pearl)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={close}
            />

            {/* Menu content */}
            <m.nav
              className="relative z-10 flex flex-1 flex-col items-center justify-center px-8"
              initial="hidden"
              animate="show"
              exit="hidden"
              variants={{
                hidden: { opacity: 0 },
                show: {
                  opacity: 1,
                  transition: { staggerChildren: 0.06, delayChildren: 0.1 },
                },
              }}
            >
              {navLinks.map((link) => (
                <m.a
                  key={link.label}
                  href={link.href}
                  onClick={close}
                  className="py-4 text-3xl font-black text-[var(--milktea)] transition-colors hover:text-[var(--matcha)] active:text-[var(--matcha)]"
                  variants={{
                    hidden: { opacity: 0, y: 20 },
                    show: {
                      opacity: 1,
                      y: 0,
                      transition: {
                        type: "spring",
                        stiffness: 200,
                        damping: 20,
                      },
                    },
                  }}
                >
                  {link.label}
                </m.a>
              ))}

              {/* CTA */}
              <m.button
                onClick={handleStartSipping}
                className="mt-10 w-full rounded-full bg-[var(--matcha)] py-5 text-center text-xl font-black text-[var(--pearl)] shadow-lg transition-transform active:scale-95"
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  show: {
                    opacity: 1,
                    y: 0,
                    transition: {
                      type: "spring",
                      stiffness: 200,
                      damping: 20,
                    },
                  },
                }}
              >
                Start Sipping
              </m.button>
            </m.nav>

            {/* Legal strip — pinned near bottom of overlay */}
            <m.div
              className="relative z-10 flex flex-col items-center gap-3 pb-10 pt-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: 0.3 } }}
              exit={{ opacity: 0 }}
            >
              <div className="text-[var(--milktea)]/40 flex flex-wrap justify-center gap-6 text-xs font-bold uppercase tracking-[0.2em]">
                {legalLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={close}
                    className="transition-colors hover:text-[var(--matcha)] active:text-[var(--matcha)]"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
              <div className="text-[var(--milktea)]/30 text-[10px] font-bold uppercase tracking-[0.3em]">
                Powered by{" "}
                <a
                  href={AUTOMATA_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={close}
                  className="transition-colors hover:text-[var(--matcha)]"
                >
                  Automata AI
                </a>
              </div>
            </m.div>

            {/* Decorative matcha glow */}
            <div className="pointer-events-none absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-[var(--matcha)] opacity-10 blur-3xl" />
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
