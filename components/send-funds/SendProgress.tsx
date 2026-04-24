import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SendPhase } from "@/hooks/useWallet";
import { shortenAddress } from "@/utils/shortenAddress";

interface SendProgressProps {
  phase: Exclude<SendPhase, "success" | "error">;
  userOpHash?: string;
}

const PHASE_COPY: Record<SendProgressProps["phase"], { title: string; subtitle: string; pct: number }> = {
  submitting: {
    title: "Submitting…",
    subtitle: "Sending your request",
    pct: 25,
  },
  signing_session: {
    title: "Setting up…",
    subtitle: "One-time approval to enable sending",
    pct: 40,
  },
  registering: {
    title: "Setting up…",
    subtitle: "Saving your send settings",
    pct: 60,
  },
  confirming: {
    title: "Confirming on Base…",
    subtitle: "Waiting for the transaction to land",
    pct: 85,
  },
};

export function SendProgress({ phase, userOpHash }: SendProgressProps) {
  const { title, subtitle, pct } = PHASE_COPY[phase];

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
      <Loader2 className="mb-4 h-10 w-10 animate-spin text-blue-600" />
      <h3 className="mb-1 text-lg font-semibold text-gray-900">{title}</h3>
      <p className="text-muted-foreground text-sm">{subtitle}</p>

      <div className="mt-6 w-full max-w-xs">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className={cn(
              "bg-primary h-full rounded-full transition-all duration-500 ease-out"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {userOpHash && phase === "confirming" && (
        <p className="text-muted-foreground mt-4 font-mono text-xs">
          userOp {shortenAddress(userOpHash)}
        </p>
      )}
    </div>
  );
}
