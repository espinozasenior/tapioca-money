/**
 * YO Protocol Risk Scoring
 * Simple scoring model for YO vaults
 */

import type { YoVault } from "./types";

export function calculateYoRiskScore(vault: YoVault): number {
  let score = 0;

  // Base score: YO vaults are audited multi-asset vaults — low base risk
  score += 0.1;

  // TVL risk: smaller vaults are less proven
  if (vault.tvlUsd < 100_000) {
    score += 0.1;
  }

  return Math.min(score, 1.0);
}
