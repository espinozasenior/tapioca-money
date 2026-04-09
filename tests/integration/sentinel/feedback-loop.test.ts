import { describe, it, expect, beforeEach } from "vitest";
import { RulesEngine } from "@/sentinel/rules-engine";
import { SignalHistory } from "@/sentinel/types";
import type { Signal, ActiveIncident, VaultConfig } from "@/sentinel/types";

// Test #27: Feedback loop suppression

describe("Integration: Feedback Loop Prevention", () => {
  const vault: VaultConfig = {
    address: "0xVault" as `0x${string}`,
    exposure: { protocol: "morpho", underlying: "USDC", dexPools: [] },
  };

  it("sentinel-exits-trigger-tvl-change-incident-dedup-suppresses-retrigger", () => {
    const engine = new RulesEngine();
    const windows = new Map<string, SignalHistory>();
    const incidents = new Map<string, ActiveIncident>();

    // Pre-seed window with baseline TVL
    const windowKey = `${vault.address}:VAULT_FLOW`;
    const history = new SignalHistory();
    history.append(10_000_000, Date.now() - 25 * 60 * 1000);
    windows.set(windowKey, history);

    // Poll 1: TVL dropped 20% (sentinel exits caused this)
    const signal1: Signal = {
      type: "VAULT_FLOW",
      vault,
      value: 8_000_000,
      timestamp: Date.now(),
      source: "ponder",
    };
    engine.evaluate([signal1], windows, incidents);
    // First consecutive poll -- no action yet

    // Poll 2: Still dropped
    const signal2: Signal = {
      type: "VAULT_FLOW",
      vault,
      value: 7_800_000,
      timestamp: Date.now(),
      source: "ponder",
    };
    const actions = engine.evaluate([signal2], windows, incidents);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("EXIT");
    expect(actions[0].reason).toBe("BANK_RUN");

    // Simulate: set active incident (as the worker would after executing exits)
    incidents.set(`${vault.address}:VAULT_FLOW`, {
      vaultAddress: vault.address,
      signalType: "VAULT_FLOW",
      reason: "BANK_RUN",
      createdAt: Date.now(),
    });

    // Poll 3: TVL dropped further (because sentinel's own exits reduced TVL)
    const signal3: Signal = {
      type: "VAULT_FLOW",
      vault,
      value: 5_000_000, // 50% total drop
      timestamp: Date.now(),
      source: "ponder",
    };
    const actions3 = engine.evaluate([signal3], windows, incidents);

    // CRITICAL: Should be suppressed by active incident dedup
    expect(actions3).toHaveLength(0);
  });
});
