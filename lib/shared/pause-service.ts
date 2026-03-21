/**
 * Pause Service — application layer (ADR-001)
 * Aggregates protocol-specific pause checkers with an in-memory TTL cache.
 * Fail-open: if a checker throws, affected vaults are assumed not-paused.
 */

import type { VaultPauseChecker } from "./vault-pause-checker";
import type { VaultPauseState } from "./vault-pause-state";
import { createNotPausedState, isPauseStateFresh } from "./vault-pause-state";

interface PauseServiceOptions {
  ttlMs: number; // Cache TTL in milliseconds (default 60_000)
}

interface VaultQuery {
  address: `0x${string}`;
  protocol: string;
}

export class PauseService {
  private checkers: VaultPauseChecker[];
  private cache = new Map<string, VaultPauseState>();
  private ttlMs: number;

  constructor(checkers: VaultPauseChecker[], opts?: PauseServiceOptions) {
    this.checkers = checkers;
    this.ttlMs = opts?.ttlMs ?? 60_000;
  }

  async checkVaultPauseStates(vaults: VaultQuery[]): Promise<Map<string, VaultPauseState>> {
    const result = new Map<string, VaultPauseState>();
    if (vaults.length === 0) return result;

    // Separate cached vs uncached
    const uncached: `0x${string}`[] = [];
    for (const v of vaults) {
      const key = v.address.toLowerCase();
      const cached = this.cache.get(key);
      if (cached && isPauseStateFresh(cached, this.ttlMs)) {
        result.set(key as `0x${string}`, cached);
      } else {
        uncached.push(v.address);
      }
    }

    if (uncached.length === 0) return result;

    // Fan out to all checkers in parallel, merge results
    const settled = await Promise.allSettled(
      this.checkers.map((c) => c.checkPauseStates(uncached))
    );

    for (const outcome of settled) {
      if (outcome.status === "fulfilled") {
        for (const state of outcome.value) {
          const key = state.address.toLowerCase();
          this.cache.set(key, state);
          result.set(key as `0x${string}`, state);
        }
      } else {
        // Fail-open: checker threw, fill in not-paused defaults
        console.warn("[PauseService] Checker failed, assuming not-paused:", outcome.reason);
        for (const addr of uncached) {
          const key = addr.toLowerCase();
          if (!result.has(key as `0x${string}`)) {
            const fallback = createNotPausedState(addr);
            this.cache.set(key, fallback);
            result.set(key as `0x${string}`, fallback);
          }
        }
      }
    }

    // Ensure all uncached addresses have an entry (in case no checker returned them)
    for (const addr of uncached) {
      const key = addr.toLowerCase();
      if (!result.has(key as `0x${string}`)) {
        const fallback = createNotPausedState(addr);
        result.set(key as `0x${string}`, fallback);
      }
    }

    return result;
  }
}
