import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  checkRateLimit,
  recordRequest,
  checkTransferRateLimitRedis,
  recordTransferAttemptRedis,
  resetRateLimit,
  getRateLimitUsage,
} from "@/lib/redis/rate-limiter";

// Mocks
const mockCache = {
  zremrangebyscore: vi.fn(),
  zrangebyscore: vi.fn(),
  zadd: vi.fn(),
  zcard: vi.fn(),
  expire: vi.fn(),
  del: vi.fn(),
};

vi.mock("@/lib/redis/client", () => ({
  getCacheInterface: vi.fn(() => Promise.resolve(mockCache)),
}));

describe("Redis Rate Limiter", () => {
  const originalEnv = process.env;
  const now = 1600000000000;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.useRealTimers();
  });

  describe("checkRateLimit", () => {
    it("should allow request if under limit", async () => {
      mockCache.zrangebyscore.mockResolvedValue(["req1", "req2"]); // 2 requests

      const result = await checkRateLimit("user1", { maxRequests: 5 });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(3);
    });

    it("should deny request if over limit", async () => {
      mockCache.zrangebyscore.mockResolvedValue(["req1", "req2", "req3", "req4", "req5"]); // 5 requests

      const result = await checkRateLimit("user1", { maxRequests: 5 });

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.reason).toContain("Rate limit exceeded");
    });

    it("should remove expired entries", async () => {
      mockCache.zrangebyscore.mockResolvedValue([]);

      await checkRateLimit("user1", { windowMs: 1000 });

      expect(mockCache.zremrangebyscore).toHaveBeenCalledWith(
        expect.stringContaining("user1"),
        0,
        now - 1000
      );
    });

    it("should handle fail closed", async () => {
      mockCache.zrangebyscore.mockRejectedValue(new Error("Redis down"));

      const result = await checkRateLimit("user1", { failClosed: true });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("unavailable");
    });

    it("should handle fail open (default)", async () => {
      mockCache.zrangebyscore.mockRejectedValue(new Error("Redis down"));

      const result = await checkRateLimit("user1", { maxRequests: 10 });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(10);
    });
  });

  describe("recordRequest", () => {
    it("should record request and set TTL", async () => {
      await recordRequest("user1", { windowMs: 1000 });

      expect(mockCache.zadd).toHaveBeenCalledWith(
        expect.stringContaining("user1"),
        now,
        expect.stringContaining(`${now}:`)
      );

      expect(mockCache.expire).toHaveBeenCalledWith(
        expect.stringContaining("user1"),
        expect.any(Number)
      );
    });
  });

  describe("Transfer Specifics", () => {
    it("checkTransferRateLimitRedis should deny if amount too high", async () => {
      const result = await checkTransferRateLimitRedis("user1", 1000, {
        maxAmountPerTransfer: 500,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Amount exceeds");
      expect(mockCache.zrangebyscore).not.toHaveBeenCalled();
    });

    it("checkTransferRateLimitRedis should check rate limit if amount ok", async () => {
      mockCache.zrangebyscore.mockResolvedValue([]);

      const result = await checkTransferRateLimitRedis("user1", 100);

      expect(result.allowed).toBe(true);
      expect(mockCache.zrangebyscore).toHaveBeenCalled();
    });

    it("recordTransferAttemptRedis should record successful transfer", async () => {
      await recordTransferAttemptRedis("user1", 100, true);

      // Should record rate limit
      expect(mockCache.zadd).toHaveBeenCalledWith(
        expect.stringContaining("transfer:user1"),
        now,
        expect.any(String)
      );

      // Should log transfer details
      expect(mockCache.zadd).toHaveBeenCalledWith(
        expect.stringContaining("transfer:log:user1"),
        now,
        expect.stringContaining('"success":true')
      );
    });

    it("checkTransferRateLimitRedis should deny when Redis is down (failClosed)", async () => {
      // Simulate Redis failure — zrangebyscore throws
      mockCache.zrangebyscore.mockRejectedValue(new Error("Redis connection refused"));

      const result = await checkTransferRateLimitRedis("user1", 100);

      // Transfer rate limiter uses failClosed: true, so Redis failure = denied
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("unavailable");
    });

    it("recordTransferAttemptRedis should NOT record failed transfer for rate limiting", async () => {
      await recordTransferAttemptRedis("user1", 100, false);

      // Should NOT record rate limit
      expect(mockCache.zadd).not.toHaveBeenCalledWith(
        expect.stringContaining("transfer:user1"),
        expect.anything(),
        expect.anything()
      );

      // BUT should log transfer details
      expect(mockCache.zadd).toHaveBeenCalledWith(
        expect.stringContaining("transfer:log:user1"),
        now,
        expect.stringContaining('"success":false')
      );
    });
  });

  describe("Admin Helpers", () => {
    it("resetRateLimit should delete key", async () => {
      await resetRateLimit("user1");
      expect(mockCache.del).toHaveBeenCalledWith(expect.stringContaining("user1"));
    });

    it("getRateLimitUsage should return counts", async () => {
      mockCache.zcard.mockResolvedValue(5);

      const usage = await getRateLimitUsage("user1");

      expect(usage.count).toBe(5);
      expect(usage.max).toBe(20); // Default max
    });
  });
});
