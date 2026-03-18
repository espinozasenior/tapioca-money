import { cn } from "@/lib/utils";

interface PearlMotifProps {
  size: number;
  opacity?: number;
  className?: string;
}

export function PearlMotif({ size, opacity = 0.15, className }: PearlMotifProps) {
  return (
    <div
      className={cn("pearl-motif absolute", className)}
      style={{
        width: size,
        height: size,
        opacity,
      }}
      aria-hidden
    />
  );
}

interface PearlFieldProps {
  pearls: Array<{ size: number; opacity: number; className: string }>;
}

export function PearlField({ pearls }: PearlFieldProps) {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      {pearls.map((pearl, i) => (
        <PearlMotif key={i} {...pearl} />
      ))}
    </div>
  );
}
