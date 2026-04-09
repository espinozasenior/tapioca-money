import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

const mockReadContract = vi.fn();

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      readContract: mockReadContract,
    })),
  };
});

describe("Ponder signals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test #15 — Ponder 0.7 paginated shape: priceUpdates.items
  it("ponder-price-signal-parses-graphql", async () => {
    const { queryPriceUpdate } = await import("@/sentinel/signals/ponder");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          priceUpdates: {
            items: [{ price: 0.985, timestamp: 1711100000 }],
          },
        },
      }),
    });

    const result = await queryPriceUpdate("http://localhost:42069", "0xFeed");

    expect(result).not.toBeNull();
    expect(result!.price).toBe(0.985);
    expect(result!.timestamp).toBe(1711100000);
  });

  // Test #16 — Ponder 0.7 paginated shape: vaultFlows.items
  it("ponder-flow-signal-aggregates-withdrawals", async () => {
    const { queryVaultFlows } = await import("@/sentinel/signals/ponder");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          vaultFlows: {
            items: [
              { type: "withdraw", assets: "500000", timestamp: 1711100000 },
              { type: "withdraw", assets: "300000", timestamp: 1711100010 },
              { type: "deposit", assets: "100000", timestamp: 1711100020 },
            ],
          },
        },
      }),
    });

    const flows = await queryVaultFlows("http://localhost:42069", "0xVault", 1711099000);

    expect(flows).toHaveLength(3);
    const withdrawals = flows
      .filter((f) => f.type === "withdraw")
      .reduce((sum, f) => sum + parseFloat(f.assets), 0);
    expect(withdrawals).toBe(800000);
  });

  // NOTE: Previously had a dex-price-signal-calculates-implied-price test that
  // exercised queryDexSwaps + the CurveDexPool handler. Both were removed when
  // USR support was dropped from the sentinel — see refactor commit 24489d0.
});

describe("On-chain signals", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/sentinel/signals/onchain");
    mod.resetClient();
  });

  // Test #18
  it("max-redeem-signal-reads-onchain", async () => {
    const { queryMaxRedeem } = await import("@/sentinel/signals/onchain");

    mockReadContract.mockResolvedValueOnce(50000n);

    const result = await queryMaxRedeem(
      "0xVault" as `0x${string}`,
      "0xOwner" as `0x${string}`,
      "http://localhost:4000"
    );

    expect(result).toBe(50000n);
    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "maxRedeem",
        args: ["0xOwner"],
      })
    );
  });
});

describe("DeFiLlama signals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test #19
  it("defillama-signal-fallback-on-ponder-failure", async () => {
    const { queryDeFiLlamaPrice } = await import("@/sentinel/signals/defillama");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        coins: {
          "base:0x833589fCD6eDb6E08f4c7C32d4f71b54bdA02913": {
            price: 1.0001,
            timestamp: 1711100000,
            confidence: 0.99,
          },
        },
      }),
    });

    const result = await queryDeFiLlamaPrice("USDC");

    expect(result).not.toBeNull();
    expect(result!.price).toBe(1.0001);
  });
});
