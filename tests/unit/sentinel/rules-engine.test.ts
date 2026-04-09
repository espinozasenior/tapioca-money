import { describe, it, expect, beforeEach } from "vitest";
import { RulesEngine } from "@/sentinel/rules-engine";
import { SignalHistory } from "@/sentinel/types";
import type { Signal, ActiveIncident, VaultConfig } from "@/sentinel/types";

// Test helper: create a vault config
function makeVault(
  address: `0x${string}` = "0x1234567890123456789012345678901234567890",
  protocol: "morpho" | "yo" = "morpho",
  underlying = "USR"
): VaultConfig {
  return {
    address,
    exposure: {
      protocol,
      underlying,
      dexPools: [],
    },
  };
}

// Test helper: create a price signal
function makePriceSignal(
  vault: VaultConfig,
  price: number,
  type: "DEX_PRICE" | "ORACLE_PRICE" = "DEX_PRICE",
  asset?: string
): Signal {
  return {
    type,
    vault,
    asset: asset || vault.exposure.underlying,
    value: price,
    timestamp: Date.now(),
    source: "ponder",
  };
}

describe("RulesEngine", () => {
  let engine: RulesEngine;
  let windows: Map<string, SignalHistory>;
  let incidents: Map<string, ActiveIncident>;
  const vault = makeVault();

  beforeEach(() => {
    engine = new RulesEngine();
    windows = new Map();
    incidents = new Map();
  });

  // Test #1
  it("depeg-3pct-two-consecutive-polls-triggers-exit", () => {
    // First poll: depeg > 3%, should NOT trigger (requires confirmation)
    const signal1 = makePriceSignal(vault, 0.96);
    const actions1 = engine.evaluate([signal1], windows, incidents);
    expect(actions1).toHaveLength(0);

    // Second poll: depeg still > 3%, should trigger EXIT
    const signal2 = makePriceSignal(vault, 0.95);
    const actions2 = engine.evaluate([signal2], windows, incidents);
    expect(actions2).toHaveLength(1);
    expect(actions2[0].type).toBe("EXIT");
    expect(actions2[0].reason).toBe("DEPEG");
    expect(actions2[0].vaultAddress).toBe(vault.address);
  });

  // Test #2
  it("depeg-single-poll-does-not-trigger", () => {
    const signal = makePriceSignal(vault, 0.96);
    const actions = engine.evaluate([signal], windows, incidents);
    expect(actions).toHaveLength(0); // First poll, no action
  });

  // Test #3
  it("tvl-drop-15pct-rolling-window-triggers-exit", () => {
    const flowVault = makeVault();
    const windowKey = `${flowVault.address}:VAULT_FLOW`;

    // Seed rolling window with baseline value
    const history = new SignalHistory();
    history.append(1_000_000, Date.now() - 20 * 60 * 1000); // 20 min ago: 1M TVL
    windows.set(windowKey, history);

    // First poll: 15%+ drop
    const signal1: Signal = {
      type: "VAULT_FLOW",
      vault: flowVault,
      value: 800_000, // 20% drop
      timestamp: Date.now(),
      source: "ponder",
    };
    const actions1 = engine.evaluate([signal1], windows, incidents);
    expect(actions1).toHaveLength(0); // First consecutive poll

    // Second poll: still dropped
    const signal2: Signal = {
      type: "VAULT_FLOW",
      vault: flowVault,
      value: 790_000,
      timestamp: Date.now(),
      source: "ponder",
    };
    const actions2 = engine.evaluate([signal2], windows, incidents);
    expect(actions2).toHaveLength(1);
    expect(actions2[0].type).toBe("EXIT");
    expect(actions2[0].reason).toBe("BANK_RUN");
  });

  // Test #4
  it("max-redeem-zero-triggers-exit", () => {
    const signal: Signal = {
      type: "MAX_REDEEM",
      vault,
      value: 0,
      timestamp: Date.now(),
      source: "rpc",
    };

    // No paused signal present
    const actions = engine.evaluate([signal], windows, incidents);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("EXIT");
    expect(actions[0].reason).toBe("MAX_REDEEM_ZERO");
  });

  // Test #5
  it("vault-paused-triggers-alert-not-exit", () => {
    const signal: Signal = {
      type: "VAULT_PAUSED",
      vault,
      value: true,
      timestamp: Date.now(),
      source: "rpc",
    };

    const actions = engine.evaluate([signal], windows, incidents);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("ALERT");
    expect(actions[0].reason).toBe("VAULT_PAUSED");
  });

  // Test #6
  it("share-price-drop-2pct-triggers-exit", () => {
    const shareVault = makeVault();
    const windowKey = `${shareVault.address}:SHARE_PRICE`;

    // Seed rolling window
    const history = new SignalHistory();
    history.append(1.0, Date.now() - 10 * 60 * 1000); // 10 min ago: price 1.0
    windows.set(windowKey, history);

    // First poll: 3% drop
    const signal1: Signal = {
      type: "SHARE_PRICE",
      vault: shareVault,
      value: 0.97,
      timestamp: Date.now(),
      source: "rpc",
    };
    engine.evaluate([signal1], windows, incidents); // First consecutive

    // Second poll
    const signal2: Signal = {
      type: "SHARE_PRICE",
      vault: shareVault,
      value: 0.96,
      timestamp: Date.now(),
      source: "rpc",
    };
    const actions = engine.evaluate([signal2], windows, incidents);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("EXIT");
    expect(actions[0].reason).toBe("SHARE_PRICE_DROP");
  });

  // Test #7
  it("incident-dedup-suppresses-retrigger", () => {
    // Simulate active incident
    incidents.set(`${vault.address}:DEX_PRICE`, {
      vaultAddress: vault.address,
      signalType: "DEX_PRICE",
      reason: "DEPEG",
      createdAt: Date.now(),
    });

    // Signal that would normally trigger after 2 polls
    const signal = makePriceSignal(vault, 0.9); // 10% depeg
    const actions = engine.evaluate([signal], windows, incidents);

    // Should be suppressed by active incident
    expect(actions).toHaveLength(0);
  });

  // Test #8
  it("rpc-timeout-fails-open", () => {
    // One valid signal + one missing (simulating RPC failure = no signal)
    const validSignal: Signal = {
      type: "VAULT_PAUSED",
      vault,
      value: false,
      timestamp: Date.now(),
      source: "rpc",
    };

    // Only the valid signal is passed (failed RPC produces no signal)
    const actions = engine.evaluate([validSignal], windows, incidents);

    // Should not produce spurious actions
    expect(actions).toHaveLength(0);
  });
});

describe("RulesEngine.isUnderlyingToxic", () => {
  it("returns true when vault underlying matches depeg asset", () => {
    const engine = new RulesEngine();
    // The vault at this address has underlying=USR in VAULT_EXPOSURE_MAP
    const result = engine.isUnderlyingToxic(
      "0x0DB2B2E3A45e6e9e30B68C4461bBe42BFA125011" as `0x${string}`,
      "USR"
    );
    expect(result).toBe(true);
  });

  it("returns false when vault underlying does not match", () => {
    const engine = new RulesEngine();
    const result = engine.isUnderlyingToxic(
      "0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca" as `0x${string}`, // USDC vault
      "USR"
    );
    expect(result).toBe(false);
  });
});
