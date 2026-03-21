/**
 * YO Protocol Pause Checker (ADR-001)
 * Reads on-chain paused() from YO vault contracts.
 * YO vaults use binary pause (deposits+redeems paused together).
 */

import type { VaultPauseChecker } from "@/lib/shared/vault-pause-checker";
import type { VaultPauseState } from "@/lib/shared/vault-pause-state";
import { createVaultPauseState, createNotPausedState } from "@/lib/shared/vault-pause-state";
import { baseClient } from "@/lib/shared/rpc-client";

const PAUSED_ABI = [
  {
    inputs: [],
    name: "paused",
    outputs: [{ type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export class YoPauseChecker implements VaultPauseChecker {
  async checkPauseStates(addresses: `0x${string}`[]): Promise<VaultPauseState[]> {
    if (addresses.length === 0) return [];

    const results = await Promise.allSettled(
      addresses.map((addr) =>
        baseClient.readContract({
          address: addr,
          abi: PAUSED_ABI,
          functionName: "paused",
        })
      )
    );

    return results.map((r, i) => {
      if (r.status === "fulfilled") {
        const paused = r.value as boolean;
        return createVaultPauseState(addresses[i], {
          depositPaused: paused,
          redeemPaused: paused,
        });
      }
      // Fail-open: RPC error or missing function → assume not paused
      return createNotPausedState(addresses[i]);
    });
  }
}
