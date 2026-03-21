import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createVaultPauseState,
  createNotPausedState,
  isPauseStateFresh,
} from "@/lib/shared/vault-pause-state";

const VAULT = "0x1111111111111111111111111111111111111111" as `0x${string}`;

describe("vault-pause-state", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createVaultPauseState", () => {
    it("sets paused=true when depositPaused", () => {
      const state = createVaultPauseState(VAULT, { depositPaused: true, redeemPaused: false });
      expect(state.paused).toBe(true);
      expect(state.depositPaused).toBe(true);
      expect(state.redeemPaused).toBe(false);
    });

    it("sets paused=true when redeemPaused", () => {
      const state = createVaultPauseState(VAULT, { depositPaused: false, redeemPaused: true });
      expect(state.paused).toBe(true);
    });

    it("sets paused=false when nothing is paused", () => {
      const state = createVaultPauseState(VAULT, { depositPaused: false, redeemPaused: false });
      expect(state.paused).toBe(false);
    });

    it("lowercases address", () => {
      const state = createVaultPauseState(
        "0xABCDEF1234567890ABCDEF1234567890ABCDEF12" as `0x${string}`,
        { depositPaused: false, redeemPaused: false }
      );
      expect(state.address).toBe("0xabcdef1234567890abcdef1234567890abcdef12");
    });

    it("sets checkedAt to current time", () => {
      const now = 1700000000000;
      vi.spyOn(Date, "now").mockReturnValue(now);
      const state = createVaultPauseState(VAULT, { depositPaused: false, redeemPaused: false });
      expect(state.checkedAt).toBe(now);
    });
  });

  describe("createNotPausedState", () => {
    it("returns all-false pause state", () => {
      const state = createNotPausedState(VAULT);
      expect(state.paused).toBe(false);
      expect(state.depositPaused).toBe(false);
      expect(state.redeemPaused).toBe(false);
    });
  });

  describe("isPauseStateFresh", () => {
    it("returns true when within TTL", () => {
      const state = createVaultPauseState(VAULT, { depositPaused: false, redeemPaused: false });
      expect(isPauseStateFresh(state, 60_000)).toBe(true);
    });

    it("returns false when TTL expired", () => {
      const state = createVaultPauseState(VAULT, { depositPaused: false, redeemPaused: false });
      state.checkedAt = Date.now() - 120_000; // 2 minutes ago
      expect(isPauseStateFresh(state, 60_000)).toBe(false);
    });
  });
});
