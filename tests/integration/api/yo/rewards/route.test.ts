import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Hoisted mocks
const { mockCheckAndRecord } = vi.hoisted(() => ({
  mockCheckAndRecord: vi.fn(),
}));

vi.mock("@/lib/yo/rewards-client", () => ({
  fetchClaimableRewards: vi.fn().mockResolvedValue({
    hasClaimable: true,
    totalClaimableFormatted: "5.0",
  }),
}));

vi.mock("@/lib/redis/rate-limiter", () => ({
  checkAndRecordRateLimit: mockCheckAndRecord,
}));

import { GET } from "@/app/api/yo/rewards/route";

describe("GET /api/yo/rewards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: rate limit allows
    mockCheckAndRecord.mockResolvedValue({
      allowed: true,
      remaining: 29,
      resetTime: Date.now() + 60_000,
    });
  });

  it("should return rewards for valid address", async () => {
    const req = new NextRequest(
      "http://localhost/api/yo/rewards?address=0xaabbccdd00112233445566778899aabbccddeeff"
    );

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.rewards).toBeDefined();
  });

  it("should return 400 for missing address", async () => {
    const req = new NextRequest("http://localhost/api/yo/rewards");

    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("should return 400 for invalid address format", async () => {
    const req = new NextRequest("http://localhost/api/yo/rewards?address=not-an-address");

    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  // Finding #3: Rate limiting
  it("should return 429 when rate limit exceeded", async () => {
    mockCheckAndRecord.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetTime: Date.now() + 60_000,
      retryAfter: 30,
      reason: "Rate limit exceeded. Try again in 30 seconds.",
    });

    const req = new NextRequest(
      "http://localhost/api/yo/rewards?address=0xaabbccdd00112233445566778899aabbccddeeff"
    );

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.error).toContain("Rate limit");
  });

  it("should call rate limiter with address as identifier", async () => {
    const req = new NextRequest(
      "http://localhost/api/yo/rewards?address=0xaabbccdd00112233445566778899aabbccddeeff"
    );

    await GET(req);

    expect(mockCheckAndRecord).toHaveBeenCalledWith(
      "0xaabbccdd00112233445566778899aabbccddeeff",
      expect.objectContaining({
        maxRequests: 30,
        windowMs: 60_000,
        keyPrefix: "yo-rewards",
      })
    );
  });
});
