import { describe, it, expect, vi, beforeEach } from "vitest";

// Test #24: Ponder GraphQL to worker signal consumption

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe("Integration: Ponder to Worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("worker-fetches-and-parses-vault-flows-from-ponder", async () => {
    const { queryVaultFlows } = await import("@/sentinel/signals/ponder");
    const { checkPonderFreshness } = await import("@/sentinel/signals/ponder");

    // Mock Ponder _meta (fresh)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          _meta: {
            block: {
              number: 12345678,
              timestamp: Math.floor(Date.now() / 1000) - 5, // 5s ago = fresh
            },
          },
        },
      }),
    });

    const freshness = await checkPonderFreshness("http://localhost:42069", 60);
    expect(freshness.fresh).toBe(true);

    // Mock vault flows query
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          vaultFlows: [
            { type: "withdraw", assets: "1000000000", timestamp: 1711100000 },
            { type: "withdraw", assets: "500000000", timestamp: 1711100010 },
            { type: "deposit", assets: "200000000", timestamp: 1711100020 },
          ],
        },
      }),
    });

    const flows = await queryVaultFlows("http://localhost:42069", "0xVault", 1711099000);

    expect(flows).toHaveLength(3);

    // Calculate net flow like the worker does
    const deposits = flows
      .filter((f) => f.type === "deposit")
      .reduce((sum, f) => sum + parseFloat(f.assets), 0);
    const withdrawals = flows
      .filter((f) => f.type === "withdraw")
      .reduce((sum, f) => sum + parseFloat(f.assets), 0);
    const netFlow = deposits - withdrawals;

    expect(netFlow).toBe(-1300000000); // Net negative = outflow
    expect(withdrawals).toBe(1500000000);
    expect(deposits).toBe(200000000);
  });
});
