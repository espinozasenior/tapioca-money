import { cn } from "@/lib/utils";

interface BubbleLogoProps {
  size?: "sm" | "md";
  className?: string;
}

export function BubbleLogo({ size = "md", className }: BubbleLogoProps) {
  const outer = size === "sm" ? "w-8 h-8" : "w-10 h-10";
  const inner = size === "sm" ? "w-3 h-3" : "w-4 h-4";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn(
          "relative flex items-center justify-center rounded-full bg-[var(--pearl)]",
          outer
        )}
      >
        <div className={cn("rounded-full bg-[var(--matcha)]", inner)} />
      </div>
      <span className="font-[var(--font-quicksand)] text-lg font-black tracking-tight text-[var(--pearl)]">
        Tapioca
      </span>
    </div>
  );
}
