import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getCachedVaults,
  setCachedVaults,
  getCachedUserPositions,
  setCachedUserPositions,
  getCachedBestVault,
  setCachedBestVault,
  invalidateUserPositions,
  invalidateChainCache,
} from "@/lib/redis/morpho-cache";

// Mocks
const mockCache = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
};

vi.mock("@/lib/redis/client", () => ({
  getCacheInterface: vi.fn(() => Promise.resolve(mockCache)),
}));

describe("Morpho Cache", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Vaults Cache", () => {
    const vaults = [{ address: "0x1", name: "V1" }] as any;

    it("should set cached vaults", async () => {
      await setCachedVaults(8453, "USDC", vaults);
      expect(mockCache.set).toHaveBeenCalledWith(
        expect.stringContaining("morpho:vaults:8453:usdc"),
        JSON.stringify(vaults),
        expect.any(Number)
      );
    });

    it("should get cached vaults", async () => {
      mockCache.get.mockResolvedValue(JSON.stringify(vaults));
      const result = await getCachedVaults(8453, "USDC");
      expect(result).toEqual(vaults);
    });

    it("should return null on miss", async () => {
      mockCache.get.mockResolvedValue(null);
      const result = await getCachedVaults(8453, "USDC");
      expect(result).toBeNull();
    });

    it("should handle error gracefully", async () => {
      mockCache.get.mockRejectedValue(new Error("Redis error"));
      const result = await getCachedVaults(8453, "USDC");
      expect(result).toBeNull();
    });
  });

  describe("User Positions Cache", () => {
    const positions = [{ vaultId: "0x1", assets: "100" }] as any;

    it("should set cached positions", async () => {
      await setCachedUserPositions("0xUser", 8453, positions);
      expect(mockCache.set).toHaveBeenCalledWith(
        expect.stringContaining("morpho:positions:0xuser:8453"),
        JSON.stringify(positions),
        expect.any(Number)
      );
    });

    it("should get cached positions", async () => {
      mockCache.get.mockResolvedValue(JSON.stringify(positions));
      const result = await getCachedUserPositions("0xUser", 8453);
      expect(result).toEqual(positions);
    });

    it("should invalidate positions", async () => {
      await invalidateUserPositions("0xUser", 8453);
      expect(mockCache.del).toHaveBeenCalledWith(
        expect.stringContaining("morpho:positions:0xuser:8453")
      );
    });
  });

  describe("Best Vault Cache", () => {
    const vault = { address: "0xBest", name: "BestV" } as any;

    it("should set cached best vault", async () => {
      await setCachedBestVault(8453, "USDC", 1000, vault);
      expect(mockCache.set).toHaveBeenCalledWith(
        expect.stringContaining("morpho:best:8453:usdc:1000"),
        JSON.stringify(vault),
        expect.any(Number)
      );
    });

    it("should get cached best vault", async () => {
      mockCache.get.mockResolvedValue(JSON.stringify(vault));
      const result = await getCachedBestVault(8453, "USDC", 1000);
      expect(result).toEqual(vault);
    });

    it("should handle null vault setting", async () => {
      await setCachedBestVault(8453, "USDC", 1000, null);
      expect(mockCache.set).not.toHaveBeenCalled();
    });
  });

  describe("Chain Invalidation", () => {
    it("should log invalidation request", async () => {
      const consoleSpy = vi.spyOn(console, "log");
      await invalidateChainCache(8453);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Chain cache invalidation"),
        8453
      );
    });
  });
});
