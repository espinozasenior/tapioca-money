import type { ReactNode } from "react";
import { MotionProvider } from "@/components/tapioca/MotionProvider";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <MotionProvider>
      <div className="min-h-screen bg-[var(--milktea)] font-[family-name:var(--font-quicksand)]">
        {children}
      </div>
    </MotionProvider>
  );
}
