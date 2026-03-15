import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mock for cache
const { mockCache } = vi.hoisted(() => ({
  mockCache: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    setNX: vi.fn(),
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

    it("should release lock only when lockId matches", async () => {
      mockCache.get.mockResolvedValue("my-lock-id");

      await releaseUserLock("0xuser", "my-lock-id");

      expect(mockCache.del).toHaveBeenCalledTimes(1);
    });

    it("should NOT release lock when lockId does not match", async () => {
      mockCache.get.mockResolvedValue("other-lock-id");

      await releaseUserLock("0xuser", "my-lock-id");

      expect(mockCache.del).not.toHaveBeenCalled();
    });
  });
});
