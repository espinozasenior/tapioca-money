import { HomeContent } from "@/app/home";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tapioca Money",
  description: "Autonomous gains, total control.",
};

export default function Home() {
  return (
    <div className="flex h-screen flex-col py-3 sm:py-6 2xl:py-16">
      <main className="flex flex-1 flex-col items-center sm:items-start">
        <HomeContent />
      </main>
    </div>
  );
}
