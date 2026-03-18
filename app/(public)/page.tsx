import type { Metadata } from "next";
import { TopNav } from "@/components/tapioca/TopNav";
import { PearlField } from "@/components/tapioca/PearlMotif";
import { MobileHeader } from "@/components/home/MobileHeader";
import { HomeBottomNav } from "@/components/home/HomeBottomNav";
import { HeroSection } from "@/components/home/HeroSection";
import { ApyShowcase } from "@/components/home/ApyShowcase";
import { HowItWorks } from "@/components/home/HowItWorks";
import { CtaSection } from "@/components/home/CtaSection";
import { Footer } from "@/components/home/Footer";

export const metadata: Metadata = {
  title: "Tapioca Finance — Freshly Brewed Yield",
  description:
    "The tastiest way to grow your assets — sit back, sip, and let our AI agents brew the best yields for you.",
};

/* Pearl positions matching Stitch: small for web, different set for mobile overlay */
const pearls = [
  { size: 32, opacity: 0.2, className: "top-[10%] left-[5%]" },
  { size: 48, opacity: 0.15, className: "top-[25%] right-[8%]" },
  { size: 64, opacity: 0.1, className: "top-[60%] left-[2%]" },
  { size: 24, opacity: 0.2, className: "top-[80%] right-[15%]" },
  { size: 40, opacity: 0.05, className: "top-[40%] right-[40%]" },
];

export default function HomePage() {
  return (
    <>
      <PearlField pearls={pearls} />

      {/* Desktop nav — hidden on mobile */}
      <div className="hidden md:block">
        <TopNav />
      </div>

      {/* Mobile header — hidden on desktop */}
      <MobileHeader />

      <main className="relative z-10 pb-32 md:pb-0 overflow-x-hidden">
        <HeroSection />
        <ApyShowcase />
        <HowItWorks />
        <CtaSection />
      </main>

      {/* Footer — visible on desktop, hidden on mobile (bottom nav takes over) */}
      <div className="hidden md:block">
        <Footer />
      </div>

      {/* Mobile bottom nav */}
      <HomeBottomNav />
    </>
  );
}
