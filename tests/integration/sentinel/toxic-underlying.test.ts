import { describe, it, expect, beforeEach } from "vitest";
import { RulesEngine } from "@/sentinel/rules-engine";
import { SignalHistory } from "@/sentinel/types";
import type { Signal, ActiveIncident, VaultConfig } from "@/sentinel/types";

// Test #30: Toxic underlying detection
//
// The toxic-underlying rule prevents unsafe exits: if a vault's underlying
// asset IS the depegging asset, redeeming hands back the toxic asset, so we
// emit an ALERT instead of an EXIT. After the USR removal we use USDC as
// the example toxic underlying since Moonwell Flagship USDC is in the
// current VAULT_EXPOSURE_MAP.

describe("Integration: Toxic Underlying Asset", () => {
  it("morpho-vault-holding-depegged-underlying-emits-alert-not-exit", () => {
    const engine = new RulesEngine();
    const windows = new Map<string, SignalHistory>();
    const incidents = new Map<string, ActiveIncident>();

    // Moonwell Flagship USDC — underlying IS USDC (from VAULT_EXPOSURE_MAP)
    const usdcVault: VaultConfig = {
      address: "0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca" as `0x${string}`,
      exposure: {
        protocol: "morpho",
        underlying: "USDC",
        dexPools: [],
      },
    };

    // Poll 1: USDC depegged > 3% (simulate a broad stablecoin crisis)
    const signal1: Signal = {
      type: "DEX_PRICE",
      vault: usdcVault,
      asset: "USDC", // The depegging asset matches the underlying
      value: 0.94, // 6% depeg
      timestamp: Date.now(),
      source: "ponder",
    };
    engine.evaluate([signal1], windows, incidents);

    // Poll 2: Still depegged
    const signal2: Signal = {
      type: "DEX_PRICE",
      vault: usdcVault,
      asset: "USDC",
      value: 0.92,
      timestamp: Date.now(),
      source: "ponder",
    };
    const actions = engine.evaluate([signal2], windows, incidents);

    // CRITICAL: Should be ALERT, not EXIT — redeeming hands back the toxic asset.
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("ALERT");
    expect(actions[0].reason).toBe("TOXIC_UNDERLYING_DEPEG");
  });

  it("morpho-usdc-vault-gets-normal-exit-on-non-matching-depeg", () => {
    const engine = new RulesEngine();
    const windows = new Map<string, SignalHistory>();
    const incidents = new Map<string, ActiveIncident>();

    // This vault holds USDC
    const usdcVault: VaultConfig = {
      address: "0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca" as `0x${string}`,
      exposure: {
        protocol: "morpho",
        underlying: "USDC",
        dexPools: [],
      },
    };

    // EURC depeg signal, but this vault's underlying is USDC
    const signal1: Signal = {
      type: "DEX_PRICE",
      vault: usdcVault,
      asset: "EURC", // EURC depegging, vault holds USDC — redemption is safe
      value: 0.94,
      timestamp: Date.now(),
      source: "ponder",
    };
    engine.evaluate([signal1], windows, incidents);

    const signal2: Signal = {
      type: "DEX_PRICE",
      vault: usdcVault,
      asset: "EURC",
      value: 0.92,
      timestamp: Date.now(),
      source: "ponder",
    };
    const actions = engine.evaluate([signal2], windows, incidents);

    // Normal EXIT because underlying (USDC) is not the toxic asset
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("EXIT");
    expect(actions[0].reason).toBe("DEPEG");
  });
});
