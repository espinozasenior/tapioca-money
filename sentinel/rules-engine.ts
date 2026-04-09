/**
 * Sentinel v0 — Rules Engine
 *
 * Evaluates collected signals against threshold triggers.
 * Implements consecutive-poll confirmation, rolling windows,
 * incident-level dedup (feedback loop prevention), and toxic
 * underlying detection.
 */

import { VAULT_EXPOSURE_MAP, THRESHOLDS } from "./config";
import { SignalHistory } from "./types";
import type { Signal, Action, ActiveIncident, SignalType } from "./types";

// ---------------------------------------------------------------------------
// Consecutive poll confirmation tracker
// ---------------------------------------------------------------------------

interface ConfirmationEntry {
  count: number;
  firstSeen: number;
}

// ---------------------------------------------------------------------------
// Rules Engine
// ---------------------------------------------------------------------------

export class RulesEngine {
  private confirmationBuffer = new Map<string, ConfirmationEntry>();

  /**
   * Evaluate signals against thresholds and produce actions.
   *
   * @param signals - Collected signals from all sources
   * @param windows - Rolling window history per vault+signalType
   * @param activeIncidents - Currently active incidents (for dedup)
   * @param allSignals - Full signal list for cross-referencing (e.g., paused check)
   */
  evaluate(
    signals: Signal[],
    windows: Map<string, SignalHistory>,
    activeIncidents: Map<string, ActiveIncident>
  ): Action[] {
    const actions: Action[] = [];

    for (const signal of signals) {
      const incidentKey = `${signal.vault.address}:${signal.type}`;

      // --- Incident dedup: skip if active incident exists ---
      // This prevents Sentinel's own exits from cascading (exits move TVL,
      // which would retrigger rules without this guard).
      if (activeIncidents.has(incidentKey)) {
        continue;
      }

      // --- Append to rolling window (numeric signals only) ---
      if (typeof signal.value === "number") {
        const windowKey = `${signal.vault.address}:${signal.type}`;
        let window = windows.get(windowKey);
        if (!window) {
          window = new SignalHistory();
          windows.set(windowKey, window);
        }
        window.append(signal.value, signal.timestamp || Date.now());
      }

      // --- Evaluate per signal type ---
      const action = this.evaluateSignal(signal, signals, windows);
      if (action) {
        actions.push(action);
      }
    }

    return actions;
  }

  private evaluateSignal(
    signal: Signal,
    allSignals: Signal[],
    windows: Map<string, SignalHistory>
  ): Action | null {
    switch (signal.type) {
      case "DEX_PRICE":
      case "ORACLE_PRICE":
        return this.evaluatePrice(signal);

      case "VAULT_FLOW":
        return this.evaluateVaultFlow(signal, windows);

      case "MAX_REDEEM":
        return this.evaluateMaxRedeem(signal, allSignals);

      case "VAULT_PAUSED":
        return this.evaluateVaultPaused(signal);

      case "SHARE_PRICE":
        return this.evaluateSharePrice(signal, windows);

      default:
        return null;
    }
  }

  // --- Price depeg evaluation ---
  private evaluatePrice(signal: Signal): Action | null {
    if (typeof signal.value !== "number") return null;

    const pegDelta = Math.abs(1.0 - signal.value);
    const incidentKey = `${signal.vault.address}:${signal.type}`;

    if (pegDelta > THRESHOLDS.DEPEG_EXIT_PCT) {
      // Require consecutive poll confirmation to reduce false positives
      const confirmed = this.confirmConsecutive(incidentKey, THRESHOLDS.CONSECUTIVE_POLLS_REQUIRED);

      if (confirmed) {
        this.clearConfirmation(incidentKey);

        // Check toxic underlying before deciding action
        if (this.isUnderlyingToxic(signal.vault.address, signal.asset)) {
          return {
            type: "ALERT",
            reason: "TOXIC_UNDERLYING_DEPEG",
            vaultAddress: signal.vault.address,
            signalType: signal.type,
            value: pegDelta,
          };
        }

        return {
          type: "EXIT",
          reason: "DEPEG",
          vaultAddress: signal.vault.address,
          protocol: signal.vault.exposure.protocol,
          signalType: signal.type,
          value: pegDelta,
        };
      }
    } else if (pegDelta > THRESHOLDS.DEPEG_WARN_PCT) {
      this.clearConfirmation(incidentKey);
      return {
        type: "ALERT",
        reason: "DEPEG_WARNING",
        vaultAddress: signal.vault.address,
        signalType: signal.type,
        value: pegDelta,
      };
    } else {
      // Price within safe range — reset confirmation counter
      this.clearConfirmation(incidentKey);
    }

    return null;
  }

