import { describe, it, expect, vi } from "vitest";

// Mock React component dependencies so we can import the pure function
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("lucide-react", () => ({ Info: () => null }));
vi.mock("@/hooks/useWallet", () => ({ useWallet: vi.fn() }));
vi.mock("@/hooks/useOptimizer", () => ({
  useVaultExit: vi.fn(),
  getProtocolInfo: vi.fn(() => ({ name: "morpho", color: "#7B3FE4" })),
  YieldOpportunity: {},
  YieldPosition: {},
}));

import { formatEarned } from "@/components/earn-yield/PositionsList";

describe("formatEarned", () => {
  it('returns "0.00" for zero', () => {
    expect(formatEarned("0")).toBe("0.00");
  });

  it('returns "0.00" for empty / NaN input', () => {
    expect(formatEarned("")).toBe("0.00");
  });

  it("shows 4 decimals for sub-cent amounts", () => {
    expect(formatEarned("0.0033")).toBe("0.0033");
  });

  it("shows 4 decimals just below the 0.01 boundary", () => {
    expect(formatEarned("0.009999")).toBe("0.0100");
  });

  it("shows 2 decimals at exactly 0.01", () => {
    expect(formatEarned("0.01")).toBe("0.01");
  });

  it("shows 2 decimals for normal amounts", () => {
    expect(formatEarned("1.5")).toBe("1.50");
  });

  it("rounds large amounts to 2 decimals", () => {
    expect(formatEarned("1234.5678")).toBe("1234.57");
  });
});
