"use client";

import { Shield, Droplets } from "lucide-react";
import { useLoginRedirect } from "@/hooks/useLoginRedirect";

const features = [
  { icon: Shield, title: "Safe & Vetted", offset: false },
  { icon: Droplets, title: "Pure Liquidity", offset: true },
];

export function CtaSection() {
  const handleClick = useLoginRedirect();

  return (
    <section className="mb-12 px-6 py-8 md:mb-0 md:px-0 md:py-32">
      {/* Desktop: full CTA section with two columns */}
      <div className="mx-auto hidden max-w-7xl px-8 md:block">
        <div className="relative flex flex-col items-center gap-16 overflow-hidden rounded-[60px] bg-[var(--pearl)] p-12 text-[var(--milktea)] md:flex-row md:p-24">
          {/* Matcha glow orb */}
          <div className="pointer-events-none absolute -bottom-20 -right-20 h-80 w-80 rounded-full bg-[var(--matcha)] opacity-10 blur-3xl" />

          <div className="relative z-10 flex-1 text-left">
            <h2 className="mb-8 text-5xl font-black leading-tight md:text-6xl">
              Ready for a
              <br />
              <span className="text-[var(--matcha)]">Fresh Brew?</span>
            </h2>
            <p className="text-[var(--milktea)]/70 mb-12 text-xl font-medium">
              Join thousands of others sipping on the best yields in DeFi. No bitter aftertaste,
              just pure growth.
            </p>
            <button
              onClick={handleClick}
              className="pill-button rounded-full bg-[var(--matcha)] px-16 py-6 text-2xl font-black text-[var(--pearl)] shadow-xl transition-all hover:scale-105"
            >
              Get Started Now
            </button>
          </div>

          {/* Feature cards with offset */}
          <div className="relative z-10 grid w-full flex-1 grid-cols-2 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className={`rounded-[40px] border border-white/10 bg-white/10 p-8 text-center ${
                  feature.offset ? "mt-8" : ""
                }`}
              >
                <feature.icon
                  size={48}
                  strokeWidth={1.5}
                  className="mx-auto mb-4 text-[var(--matcha)]"
                />
                <p className="font-bold">{feature.title}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile: simpler centered CTA (per Stitch mobile) */}
      <div className="md:hidden">
        <div className="relative overflow-hidden rounded-[45px] bg-[var(--pearl)] p-10 text-center">
          <div className="bg-[var(--matcha)]/10 pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full blur-3xl" />
          <h2 className="relative z-10 mb-4 text-3xl font-black text-white">
            Ready for a
            <br />
            <span className="text-[var(--matcha)]">Fresh Brew?</span>
          </h2>
          <p className="relative z-10 mb-8 text-sm font-medium text-white/60">
            Join thousands of others sipping on the best yields in DeFi.
          </p>
          <button
            onClick={handleClick}
            className="pill-button relative z-10 block w-full rounded-full bg-[var(--matcha)] py-5 text-xl font-black text-[var(--pearl)] shadow-lg transition-transform active:scale-95"
          >
            Get Started Now
          </button>
        </div>
      </div>
    </section>
  );
}
