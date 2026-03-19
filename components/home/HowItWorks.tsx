"use client";

import { m } from "framer-motion";
import { ShoppingBag, Zap, Sparkles } from "lucide-react";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
      delayChildren: 0.1,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 40 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 100, damping: 20 },
  },
};

const steps = [
  {
    icon: ShoppingBag,
    title: "1. Place Order",
    description: "Deposit your tokens into our magic shaker. We take it from there.",
  },
  {
    icon: Zap,
    title: "2. Shake & Brew",
    description: "Our bots mix and match the best opportunities 24/7 for peak freshness.",
  },
  {
    icon: Sparkles,
    title: "3. Enjoy!",
    description: "Watch your straw get bigger as the rewards compound automatically.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative bg-white py-32">
      {/* Scattered pearl motifs (per Stitch) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="pearl-motif absolute left-[20%] top-10 h-6 w-6 opacity-40" />
        <div className="pearl-motif absolute left-[15%] top-40 h-10 w-10 opacity-60" />
        <div className="pearl-motif absolute left-[22%] top-80 h-4 w-4 opacity-30" />
        <div className="pearl-motif absolute right-[20%] top-20 h-8 w-8 opacity-50" />
        <div className="pearl-motif absolute right-[18%] top-60 h-12 w-12 opacity-70" />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl px-8">
        {/* Header with subtitle (per Stitch) */}
        <div className="mb-24 text-center">
          <h2 className="mb-6 text-5xl font-black text-[var(--pearl)]">How it Works</h2>
          <p className="text-[var(--pearl)]/60 text-xl font-medium">
            As easy as ordering your favorite drink.
          </p>
        </div>

        {/* Desktop: 3-column grid / Mobile: vertical cards */}
        <m.div
          className="hidden gap-12 md:grid md:grid-cols-3"
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
        >
          {steps.map((step) => (
            <m.div key={step.title} variants={item} className="group text-center">
              <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-[40%] border-4 border-[var(--pearl)] bg-[var(--milktea)] transition-colors group-hover:bg-[var(--matcha)]">
                <step.icon size={36} strokeWidth={2.5} className="text-[var(--pearl)]" />
              </div>
              <h4 className="mb-4 text-2xl font-extrabold text-[var(--pearl)]">{step.title}</h4>
              <p className="text-[var(--pearl)]/70 font-medium leading-relaxed">
                {step.description}
              </p>
            </m.div>
          ))}
        </m.div>

        {/* Mobile: horizontal card layout (per Stitch mobile) */}
        <div className="space-y-6 md:hidden">
          {steps.map((step) => (
            <div
              key={step.title}
              className="flex items-center gap-5 rounded-[32px] border-2 border-white bg-white/40 p-6"
            >
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-[var(--pearl)] bg-[var(--matcha)]">
                <step.icon size={24} strokeWidth={2.5} className="text-[var(--pearl)]" />
              </div>
              <div>
                <h4 className="mb-1 text-xl font-bold text-[var(--pearl)]">{step.title}</h4>
                <p className="text-[var(--pearl)]/60 text-sm font-medium leading-tight">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
