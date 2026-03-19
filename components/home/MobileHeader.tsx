"use client";

import { useState, useCallback, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { m, AnimatePresence } from "framer-motion";
import { useLoginRedirect } from "@/hooks/useLoginRedirect";

const navLinks = [
  { label: "Our Menu", href: "#menu" },
  { label: "Daily Toppings", href: "#how-it-works" },
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
        className={`sticky top-0 px-6 h-16 flex items-center justify-between md:hidden transition-colors duration-200 ${
          open
            ? "z-[60] bg-transparent border-b border-transparent"
            : "z-50 nav-blur border-b border-[var(--pearl)]/5"
        }`}
      >
        {/* Logo — hidden when menu is open (dark-on-dark wouldn't read) */}
        <div
          className={`flex items-center gap-2 transition-opacity duration-200 ${
            open ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
        >
          <div className="w-8 h-8 bg-[var(--pearl)] rounded-full flex items-center justify-center">
            <div className="w-5 h-5 bg-[var(--matcha)] rounded-full opacity-90 blur-[0.5px]" />
          </div>
          <span className="text-xl font-bold tracking-tight text-[var(--pearl)]">
            Tapioca
          </span>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-10 h-10 flex items-center justify-center"
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
                <X className="w-7 h-7 text-[var(--milktea)]" />
              </m.span>
            ) : (
              <m.span
                key="menu"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Menu className="w-7 h-7 text-[var(--pearl)]" />
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
              className="relative z-10 flex flex-col justify-center items-center flex-1 px-8"
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
                  className="text-3xl font-black text-[var(--milktea)] py-4 transition-colors hover:text-[var(--matcha)] active:text-[var(--matcha)]"
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
                className="mt-10 bg-[var(--matcha)] text-[var(--pearl)] w-full py-5 rounded-full font-black text-xl text-center shadow-lg active:scale-95 transition-transform"
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

            {/* Decorative matcha glow */}
            <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-[var(--matcha)] opacity-10 rounded-full blur-3xl pointer-events-none" />
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
