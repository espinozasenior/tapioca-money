/**
 * Chainlink Oracle Safety Check Tests
 * Tests for USDC/USD price feed staleness, depeg detection, and L2 sequencer uptime
 */

import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock readContract responses per call
const mockReadContract = vi.fn();

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: () => ({ readContract: mockReadContract }),
  };
});

vi.mock("@/lib/yield-optimizer/config", () => ({
  CHAIN_CONFIG: { rpcUrl: "https://test-rpc.example.com", chainId: 8453, name: "Base" },
}));

// Import after mocks are set up
const { getUsdcPrice, isRebalanceSafe } = await import("@/lib/oracles/chainlink");

// Helpers to configure mock responses
const NOW_UNIX = Math.floor(Date.now() / 1000);

function mockSequencerUp(startedAt: number = NOW_UNIX - 7200) {
  // Sequencer: answer=0 (up), startedAt = 2 hours ago by default
  return [1n, 0n, BigInt(startedAt), BigInt(startedAt), 1n];
}

function mockSequencerDown() {
  return [1n, 1n, BigInt(NOW_UNIX - 100), BigInt(NOW_UNIX - 100), 1n];
}

function mockSequencerRecentRestart(secondsAgo: number = 600) {
  // Sequencer up but restarted recently (within grace period)
  return [1n, 0n, BigInt(NOW_UNIX - secondsAgo), BigInt(NOW_UNIX - secondsAgo), 1n];
}

function mockPriceData(price: bigint, updatedSecondsAgo: number = 3600) {
  // latestRoundData for USDC/USD
  return [1n, price, 0n, BigInt(NOW_UNIX - updatedSecondsAgo), 1n];
}

function mockDecimals(decimals: number = 8) {
  return decimals;
}

describe("Chainlink Oracle Safety Checks", () => {
  beforeEach(() => {
    mockReadContract.mockReset();
  });

  describe("getUsdcPrice", () => {
    test("returns correct price for healthy feed", async () => {
      mockReadContract
        .mockResolvedValueOnce(mockPriceData(100010000n, 1800)) // $1.0001, updated 30min ago
        .mockResolvedValueOnce(mockDecimals(8));

      const result = await getUsdcPrice();

      expect(result.price).toBeCloseTo(1.0001, 4);
      expect(result.isStale).toBe(false);
      expect(result.isDepegged).toBe(false);
    });

    test("detects stale data (>24h old)", async () => {
      mockReadContract
        .mockResolvedValueOnce(mockPriceData(100000000n, 90000)) // updated 25h ago
        .mockResolvedValueOnce(mockDecimals(8));

      const result = await getUsdcPrice();

      expect(result.isStale).toBe(true);
    });

    test("does not flag data updated 23h ago as stale", async () => {
      mockReadContract
        .mockResolvedValueOnce(mockPriceData(100000000n, 82800)) // updated 23h ago
        .mockResolvedValueOnce(mockDecimals(8));

      const result = await getUsdcPrice();

      expect(result.isStale).toBe(false);
    });

    test("detects USDC depeg above 0.5%", async () => {
      mockReadContract
        .mockResolvedValueOnce(mockPriceData(99400000n, 1800)) // $0.994 (0.6% deviation)
        .mockResolvedValueOnce(mockDecimals(8));

      const result = await getUsdcPrice();

      expect(result.isDepegged).toBe(true);
    });

    test("does not flag 0.4% deviation as depeg", async () => {
      mockReadContract
        .mockResolvedValueOnce(mockPriceData(99600000n, 1800)) // $0.996 (0.4% deviation)
        .mockResolvedValueOnce(mockDecimals(8));

      const result = await getUsdcPrice();

      expect(result.isDepegged).toBe(false);
    });
  });

  describe("isRebalanceSafe", () => {
    test("returns safe when sequencer is up and price is healthy", async () => {
      mockReadContract
        .mockResolvedValueOnce(mockSequencerUp()) // sequencer check
        .mockResolvedValueOnce(mockPriceData(100000000n)) // price feed
        .mockResolvedValueOnce(mockDecimals(8)); // decimals

      const result = await isRebalanceSafe();

      expect(result.safe).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    test("blocks when sequencer is down", async () => {
      mockReadContract.mockResolvedValueOnce(mockSequencerDown());

      const result = await isRebalanceSafe();

      expect(result.safe).toBe(false);
      expect(result.reason).toContain("sequencer is down");
    });

    test("blocks during sequencer grace period", async () => {
      mockReadContract.mockResolvedValueOnce(mockSequencerRecentRestart(600)); // 10min ago

      const result = await isRebalanceSafe();

      expect(result.safe).toBe(false);
      expect(result.reason).toContain("recently restarted");
      expect(result.reason).toContain("grace period");
    });

    test("allows after sequencer grace period passes", async () => {
      mockReadContract
        .mockResolvedValueOnce(mockSequencerUp(NOW_UNIX - 3700)) // restarted 1h+ ago
        .mockResolvedValueOnce(mockPriceData(100000000n))
        .mockResolvedValueOnce(mockDecimals(8));

      const result = await isRebalanceSafe();

      expect(result.safe).toBe(true);
    });

    test("blocks when price data is stale", async () => {
      mockReadContract
        .mockResolvedValueOnce(mockSequencerUp())
        .mockResolvedValueOnce(mockPriceData(100000000n, 90000)) // 25h old
        .mockResolvedValueOnce(mockDecimals(8));

      const result = await isRebalanceSafe();

      expect(result.safe).toBe(false);
      expect(result.reason).toContain("stale");
    });

    test("blocks when USDC is depegged", async () => {
      mockReadContract
        .mockResolvedValueOnce(mockSequencerUp())
        .mockResolvedValueOnce(mockPriceData(98000000n, 1800)) // $0.98
        .mockResolvedValueOnce(mockDecimals(8));

      const result = await isRebalanceSafe();

      expect(result.safe).toBe(false);
      expect(result.reason).toContain("depegged");
    });

    test("handles RPC errors gracefully", async () => {
      mockReadContract.mockRejectedValueOnce(new Error("RPC timeout"));

      const result = await isRebalanceSafe();

      expect(result.safe).toBe(false);
      expect(result.reason).toContain("RPC timeout");
    });

    test("checks sequencer before price feed (short-circuits)", async () => {
      mockReadContract.mockResolvedValueOnce(mockSequencerDown());

      await isRebalanceSafe();

      // Only 1 call (sequencer) — should NOT call price feed
      expect(mockReadContract).toHaveBeenCalledTimes(1);
    });
  });
});
