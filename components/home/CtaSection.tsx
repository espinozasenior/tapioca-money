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
    <section className="py-8 md:py-32 px-6 md:px-0 mb-12 md:mb-0">
      {/* Desktop: full CTA section with two columns */}
      <div className="hidden md:block max-w-7xl mx-auto px-8">
        <div className="bg-[var(--pearl)] text-[var(--milktea)] rounded-[60px] p-12 md:p-24 flex flex-col md:flex-row items-center gap-16 relative overflow-hidden">
          {/* Matcha glow orb */}
          <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-[var(--matcha)] opacity-10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex-1 text-left relative z-10">
            <h2 className="text-5xl md:text-6xl font-black mb-8 leading-tight">
              Ready for a
              <br />
              <span className="text-[var(--matcha)]">Fresh Brew?</span>
            </h2>
            <p className="text-[var(--milktea)]/70 text-xl mb-12 font-medium">
              Join thousands of others sipping on the best yields in DeFi. No
              bitter aftertaste, just pure growth.
            </p>
            <button
              onClick={handleClick}
              className="pill-button bg-[var(--matcha)] text-[var(--pearl)] px-16 py-6 rounded-full font-black text-2xl shadow-xl hover:scale-105 transition-all"
            >
              Get Started Now
            </button>
          </div>

          {/* Feature cards with offset */}
          <div className="flex-1 grid grid-cols-2 gap-6 w-full relative z-10">
            {features.map((feature) => (
              <div
                key={feature.title}
                className={`bg-white/10 p-8 rounded-[40px] text-center border border-white/10 ${
                  feature.offset ? "mt-8" : ""
                }`}
              >
                <feature.icon
                  size={48}
                  strokeWidth={1.5}
                  className="text-[var(--matcha)] mb-4 mx-auto"
                />
                <p className="font-bold">{feature.title}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile: simpler centered CTA (per Stitch mobile) */}
      <div className="md:hidden">
        <div className="bg-[var(--pearl)] rounded-[45px] p-10 text-center relative overflow-hidden">
          <div className="absolute -top-10 -left-10 w-40 h-40 bg-[var(--matcha)]/10 rounded-full blur-3xl pointer-events-none" />
          <h2 className="text-3xl font-black text-white mb-4 relative z-10">
            Ready for a
            <br />
            <span className="text-[var(--matcha)]">Fresh Brew?</span>
          </h2>
          <p className="text-white/60 text-sm mb-8 font-medium relative z-10">
            Join thousands of others sipping on the best yields in DeFi.
          </p>
          <button
            onClick={handleClick}
            className="pill-button block bg-[var(--matcha)] text-[var(--pearl)] w-full py-5 rounded-full font-black text-xl shadow-lg active:scale-95 transition-transform relative z-10"
          >
            Get Started Now
          </button>
        </div>
      </div>
    </section>
  );
}