  // --- TVL / vault flow evaluation ---
  private evaluateVaultFlow(signal: Signal, windows: Map<string, SignalHistory>): Action | null {
    const windowKey = `${signal.vault.address}:${signal.type}`;
    const window = windows.get(windowKey);
    if (!window) return null;

    const now = Date.now();
    const entries = window.valuesInRange(now - THRESHOLDS.TVL_WINDOW_MS, now);

    if (entries.length < 2) return null;

    const earliest = entries[0];
    const latest = entries[entries.length - 1];

    // Guard against division by zero
    if (Math.abs(earliest.value) < 1) return null;

    const dropPct = (earliest.value - latest.value) / Math.abs(earliest.value);

    if (dropPct > THRESHOLDS.TVL_DROP_EXIT_PCT) {
      const incidentKey = `${signal.vault.address}:${signal.type}`;
      const confirmed = this.confirmConsecutive(incidentKey, THRESHOLDS.CONSECUTIVE_POLLS_REQUIRED);

      if (confirmed) {
        this.clearConfirmation(incidentKey);
        return {
          type: "EXIT",
          reason: "BANK_RUN",
          vaultAddress: signal.vault.address,
          protocol: signal.vault.exposure.protocol,
          signalType: signal.type,
          value: dropPct,
        };
      }
    }

    return null;
  }

  // --- maxRedeem evaluation ---
  private evaluateMaxRedeem(signal: Signal, allSignals: Signal[]): Action | null {
    if (signal.value !== 0 && signal.value !== 0n) return null;

    // Check if vault is simply paused — paused = ALERT handled by VAULT_PAUSED case
    const pausedSignal = allSignals.find(
      (s) =>
        s.type === "VAULT_PAUSED" && s.vault.address === signal.vault.address && s.value === true
    );

    if (pausedSignal) return null; // Paused vault handled separately

    return {
      type: "EXIT",
      reason: "MAX_REDEEM_ZERO",
      vaultAddress: signal.vault.address,
      protocol: signal.vault.exposure.protocol,
      signalType: signal.type,
      value: 0,
    };
  }

  // --- Vault paused evaluation ---
  private evaluateVaultPaused(signal: Signal): Action | null {
    if (signal.value !== true) return null;

    return {
      type: "ALERT",
      reason: "VAULT_PAUSED",
      vaultAddress: signal.vault.address,
      signalType: signal.type,
      value: true,
    };
  }

  // --- Share price drop evaluation ---
  private evaluateSharePrice(signal: Signal, windows: Map<string, SignalHistory>): Action | null {
    const windowKey = `${signal.vault.address}:${signal.type}`;
    const window = windows.get(windowKey);
    if (!window) return null;

    const now = Date.now();
    const entries = window.valuesInRange(now - THRESHOLDS.SHARE_PRICE_WINDOW_MS, now);

    if (entries.length < 2) return null;

    const earliest = entries[0];
    const latest = entries[entries.length - 1];

    if (earliest.value <= 0) return null;

    const dropPct = (earliest.value - latest.value) / earliest.value;

    if (dropPct > THRESHOLDS.SHARE_PRICE_DROP_PCT) {
      const incidentKey = `${signal.vault.address}:${signal.type}`;
      const confirmed = this.confirmConsecutive(incidentKey, THRESHOLDS.CONSECUTIVE_POLLS_REQUIRED);

      if (confirmed) {
        this.clearConfirmation(incidentKey);
        return {
          type: "EXIT",
          reason: "SHARE_PRICE_DROP",
          vaultAddress: signal.vault.address,
          protocol: signal.vault.exposure.protocol,
          signalType: signal.type,
          value: dropPct,
        };
      }
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Consecutive poll confirmation
  // ---------------------------------------------------------------------------

  private confirmConsecutive(key: string, requiredCount: number): boolean {
    const entry = this.confirmationBuffer.get(key);
    if (!entry) {
      this.confirmationBuffer.set(key, { count: 1, firstSeen: Date.now() });
      return false;
    }

    entry.count += 1;
    return entry.count >= requiredCount;
  }

  private clearConfirmation(key: string): void {
    this.confirmationBuffer.delete(key);
  }

  // ---------------------------------------------------------------------------
  // Toxic underlying check
  // ---------------------------------------------------------------------------

  /**
   * Check if the vault's underlying asset IS the depegging asset.
   * If so, redeeming gives back the toxic asset (e.g., a Morpho vault whose
   * underlying is the depegging stablecoin). In v0: ALERT instead of unsafe EXIT.
   */
  isUnderlyingToxic(vaultAddress: `0x${string}`, depegAsset?: string): boolean {
    if (!depegAsset) return false;
    const exposure = VAULT_EXPOSURE_MAP[vaultAddress];
    if (!exposure) return false;
    return exposure.underlying.toLowerCase() === depegAsset.toLowerCase();
  }

  /**
   * Reset all internal state (for testing).
   */
  reset(): void {
    this.confirmationBuffer.clear();
  }
}
