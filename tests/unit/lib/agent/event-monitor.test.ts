import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApyEventMonitor } from "@/lib/agent/event-monitor";

// Mocks
const { mockFetchVaults, mockGetCacheInterface } = vi.hoisted(() => ({
  mockFetchVaults: vi.fn(),
  mockGetCacheInterface: vi.fn(),
}));

vi.mock("@/lib/morpho/api-client", () => {
  return {
    MorphoClient: class {
      fetchVaults = mockFetchVaults;
    },
  };
});

vi.mock("@/lib/redis/client", () => ({
  getCacheInterface: mockGetCacheInterface,
}));

describe("APY Event Monitor", () => {
  const mockCache = {
    get: vi.fn(),
    set: vi.fn(),
  };

  const mockVaults = [
    { address: "0x1", name: "Vault 1", avgNetApy: 0.05 },
    { address: "0x2", name: "Vault 2", avgNetApy: 0.1 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCacheInterface.mockResolvedValue(mockCache);
    mockFetchVaults.mockResolvedValue(mockVaults);
  });

  describe("detectChanges", () => {
    it("should report no changes if baselines match", async () => {
      mockCache.get.mockImplementation((key) => {
        if (key.includes("0x1")) return "0.05";
        if (key.includes("0x2")) return "0.10";
        return null;
      });

      const monitor = new ApyEventMonitor(0.01);
      const result = await monitor.detectChanges();

      expect(result.changes).toHaveLength(0);
      expect(mockCache.set).toHaveBeenCalledTimes(2); // Updates baseline
    });

    it("should detect significant increase", async () => {
      mockCache.get.mockImplementation((key) => {
        if (key.includes("0x1")) return "0.03"; // Was 3%, now 5% (diff 2% > 1%)
        if (key.includes("0x2")) return "0.10";
        return null;
      });

      const monitor = new ApyEventMonitor(0.01);
      const result = await monitor.detectChanges();

      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].direction).toBe("up");
      expect(result.changes[0].changeAbsolute).toBeCloseTo(0.02);
    });

    it("should detect significant decrease", async () => {
      mockCache.get.mockImplementation((key) => {
        if (key.includes("0x1")) return "0.08"; // Was 8%, now 5% (diff -3% > 1%)
        if (key.includes("0x2")) return "0.10";
        return null;
      });

      const monitor = new ApyEventMonitor(0.01);
      const result = await monitor.detectChanges();

      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].direction).toBe("down");
      expect(result.changes[0].changeAbsolute).toBeCloseTo(-0.03);
    });

    it("should ignore small changes", async () => {
      mockCache.get.mockImplementation((key) => {
        if (key.includes("0x1")) return "0.055"; // Diff 0.5% < 1%
        if (key.includes("0x2")) return "0.10";
        return null;
      });

      const monitor = new ApyEventMonitor(0.01);
      const result = await monitor.detectChanges();

      expect(result.changes).toHaveLength(0);
    });

    it("should set baseline if missing", async () => {
      mockCache.get.mockResolvedValue(null);

      const monitor = new ApyEventMonitor(0.01);
      const result = await monitor.detectChanges();

      expect(result.changes).toHaveLength(0);
      expect(mockCache.set).toHaveBeenCalledWith(
        expect.stringContaining("apy_baseline:0x1"),
        "0.05",
        expect.any(Number)
      );
    });
  });

  describe("Filtering Helpers", () => {
    it("getDroppedVaults should return only drops", async () => {
      mockCache.get.mockImplementation((key) => {
        if (key.includes("0x1")) return "0.08"; // Drop
        if (key.includes("0x2")) return "0.05"; // Increase
        return null;
      });

      const monitor = new ApyEventMonitor(0.01);
      const drops = await monitor.getDroppedVaults();

      expect(drops).toHaveLength(1);
      expect(drops[0].vaultAddress).toBe("0x1");
    });

    it("getImprovedVaults should return only increases", async () => {
      mockCache.get.mockImplementation((key) => {
        if (key.includes("0x1")) return "0.08"; // Drop
        if (key.includes("0x2")) return "0.05"; // Increase
        return null;
      });

      const monitor = new ApyEventMonitor(0.01);
      const gains = await monitor.getImprovedVaults();

      expect(gains).toHaveLength(1);
      expect(gains[0].vaultAddress).toBe("0x2");
    });
  });

  describe("resetBaselines", () => {
    it("should reset all keys", async () => {
      const monitor = new ApyEventMonitor();
      await monitor.resetBaselines();

      expect(mockFetchVaults).toHaveBeenCalled();
      expect(mockCache.set).toHaveBeenCalledTimes(2);
    });
  });
});
