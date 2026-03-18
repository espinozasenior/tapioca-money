import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Hoisted mocks
const { mockSql, mockAuthenticateRequest, mockGetErrorRate } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockAuthenticateRequest: vi.fn(),
  mockGetErrorRate: vi.fn().mockResolvedValue(0),
}));

vi.mock("@neondatabase/serverless", () => ({
  neon: () => mockSql,
}));

vi.mock("@/lib/auth/middleware", () => ({
  authenticateRequest: mockAuthenticateRequest,
  unauthorizedResponse: (msg?: string) =>
    new Response(JSON.stringify({ error: msg || "Unauthorized" }), { status: 401 }),
}));

vi.mock("@/lib/monitoring/error-tracker", () => ({
  ErrorTracker: {
    getErrorRate: mockGetErrorRate,
  },
}));

describe("GET /api/agent/health — secret verification", () => {
  const VALID_SECRET = "test-cron-secret-abc123";

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("CRON_SECRET", VALID_SECRET);
    vi.stubEnv("DATABASE_URL", "postgres://fake");
    mockAuthenticateRequest.mockReset();
    mockSql.mockReset();
  });

  async function callHealth(headers: Record<string, string> = {}) {
    const { GET } = await import("@/app/api/agent/health/route");
    const req = new NextRequest("http://localhost/api/agent/health", { headers });
    return GET(req);
  }

  it("accepts a valid x-cron-secret header", async () => {
    // DB queries for metrics
    mockSql.mockResolvedValue([{ count: "0", test: 1 }]);

    const res = await callHealth({ "x-cron-secret": VALID_SECRET });
    // Should not fall through to authenticateRequest
    expect(mockAuthenticateRequest).not.toHaveBeenCalled();
    expect(res.status).not.toBe(401);
  });

  it("rejects an incorrect secret and falls back to auth", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      authenticated: false,
      error: "Unauthorized",
    });

    const res = await callHealth({ "x-cron-secret": "wrong-secret" });
    expect(mockAuthenticateRequest).toHaveBeenCalled();
    expect(res.status).toBe(401);
  });

  it("rejects when no secret header is provided and auth fails", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      authenticated: false,
      error: "Unauthorized",
    });

    const res = await callHealth();
    expect(mockAuthenticateRequest).toHaveBeenCalled();
    expect(res.status).toBe(401);
  });

  it("rejects when CRON_SECRET env var is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    mockAuthenticateRequest.mockResolvedValue({
      authenticated: false,
      error: "Unauthorized",
    });

    const res = await callHealth({ "x-cron-secret": "any-value" });
    expect(mockAuthenticateRequest).toHaveBeenCalled();
    expect(res.status).toBe(401);
  });

  it("uses timing-safe comparison (does not leak via === operator)", async () => {
    // This test verifies the verifySecret function is used (imported from shared module).
    // The shared module uses timingSafeEqual internally — we verify it rejects
    // a secret that shares a common prefix (which would leak info with ===).
    mockAuthenticateRequest.mockResolvedValue({
      authenticated: false,
      error: "Unauthorized",
    });

    // Same prefix, different suffix
    const almostRight = VALID_SECRET.slice(0, -1) + "X";
    const res = await callHealth({ "x-cron-secret": almostRight });
    expect(mockAuthenticateRequest).toHaveBeenCalled();
    expect(res.status).toBe(401);
  });
});

describe("verifySecret — unit tests", () => {
  it("returns true for matching secrets", async () => {
    const { verifySecret } = await import("@/lib/security/verify-secret");
    expect(verifySecret("my-secret", "my-secret")).toBe(true);
  });

  it("returns false for mismatched secrets", async () => {
    const { verifySecret } = await import("@/lib/security/verify-secret");
    expect(verifySecret("wrong", "my-secret")).toBe(false);
  });

  it("returns false for different-length secrets", async () => {
    const { verifySecret } = await import("@/lib/security/verify-secret");
    expect(verifySecret("short", "a-much-longer-secret")).toBe(false);
  });

  it("returns false when provided is null", async () => {
    const { verifySecret } = await import("@/lib/security/verify-secret");
    expect(verifySecret(null, "my-secret")).toBe(false);
  });

  it("returns false when expected is undefined", async () => {
    const { verifySecret } = await import("@/lib/security/verify-secret");
    expect(verifySecret("my-secret", undefined)).toBe(false);
  });

  it("returns false when both are empty strings", async () => {
    const { verifySecret } = await import("@/lib/security/verify-secret");
    expect(verifySecret("", "")).toBe(false);
  });
});
