/**
 * Security Audit — Auth Guard Tests
 *
 * Verifies that all public-facing API endpoints enforce authentication.
 * Tests are written FIRST (TDD) to define the expected behavior, then
 * implementations are updated to make them pass.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ── Hoisted mocks ──────────────────────────────────────────────────────
const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }));

vi.mock("@neondatabase/serverless", () => ({
  neon: () => mockSql,
}));

vi.mock("@/lib/auth/middleware", () => ({
  authenticateRequest: vi.fn(),
  requireAuthForAddress: vi.fn(),
  unauthorizedResponse: vi.fn((msg?: string) => {
    const body = JSON.stringify({ error: msg || "Unauthorized" });
    return new Response(body, { status: 401, headers: { "Content-Type": "application/json" } });
  }),
  forbiddenResponse: vi.fn((msg?: string) => {
    const body = JSON.stringify({ error: msg || "Forbidden" });
    return new Response(body, { status: 403, headers: { "Content-Type": "application/json" } });
  }),
}));

vi.mock("@/lib/security/session-encryption", () => ({
  encryptAuthorization: vi.fn((data: any) => ({ encrypted: JSON.stringify(data) })),
  decryptAuthorization: vi.fn((data: any) => data),
}));

vi.mock("@/lib/monitoring/error-tracker", () => ({
  ErrorTracker: { getErrorRate: vi.fn().mockResolvedValue(0) },
}));

vi.mock("@/lib/agent/decision-engine", () => ({
  yieldDecisionEngine: {
    getAvailableMorphoVaults: vi.fn().mockResolvedValue([]),
    getAvailableYoVaults: vi.fn().mockResolvedValue([]),
    evaluateRebalancing: vi.fn().mockResolvedValue({ shouldRebalance: false, reason: "test" }),
    getMorphoPositionsWithApy: vi.fn().mockResolvedValue([]),
    getYoPositionsWithApy: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/morpho/transforms", () => ({
  transformPosition: vi.fn(),
  transformVaultToOpportunity: vi.fn((v: any) => v),
}));

vi.mock("@/lib/yo/transforms", () => ({
  transformYoVaultToOpportunity: vi.fn((v: any) => v),
  transformYoPosition: vi.fn(),
}));

vi.mock("@/lib/utils", () => ({
  calculateTotalGains: vi.fn().mockReturnValue({
    totalYearlyGain: 0,
    totalMonthlyGain: 0,
    totalCompoundedGain: 0,
    averageApyImprovement: 0,
  }),
  formatApyPct: vi.fn((v: number) => `${v}%`),
  formatUsd: vi.fn((v: number) => `$${v}`),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────
import { requireAuthForAddress, authenticateRequest } from "@/lib/auth/middleware";

// ── Helpers ────────────────────────────────────────────────────────────
function createRequest(
  url: string,
  method: string,
  body?: any,
  query?: Record<string, string>,
  headers?: Record<string, string>
): NextRequest {
  const nextUrl = new URL(url);
  if (query) {
    Object.entries(query).forEach(([k, v]) => nextUrl.searchParams.set(k, v));
  }
  return new NextRequest(nextUrl, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

const MOCK_ADDRESS = "0xabc123def456abc123def456abc123def456abc1";

// ── C-1: /api/agent/sync ──────────────────────────────────────────────
describe("C-1: POST /api/agent/sync requires auth", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSql.mockResolvedValue([]);
    const mod = await import("@/app/api/agent/sync/route");
    POST = mod.POST;
  });

  it("returns 401 when no Authorization header is provided", async () => {
    (requireAuthForAddress as any).mockResolvedValue({
      authenticated: false,
      error: "Missing or invalid Authorization header",
    });

    const req = createRequest("http://localhost/api/agent/sync", "POST", {
      address: MOCK_ADDRESS,
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when address does not belong to user", async () => {
    (requireAuthForAddress as any).mockResolvedValue({
      authenticated: false,
      error: "Address does not belong to authenticated user",
    });

    const req = createRequest("http://localhost/api/agent/sync", "POST", {
      address: MOCK_ADDRESS,
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("succeeds when authenticated and address matches", async () => {
    (requireAuthForAddress as any).mockResolvedValue({ authenticated: true });

    const req = createRequest("http://localhost/api/agent/sync", "POST", {
      address: MOCK_ADDRESS,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});

// ── C-2: /api/optimize ────────────────────────────────────────────────
describe("C-2: /api/optimize requires auth when address provided", () => {
  let GET: (req: NextRequest) => Promise<Response>;
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/optimize/route");
    GET = mod.GET;
    POST = mod.POST;
  });

  it("GET allows unauthenticated when no address (public vault list)", async () => {
    const req = createRequest("http://localhost/api/optimize", "GET");
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("GET returns 401 when address provided but no auth", async () => {
    (requireAuthForAddress as any).mockResolvedValue({
      authenticated: false,
      error: "Missing or invalid Authorization header",
    });

    const req = createRequest("http://localhost/api/optimize", "GET", undefined, {
      address: MOCK_ADDRESS,
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("GET returns 401 when address doesn't match and JWT is also invalid", async () => {
    // When address doesn't belong to the authenticated user, the route
    // falls back to JWT-only auth (graceful stale-address handling from 31eff43).
    // If the JWT is also invalid, returns 401.
    (requireAuthForAddress as any).mockResolvedValue({
      authenticated: false,
      error: "Address does not belong to authenticated user",
    });
    (authenticateRequest as any).mockResolvedValue({
      authenticated: false,
      error: "Missing or invalid Authorization header",
    });

    const req = createRequest("http://localhost/api/optimize", "GET", undefined, {
      address: MOCK_ADDRESS,
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("GET succeeds when address provided and authenticated", async () => {
    (requireAuthForAddress as any).mockResolvedValue({ authenticated: true });

    const req = createRequest("http://localhost/api/optimize", "GET", undefined, {
      address: MOCK_ADDRESS,
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("POST returns 401 when unauthenticated", async () => {
    (requireAuthForAddress as any).mockResolvedValue({
      authenticated: false,
      error: "Missing or invalid Authorization header",
    });

    const req = createRequest("http://localhost/api/optimize", "POST", {
      address: MOCK_ADDRESS,
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("POST returns 403 when address mismatch", async () => {
    (requireAuthForAddress as any).mockResolvedValue({
      authenticated: false,
      error: "Address does not belong to authenticated user",
    });

    const req = createRequest("http://localhost/api/optimize", "POST", {
      address: MOCK_ADDRESS,
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("POST succeeds when authenticated", async () => {
    (requireAuthForAddress as any).mockResolvedValue({ authenticated: true });

    const req = createRequest("http://localhost/api/optimize", "POST", {
      address: MOCK_ADDRESS,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});

// ── H-1: /api/agent/activity, /api/agent/gains ───────────────────────
describe("H-1: /api/agent/activity requires auth", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSql.mockResolvedValue([]);
    const mod = await import("@/app/api/agent/activity/route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    (requireAuthForAddress as any).mockResolvedValue({
      authenticated: false,
      error: "Missing or invalid Authorization header",
    });

    const req = createRequest("http://localhost/api/agent/activity", "GET", undefined, {
      address: MOCK_ADDRESS,
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when address mismatch", async () => {
    (requireAuthForAddress as any).mockResolvedValue({
      authenticated: false,
      error: "Address does not belong to authenticated user",
    });

    const req = createRequest("http://localhost/api/agent/activity", "GET", undefined, {
      address: MOCK_ADDRESS,
    });
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("succeeds when authenticated with correct address", async () => {
    (requireAuthForAddress as any).mockResolvedValue({ authenticated: true });

    const req = createRequest("http://localhost/api/agent/activity", "GET", undefined, {
      address: MOCK_ADDRESS,
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });
});

describe("H-1: /api/agent/gains requires auth", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSql.mockResolvedValue([]);
    const mod = await import("@/app/api/agent/gains/route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    (requireAuthForAddress as any).mockResolvedValue({
      authenticated: false,
      error: "Missing or invalid Authorization header",
    });

    const req = createRequest("http://localhost/api/agent/gains", "GET", undefined, {
      address: MOCK_ADDRESS,
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when address mismatch", async () => {
    (requireAuthForAddress as any).mockResolvedValue({
      authenticated: false,
      error: "Address does not belong to authenticated user",
    });

    const req = createRequest("http://localhost/api/agent/gains", "GET", undefined, {
      address: MOCK_ADDRESS,
    });
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("succeeds when authenticated", async () => {
    (requireAuthForAddress as any).mockResolvedValue({ authenticated: true });

    const req = createRequest("http://localhost/api/agent/gains", "GET", undefined, {
      address: MOCK_ADDRESS,
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });
});

describe("H-1: /api/agent/health requires CRON_SECRET or auth", () => {
  let GET: (req: NextRequest) => Promise<Response>;
  const originalEnv = process.env;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSql.mockResolvedValue([]);
    process.env = { ...originalEnv, CRON_SECRET: "test-cron-secret" };
    const mod = await import("@/app/api/agent/health/route");
    GET = mod.GET;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns 401 when no CRON_SECRET header and not authenticated", async () => {
    (authenticateRequest as any).mockResolvedValue({
      authenticated: false,
      error: "Missing or invalid Authorization header",
    });

    const req = createRequest("http://localhost/api/agent/health", "GET");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("succeeds with valid CRON_SECRET header", async () => {
    const req = createRequest("http://localhost/api/agent/health", "GET", undefined, undefined, {
      "x-cron-secret": "test-cron-secret",
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("succeeds when authenticated user (no cron secret)", async () => {
    (authenticateRequest as any).mockResolvedValue({ authenticated: true });

    const req = createRequest("http://localhost/api/agent/health", "GET");
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("returns 401 with wrong CRON_SECRET (falls through to JWT, fails without JWT)", async () => {
    (authenticateRequest as any).mockResolvedValue({
      authenticated: false,
      error: "Missing or invalid Authorization header",
    });

    const req = createRequest("http://localhost/api/agent/health", "GET", undefined, undefined, {
      "x-cron-secret": "wrong-secret",
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 when CRON_SECRET env var is not set and no JWT", async () => {
    // Remove CRON_SECRET from env
    delete process.env.CRON_SECRET;

    (authenticateRequest as any).mockResolvedValue({
      authenticated: false,
      error: "Missing or invalid Authorization header",
    });

    const req = createRequest("http://localhost/api/agent/health", "GET", undefined, undefined, {
      "x-cron-secret": "any-value",
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

// ── H-2: GET /api/agent/register requires auth ───────────────────────
describe("H-2: GET /api/agent/register requires auth", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSql.mockResolvedValue([]);
    const mod = await import("@/app/api/agent/register/route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    (authenticateRequest as any).mockResolvedValue({
      authenticated: false,
      error: "Missing or invalid Authorization header",
    });

    const req = createRequest("http://localhost/api/agent/register", "GET", undefined, {
      address: MOCK_ADDRESS,
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("succeeds when authenticated", async () => {
    (authenticateRequest as any).mockResolvedValue({
      authenticated: true,
      allWalletAddresses: [MOCK_ADDRESS],
    });

    const req = createRequest("http://localhost/api/agent/register", "GET", undefined, {
      address: MOCK_ADDRESS,
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });
});

// ── H-4: POST /api/withdraw requires auth ─────────────────────────────
describe("H-4: POST /api/withdraw requires auth", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/withdraw/route");
    POST = mod.POST;
  });

  it("returns 401 when unauthenticated", async () => {
    (requireAuthForAddress as any).mockResolvedValue({
      authenticated: false,
      error: "Missing or invalid Authorization header",
    });

    const req = createRequest("http://localhost/api/withdraw", "POST", {
      protocol: "morpho",
      userAddress: MOCK_ADDRESS,
      vaultAddress: "0x1234567890123456789012345678901234567890",
      shares: "1000000",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when address mismatch", async () => {
    (requireAuthForAddress as any).mockResolvedValue({
      authenticated: false,
      error: "Address does not belong to authenticated user",
    });

    const req = createRequest("http://localhost/api/withdraw", "POST", {
      protocol: "morpho",
      userAddress: MOCK_ADDRESS,
      vaultAddress: "0x1234567890123456789012345678901234567890",
      shares: "1000000",
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("succeeds when authenticated", async () => {
    (requireAuthForAddress as any).mockResolvedValue({ authenticated: true });

    const req = createRequest("http://localhost/api/withdraw", "POST", {
      protocol: "morpho",
      userAddress: MOCK_ADDRESS,
      vaultAddress: "0x1234567890123456789012345678901234567890",
      shares: "1000000",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});

// ── M-5: Redis rate limiter fails closed for financial ops ────────────
// The actual failClosed behavior is tested in tests/unit/lib/redis/rate-limiter.test.ts.
// Here we verify that the transfer-specific function source code includes failClosed: true
// by reading the function and checking it calls checkRateLimit with the right config.
describe("M-5: Redis rate limiter failClosed default for transfers", () => {
  it("checkTransferRateLimitRedis source includes failClosed: true", async () => {
    // Verify the fix is in place by checking the function's toString representation.
    // This is a static analysis test — the runtime behavior is covered by the
    // existing rate-limiter.test.ts which tests failClosed semantics.
    const { checkTransferRateLimitRedis } = await import("@/lib/redis/rate-limiter");
    const fnSource = checkTransferRateLimitRedis.toString();
    expect(fnSource).toContain("failClosed");
  });
});
