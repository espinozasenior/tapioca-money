/**
 * Vault Pause Checker — shared port interface (ADR-001)
 * Each protocol implements this to translate its pause mechanism
 * into the shared VaultPauseState value object.
 */

import type { VaultPauseState } from "./vault-pause-state";

export interface VaultPauseChecker {
  checkPauseStates(addresses: `0x${string}`[]): Promise<VaultPauseState[]>;
}
