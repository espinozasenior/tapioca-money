import { cn } from "@/lib/utils";

const bars = [
  { id: "b1", height: "40%", color: "bg-[var(--pearl)]/10" },
  { id: "b2", height: "60%", color: "bg-[var(--matcha)]/40" },
  { id: "b3", height: "50%", color: "bg-[var(--pearl)]/20" },
  { id: "b4", height: "80%", color: "bg-[var(--matcha)]/60" },
  { id: "b5", height: "100%", color: "bg-[var(--pearl)]", active: true },
  { id: "b6", height: "75%", color: "bg-[var(--matcha)]/40" },
  { id: "b7", height: "45%", color: "bg-[var(--pearl)]/10" },
];

interface BarChartProps {
  className?: string;
}

export function BarChart({ className }: BarChartProps) {
  return (
    <div className={cn("h-32 flex items-end justify-center gap-4 overflow-hidden", className)}>
      {bars.map((bar) => (
        <div
          key={bar.id}
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
