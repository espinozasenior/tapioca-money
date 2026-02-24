import { describe, it, expect, vi } from "vitest";

// Mock Next.js server primitives — not needed to test the pure transform function
vi.mock("next/server", () => ({
  NextRequest: class {},
  NextResponse: { json: vi.fn() },
}));

// Mock the decision engine singleton — not exercised by this test
vi.mock("@/lib/agent/decision-engine", () => ({
  yieldDecisionEngine: {
    getAvailableVaults: vi.fn(),
    evaluateRebalancing: vi.fn(),
    getUserPositionsWithApy: vi.fn(),
  },
}));

import { transformPositionToLegacy } from "@/app/api/optimize/route";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const basePos = {
  vault: { address: "0xtest", name: "Test Vault", symbol: "tUSDC" },
  shares: "1000000000",
  assets: "1000000000", // 1000 USDC (6 decimals)
  assetsUsd: 1000.0,
  pnl: null,
  pnlUsd: null,
  apy: 0.06,
  enteredAt: Date.now() - THIRTY_DAYS_MS,
};

describe("transformPositionToLegacy", () => {
  it("returns null for null input", () => {
    expect(transformPositionToLegacy(null)).toBeNull();
  });

  it("uses pnlUsd when available (most accurate)", () => {
    const pos = { ...basePos, pnlUsd: 12.345678, pnl: "999999" };
    const result = transformPositionToLegacy(pos);
    expect(result!.rewards.totalEarned).toBe("12.3457");
  });

  it("falls back to pnl / 1e6 when pnlUsd is null", () => {
    const pos = { ...basePos, pnlUsd: null, pnl: "50000000" };
    const result = transformPositionToLegacy(pos);
    expect(result!.rewards.totalEarned).toBe("50.0000");
  });

  it("falls back to time-based estimate when both pnl fields are null", () => {
    const pos = { ...basePos, pnlUsd: null, pnl: null };
    const result = transformPositionToLegacy(pos);
    expect(Number(result!.rewards.totalEarned)).toBeGreaterThan(0);
    expect(result!.rewards.totalEarned).toMatch(/^\d+\.\d{4}$/);
  });

  it("regression: pnlUsd of 0.0033 is NOT truncated to 0.00", () => {
    const pos = { ...basePos, pnlUsd: 0.0033, pnl: null };
    const result = transformPositionToLegacy(pos);
    expect(result!.rewards.totalEarned).toBe("0.0033");
  });

  it("output shape has correctly formatted reward fields", () => {
    const result = transformPositionToLegacy(basePos);
    expect(result!.rewards.totalEarned).toMatch(/^\d+\.\d{4}$/);
    expect(result!.rewards.earnedThisMonth).toMatch(/^\d+\.\d{4}$/);
    expect(result!.rewards.monthlyRate).toMatch(/^\d+\.\d{2}$/);
  });
});
