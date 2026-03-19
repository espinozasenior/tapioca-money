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
    <section className="relative flex min-h-[85vh] items-center justify-center overflow-hidden pb-10 pt-12 md:min-h-[85vh] md:py-0">
      <m.div
        className="relative z-10 mx-auto flex max-w-7xl flex-col items-center px-6 text-center md:px-8"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Badge — matcha tint with matcha border per Stitch */}
        <m.div
          variants={item}
          className="bg-[var(--matcha)]/30 mb-8 inline-block rounded-full border-2 border-[var(--matcha)] px-6 py-2 text-sm font-bold text-[var(--pearl)]"
        >
          Freshly Brewed Yield 🧋
        </m.div>

        {/* H1 — centered, "Sweet Rewards" in matcha-accent (green text on dark pill) */}
        <m.h1
          variants={item}
          className="mb-8 max-w-4xl font-[family-name:var(--font-quicksand)] text-5xl font-extrabold leading-none text-[var(--pearl)] md:text-8xl"
        >
          Simple as a Sip.
          <br />
          <span className="mt-2 inline-block rounded-2xl bg-[var(--pearl)] px-4 py-1 text-[var(--matcha)]">
            Sweet Rewards.
          </span>
        </m.h1>

        {/* Subtitle */}
        <m.p
          variants={item}
          className="text-[var(--pearl)]/80 mb-12 max-w-[680px] text-xl font-medium leading-relaxed md:text-2xl"
        >
          The tastiest way to grow your assets. Our playful agents find the best spots for your
          funds while you kick back and relax. No stress, just bubbles.
        </m.p>

        {/* CTAs — full-width stacked on mobile, inline on sm+ (per Stitch mobile) */}
        <m.div
          variants={item}
          className="flex w-full flex-col gap-4 px-6 sm:w-auto sm:flex-row sm:gap-6 sm:px-0"
        >
          <PillButton
            variant="primary"
            onClick={handleBrewClick}
            className="w-full rounded-3xl py-5 sm:w-auto sm:rounded-full sm:py-6"
          >
            Brew My Yield
          </PillButton>
          <PillButton
            variant="secondary"
            href="#menu"
            className="w-full rounded-3xl bg-transparent py-5 sm:w-auto sm:rounded-full sm:bg-white sm:py-6"
          >
            Check the Menu
          </PillButton>
        </m.div>
      </m.div>
    </section>
  );
}
