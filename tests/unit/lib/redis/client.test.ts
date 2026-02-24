import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getRedisClient, closeRedisClient, getCacheInterface } from "@/lib/redis/client";
import {
  getCachedVaults,
  setCachedVaults,
  getCachedUserPositions,
  setCachedUserPositions,
  invalidateUserPositions,
} from "@/lib/redis/morpho-cache";

describe("Redis Client & Cache", () => {
  const originalEnv = process.env;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.REDIS_URL; // Force in-memory by default
    await closeRedisClient();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Client Initialization", () => {
    it("should return null (in-memory) if REDIS_URL missing", async () => {
      const client = await getRedisClient();
      expect(client).toBeNull();
    });

    it("should return Redis client if REDIS_URL present", async () => {
      process.env.REDIS_URL = "redis://localhost:6379";

      // Mock ioredis
      vi.mock("ioredis", () => {
        return {
          default: class Redis {
            on() {}
            connect() {
              return Promise.resolve();
            }
            quit() {
              return Promise.resolve();
            }
          },
        };
      });

      const client = await getRedisClient();
      expect(client).toBeDefined();
    });
  });

  describe("In-Memory Cache Implementation", () => {
    it("should set and get values", async () => {
      const cache = await getCacheInterface();
      await cache.set("test-key", "test-val");
      const val = await cache.get("test-key");
      expect(val).toBe("test-val");
    });

    it("should handle expiration", async () => {
      const cache = await getCacheInterface();
      await cache.set("expired-key", "expired-val", -1); // Expired immediately
      const val = await cache.get("expired-key");
      expect(val).toBeNull();
    });

    it("should delete values", async () => {
      const cache = await getCacheInterface();
      await cache.set("del-key", "val");
      await cache.del("del-key");
      const val = await cache.get("del-key");
      expect(val).toBeNull();
    });

    it("should handle sorted sets", async () => {
      const cache = await getCacheInterface();
      await cache.zadd("scores", 10, "player1");
      await cache.zadd("scores", 20, "player2");
      await cache.zadd("scores", 5, "player3");

      const count = await cache.zcard("scores");
      expect(count).toBe(3);

      const range = await cache.zrangebyscore("scores", 10, 30);
      expect(range).toContain("player1");
      expect(range).toContain("player2");
      expect(range).not.toContain("player3");
    });
  });

  describe("Morpho Cache Layer", () => {
    const mockVaults = [{ address: "0x123", name: "Vault 1" }] as any;
    const mockPositions = [{ vaultId: "0x123", assets: "100" }] as any;

    it("should cache and retrieve vaults", async () => {
      await setCachedVaults(8453, "USDC", mockVaults);
      const cached = await getCachedVaults(8453, "USDC");
      expect(cached).toEqual(mockVaults);
    });

    it("should return null for missing vaults", async () => {
      const cached = await getCachedVaults(1, "ETH");
      expect(cached).toBeNull();
    });

    it("should cache and retrieve user positions", async () => {
      await setCachedUserPositions("0xuser", 8453, mockPositions);
      const cached = await getCachedUserPositions("0xuser", 8453);
      expect(cached).toEqual(mockPositions);
    });

    it("should invalidate user positions", async () => {
      await setCachedUserPositions("0xuser", 8453, mockPositions);
      await invalidateUserPositions("0xuser", 8453);
      const cached = await getCachedUserPositions("0xuser", 8453);
      expect(cached).toBeNull();
    });
  });
});
