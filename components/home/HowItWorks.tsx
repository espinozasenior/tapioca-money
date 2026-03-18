"use client";

import { motion } from "framer-motion";
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
    description:
      "Deposit your tokens into our magic shaker. We take it from there.",
  },
  {
    icon: Zap,
    title: "2. Shake & Brew",
    description:
      "Our bots mix and match the best opportunities 24/7 for peak freshness.",
  },
  {
    icon: Sparkles,
    title: "3. Enjoy!",
    description:
      "Watch your straw get bigger as the rewards compound automatically.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-32 relative bg-white">
      {/* Scattered pearl motifs (per Stitch) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="pearl-motif w-6 h-6 top-10 left-[20%] opacity-40 absolute" />
        <div className="pearl-motif w-10 h-10 top-40 left-[15%] opacity-60 absolute" />
        <div className="pearl-motif w-4 h-4 top-80 left-[22%] opacity-30 absolute" />
        <div className="pearl-motif w-8 h-8 top-20 right-[20%] opacity-50 absolute" />
        <div className="pearl-motif w-12 h-12 top-60 right-[18%] opacity-70 absolute" />
      </div>

      <div className="max-w-5xl mx-auto px-8 relative z-10">
        {/* Header with subtitle (per Stitch) */}
        <div className="text-center mb-24">
          <h2 className="text-5xl font-black text-[var(--pearl)] mb-6">
            How it Works
          </h2>
          <p className="text-[var(--pearl)]/60 text-xl font-medium">
            As easy as ordering your favorite drink.
          </p>
        </div>

        {/* Desktop: 3-column grid / Mobile: vertical cards */}
        <motion.div
          className="hidden md:grid md:grid-cols-3 gap-12"
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
        >
          {steps.map((step) => (
            <motion.div
              key={step.title}
              variants={item}
              className="text-center group"
            >
              <div className="w-24 h-24 bg-[var(--milktea)] rounded-[40%] flex items-center justify-center mx-auto mb-8 border-4 border-[var(--pearl)] group-hover:bg-[var(--matcha)] transition-colors">
                <step.icon
                  size={36}
                  strokeWidth={2.5}
                  className="text-[var(--pearl)]"
                />
              </div>
              <h4 className="text-2xl font-extrabold text-[var(--pearl)] mb-4">
                {step.title}
              </h4>
              <p className="text-[var(--pearl)]/70 leading-relaxed font-medium">
                {step.description}
              </p>
            </motion.div>
          ))}
        </motion.div>

        {/* Mobile: horizontal card layout (per Stitch mobile) */}
        <div className="md:hidden space-y-6">
          {steps.map((step) => (
            <div
              key={step.title}
              className="bg-white/40 border-2 border-white p-6 rounded-[32px] flex items-center gap-5"
            >
              <div className="w-16 h-16 shrink-0 bg-[var(--matcha)] rounded-full flex items-center justify-center border-4 border-[var(--pearl)]">
                <step.icon size={24} strokeWidth={2.5} className="text-[var(--pearl)]" />
              </div>
              <div>
                <h4 className="font-bold text-xl text-[var(--pearl)] mb-1">
                  {step.title}
                </h4>
                <p className="text-sm text-[var(--pearl)]/60 font-medium leading-tight">
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
