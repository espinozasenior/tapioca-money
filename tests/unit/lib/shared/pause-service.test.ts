import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PauseService } from "@/lib/shared/pause-service";
import type { VaultPauseChecker } from "@/lib/shared/vault-pause-checker";
import { createVaultPauseState } from "@/lib/shared/vault-pause-state";

const VAULT_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`;
const VAULT_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as `0x${string}`;

function makeMockChecker(
  results: Map<string, { depositPaused: boolean; redeemPaused: boolean }>
): VaultPauseChecker {
  return {
    checkPauseStates: vi.fn(async (addresses: `0x${string}`[]) =>
      addresses.map((addr) => {
        const r = results.get(addr.toLowerCase()) ?? { depositPaused: false, redeemPaused: false };
        return createVaultPauseState(addr, r);
      })
    ),
  };
}

describe("PauseService", () => {
  let service: PauseService;
  let checker: VaultPauseChecker;

  beforeEach(() => {
    vi.useFakeTimers();
    checker = makeMockChecker(
      new Map([
        [VAULT_A, { depositPaused: true, redeemPaused: false }],
        [VAULT_B, { depositPaused: false, redeemPaused: false }],
      ])
    );
    service = new PauseService([checker], { ttlMs: 60_000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns pause states for all requested vaults", async () => {
    const result = await service.checkVaultPauseStates([
      { address: VAULT_A, protocol: "yo" },
      { address: VAULT_B, protocol: "morpho" },
    ]);

    expect(result.get(VAULT_A)?.depositPaused).toBe(true);
    expect(result.get(VAULT_B)?.paused).toBe(false);
  });

  it("caches results within TTL", async () => {
    await service.checkVaultPauseStates([{ address: VAULT_A, protocol: "yo" }]);
    await service.checkVaultPauseStates([{ address: VAULT_A, protocol: "yo" }]);

    // Checker should only be called once (second call hits cache)
    expect(checker.checkPauseStates).toHaveBeenCalledTimes(1);
  });

  it("re-fetches after TTL expires", async () => {
    await service.checkVaultPauseStates([{ address: VAULT_A, protocol: "yo" }]);

    vi.advanceTimersByTime(61_000); // past 60s TTL

    await service.checkVaultPauseStates([{ address: VAULT_A, protocol: "yo" }]);
    expect(checker.checkPauseStates).toHaveBeenCalledTimes(2);
  });

  it("fail-open: returns not-paused on checker error", async () => {
    const failChecker: VaultPauseChecker = {
      checkPauseStates: vi.fn().mockRejectedValue(new Error("RPC timeout")),
    };
    const failService = new PauseService([failChecker], { ttlMs: 60_000 });

    const result = await failService.checkVaultPauseStates([{ address: VAULT_A, protocol: "yo" }]);

    expect(result.get(VAULT_A)?.paused).toBe(false);
  });

  it("handles mixed cached and uncached addresses", async () => {
    // Fetch VAULT_A first
    await service.checkVaultPauseStates([{ address: VAULT_A, protocol: "yo" }]);

    // Now fetch both — VAULT_A should come from cache, VAULT_B should be fetched
    const result = await service.checkVaultPauseStates([
      { address: VAULT_A, protocol: "yo" },
      { address: VAULT_B, protocol: "morpho" },
    ]);

    expect(result.size).toBe(2);
    // First call fetched [VAULT_A], second call should only fetch [VAULT_B]
    expect(checker.checkPauseStates).toHaveBeenCalledTimes(2);
    const secondCallArgs = (checker.checkPauseStates as any).mock.calls[1][0];
    expect(secondCallArgs).toEqual([VAULT_B]);
  });

  it("returns empty map for empty input", async () => {
    const result = await service.checkVaultPauseStates([]);
    expect(result.size).toBe(0);
    expect(checker.checkPauseStates).not.toHaveBeenCalled();
  });
});
