import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mock for cache
const { mockCache } = vi.hoisted(() => ({
  mockCache: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    setNX: vi.fn(),
    eval: vi.fn(),
  },
}));

vi.mock("@/lib/redis/client", () => ({
  getCacheInterface: vi.fn(() => Promise.resolve(mockCache)),
}));

import { acquireUserLock, releaseUserLock } from "@/lib/redis/distributed-lock";

describe("Distributed Lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("P2-3: Atomic lock acquisition", () => {
    it("should use atomic setNX instead of check-then-set", async () => {
      // setNX returns true (lock acquired)
      mockCache.setNX.mockResolvedValue(true);

      const result = await acquireUserLock("0xuser");

      expect(result.acquired).toBe(true);
      expect(result.lockId).toBeDefined();
      // Should use atomic setNX, NOT separate get+set
      expect(mockCache.setNX).toHaveBeenCalledTimes(1);
      expect(mockCache.get).not.toHaveBeenCalled();
      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it("should fail to acquire when setNX returns false (already locked)", async () => {
      // setNX returns false (lock already held)
      mockCache.setNX.mockResolvedValue(false);

      const result = await acquireUserLock("0xuser");

      expect(result.acquired).toBe(false);
      expect(result.lockId).toBeUndefined();
    });

    it("should release lock atomically via Lua script when Redis supports eval", async () => {
      // eval returns 1 (key was deleted) — Redis handled it
      mockCache.eval.mockResolvedValue(1);

      await releaseUserLock("0xuser", "my-lock-id");

      // Should call eval with the Lua script, key, and lockId
      expect(mockCache.eval).toHaveBeenCalledTimes(1);
      expect(mockCache.eval).toHaveBeenCalledWith(
        expect.stringContaining("redis.call('get', KEYS[1])"),
        [expect.stringContaining("0xuser")],
        ["my-lock-id"]
      );
      // Should NOT fall through to non-atomic get+del
      expect(mockCache.get).not.toHaveBeenCalled();
      expect(mockCache.del).not.toHaveBeenCalled();
    });

    it("should not delete lock via Lua when lockId does not match", async () => {
      // eval returns 0 (lockId mismatch, key not deleted)
      mockCache.eval.mockResolvedValue(0);

      await releaseUserLock("0xuser", "my-lock-id");

      expect(mockCache.eval).toHaveBeenCalledTimes(1);
      expect(mockCache.del).not.toHaveBeenCalled();
    });

    it("should fall back to non-atomic release when eval returns null (in-memory)", async () => {
      // eval returns null (in-memory fallback, Lua not supported)
      mockCache.eval.mockResolvedValue(null);
      mockCache.get.mockResolvedValue("my-lock-id");

      await releaseUserLock("0xuser", "my-lock-id");

      // Should fall through to get+del
      expect(mockCache.get).toHaveBeenCalledTimes(1);
      expect(mockCache.del).toHaveBeenCalledTimes(1);
    });

    it("should NOT release in fallback path when lockId does not match", async () => {
      mockCache.eval.mockResolvedValue(null);
      mockCache.get.mockResolvedValue("other-lock-id");

      await releaseUserLock("0xuser", "my-lock-id");

      expect(mockCache.get).toHaveBeenCalledTimes(1);
      expect(mockCache.del).not.toHaveBeenCalled();
    });
  });
});
