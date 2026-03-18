import { cn } from "@/lib/utils";

const bars = [
  { height: "40%", color: "bg-[var(--pearl)]/10" },
  { height: "60%", color: "bg-[var(--matcha)]/40" },
  { height: "50%", color: "bg-[var(--pearl)]/20" },
  { height: "80%", color: "bg-[var(--matcha)]/60" },
  { height: "100%", color: "bg-[var(--pearl)]", active: true },
  { height: "75%", color: "bg-[var(--matcha)]/40" },
  { height: "45%", color: "bg-[var(--pearl)]/10" },
];

interface BarChartProps {
  className?: string;
}

export function BarChart({ className }: BarChartProps) {
  return (
    <div className={cn("h-32 flex items-end justify-center gap-4 overflow-hidden", className)}>
      {bars.map((bar, i) => (
        <div
          key={i}
          className={cn(
            "w-8 rounded-full",
            bar.color,
            bar.active && "flex flex-col items-center pt-2"
          )}
          style={{ height: bar.height }}
        >
          {bar.active && (
            <div className="w-4 h-4 bg-[var(--matcha)] rounded-full animate-bounce" />
          )}
        </div>
      ))}
    </div>
  );
}
