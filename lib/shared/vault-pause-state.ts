/**
 * Vault Pause State — shared value object (ADR-001)
 * Runtime on-chain check, not a property of any protocol's API/SDK.
 */

export interface VaultPauseState {
  address: `0x${string}`;
  paused: boolean;
  depositPaused: boolean;
  redeemPaused: boolean;
  checkedAt: number; // Date.now() when the check was performed
}

/** Create a VaultPauseState with deposit/redeem granularity */
export function createVaultPauseState(
  address: `0x${string}`,
  opts: { depositPaused: boolean; redeemPaused: boolean }
): VaultPauseState {
  return {
    address: address.toLowerCase() as `0x${string}`,
    paused: opts.depositPaused || opts.redeemPaused,
    depositPaused: opts.depositPaused,
    redeemPaused: opts.redeemPaused,
    checkedAt: Date.now(),
  };
}

/** Create a "not paused" default (used on RPC error — fail-open) */
export function createNotPausedState(address: `0x${string}`): VaultPauseState {
  return createVaultPauseState(address, { depositPaused: false, redeemPaused: false });
}

/** Check if a cached state is still fresh */
export function isPauseStateFresh(state: VaultPauseState, ttlMs: number): boolean {
  return Date.now() - state.checkedAt < ttlMs;
}
