import { describe, it, expect, vi, beforeEach } from "vitest";

// Test #28: Stale indexer fallback

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe("Integration: Stale Indexer Fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ponder-stale-90s-triggers-fallback-to-defillama", async () => {
    const { checkPonderFreshness } = await import("@/sentinel/signals/ponder");
    const { queryDeFiLlamaPrice } = await import("@/sentinel/signals/defillama");

    // Ponder reports 90s-old block (stale > 60s threshold)
    // Uses Ponder 0.7 shape: status.<network>.{ready, block}
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          _meta: {
            status: {
              base: {
                ready: true, // backfill finished, but live head is stale
                block: {
                  number: 12345678,
                  timestamp: Math.floor(Date.now() / 1000) - 90,
                },
              },
            },
          },
        },
      }),
    });

    const freshness = await checkPonderFreshness("http://localhost:42069", 60);
    expect(freshness.fresh).toBe(false);
    expect(freshness.meta).not.toBeNull();

    // Since Ponder is stale, worker falls back to DeFiLlama
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        coins: {
          "base:0x833589fCD6eDb6E08f4c7C32d4f71b54bdA02913": {
            price: 0.999,
            timestamp: Math.floor(Date.now() / 1000),
            confidence: 0.99,
          },
        },
      }),
    });

    const llamaPrice = await queryDeFiLlamaPrice("USDC");
    expect(llamaPrice).not.toBeNull();
    expect(llamaPrice!.price).toBe(0.999);

    // The fallback signal is valid and usable
    expect(typeof llamaPrice!.price).toBe("number");
    expect(llamaPrice!.price).toBeGreaterThan(0);
  });

  it("ponder-unreachable-returns-not-fresh", async () => {
    const { checkPonderFreshness } = await import("@/sentinel/signals/ponder");

    // Ponder connection refused
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const freshness = await checkPonderFreshness("http://localhost:42069", 60);
    expect(freshness.fresh).toBe(false);
    expect(freshness.meta).toBeNull();
  });
});
