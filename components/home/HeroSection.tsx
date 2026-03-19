"use client";

import { m } from "framer-motion";
import { useLoginRedirect } from "@/hooks/useLoginRedirect";
import { PillButton } from "@/components/tapioca/PillButton";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.1,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 30 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 100, damping: 20 },
  },
};

export function HeroSection() {
  const handleBrewClick = useLoginRedirect();

  return (
    <section className="relative min-h-[85vh] md:min-h-[85vh] flex items-center justify-center overflow-hidden pt-12 pb-10 md:py-0">
      <m.div
        className="max-w-7xl mx-auto px-6 md:px-8 text-center flex flex-col items-center relative z-10"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Badge — matcha tint with matcha border per Stitch */}
        <m.div
          variants={item}
          className="bg-[var(--matcha)]/30 border-2 border-[var(--matcha)] text-[var(--pearl)] rounded-full px-6 py-2 text-sm font-bold inline-block mb-8"
        >
          Freshly Brewed Yield 🧋
        </m.div>

        {/* H1 — centered, "Sweet Rewards" in matcha-accent (green text on dark pill) */}
        <m.h1
          variants={item}
          className="text-5xl md:text-8xl font-extrabold leading-none text-[var(--pearl)] mb-8 max-w-4xl font-[family-name:var(--font-quicksand)]"
        >
          Simple as a Sip.
          <br />
          <span className="text-[var(--matcha)] bg-[var(--pearl)] px-4 py-1 rounded-2xl inline-block mt-2">
            Sweet Rewards.
          </span>
        </m.h1>

        {/* Subtitle */}
        <m.p
          variants={item}
          className="text-[var(--pearl)]/80 text-xl md:text-2xl font-medium max-w-[680px] leading-relaxed mb-12"
        >
          The tastiest way to grow your assets. Our playful agents find the best
          spots for your funds while you kick back and relax. No stress, just
          bubbles.
        </m.p>

        {/* CTAs — full-width stacked on mobile, inline on sm+ (per Stitch mobile) */}
        <m.div
          variants={item}
          className="flex flex-col sm:flex-row gap-4 sm:gap-6 w-full sm:w-auto px-6 sm:px-0"
        >
          <PillButton
            variant="primary"
            onClick={handleBrewClick}
            className="w-full sm:w-auto py-5 sm:py-6 rounded-3xl sm:rounded-full"
          >
            Brew My Yield
          </PillButton>
          <PillButton
            variant="secondary"
            href="#menu"
            className="w-full sm:w-auto py-5 sm:py-6 rounded-3xl sm:rounded-full bg-transparent sm:bg-white"
          >
            Check the Menu
          </PillButton>
        </m.div>
      </m.div>
    </section>
  );
}
