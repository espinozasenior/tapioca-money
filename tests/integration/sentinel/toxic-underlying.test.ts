import { describe, it, expect, beforeEach } from "vitest";
import { RulesEngine } from "@/sentinel/rules-engine";
import { SignalHistory } from "@/sentinel/types";
import type { Signal, ActiveIncident, VaultConfig } from "@/sentinel/types";

// Test #30: Toxic underlying detection

describe("Integration: Toxic Underlying Asset", () => {
  it("morpho-vault-holding-usr-emits-alert-not-exit-on-depeg", () => {
    const engine = new RulesEngine();
    const windows = new Map<string, SignalHistory>();
    const incidents = new Map<string, ActiveIncident>();

    // This vault holds USR as underlying (from VAULT_EXPOSURE_MAP)
    const usrVault: VaultConfig = {
      address: "0x0DB2B2E3A45e6e9e30B68C4461bBe42BFA125011" as `0x${string}`,
      exposure: {
        protocol: "morpho",
        underlying: "USR",
        dexPools: [
          {
            address: "0x5D13179c5fa40b87D53Ff67ca26245D3D6B76E01" as `0x${string}`,
            asset: "USR",
            chain: "ethereum",
          },
        ],
      },
    };

    // Poll 1: USR depegged > 3%
    const signal1: Signal = {
      type: "DEX_PRICE",
      vault: usrVault,
      asset: "USR", // The depegging asset matches the underlying
      value: 0.94, // 6% depeg
      timestamp: Date.now(),
      source: "ponder",
    };
    engine.evaluate([signal1], windows, incidents);

    // Poll 2: Still depegged
    const signal2: Signal = {
      type: "DEX_PRICE",
      vault: usrVault,
      asset: "USR",
      value: 0.92,
      timestamp: Date.now(),
      source: "ponder",
    };
    const actions = engine.evaluate([signal2], windows, incidents);

    // CRITICAL: Should be ALERT, not EXIT
    // Because redeeming this vault gives back USR (the toxic asset)
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("ALERT");
    expect(actions[0].reason).toBe("TOXIC_UNDERLYING_DEPEG");
  });

  it("morpho-usdc-vault-gets-normal-exit-on-depeg", () => {
    const engine = new RulesEngine();
    const windows = new Map<string, SignalHistory>();
    const incidents = new Map<string, ActiveIncident>();

    // This vault holds USDC (not USR)
    const usdcVault: VaultConfig = {
      address: "0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca" as `0x${string}`,
      exposure: {
        protocol: "morpho",
        underlying: "USDC",
        dexPools: [],
      },
    };

    // USR depeg signal, but this vault doesn't hold USR
    const signal1: Signal = {
      type: "DEX_PRICE",
      vault: usdcVault,
      asset: "USR", // USR is depegging but this vault's underlying is USDC
      value: 0.94,
      timestamp: Date.now(),
      source: "ponder",
    };
    engine.evaluate([signal1], windows, incidents);

    const signal2: Signal = {
      type: "DEX_PRICE",
      vault: usdcVault,
      asset: "USR",
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
