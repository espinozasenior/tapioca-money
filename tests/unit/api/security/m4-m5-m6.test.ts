/**
 * Tests for M-4, M-5, M-6 security fixes
 *
 * M-4: Verbose error messages not leaked in production
 * M-5: BigInt validation on shares parameter in /api/vault/redeem
 * M-6: GET /api/transfer/register requires authentication
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

vi.mock("@/lib/zerodev/transfer-session", () => ({
  createTransferSessionKey: vi.fn(),
  validateTransferSession: vi.fn().mockReturnValue({ valid: true }),
}));

vi.mock("@/lib/agent/resolve-registration", () => ({
  buildWalletAddresses: vi
    .fn()
    .mockReturnValue({ primaryAddress: "0xabc", allAddresses: ["0xabc"] }),
  resolveAndDecryptRegistration: vi.fn().mockResolvedValue({
    ok: true,
    decryptedAuth: { serializedAccount: "mock-serialized", type: "zerodev-7702-session" },
    accountAddress: "0xabc123def456abc123def456abc123def456abc1" as `0x${string}`,
    authorizationData: { approvedVaults: ["0x1234567890123456789012345678901234567890"] },
  }),
  verifyVaultApproval: vi.fn().mockReturnValue({ approved: true }),
}));

vi.mock("@/lib/zerodev/vault-executor", () => ({
  executeVaultRedeem: vi.fn().mockResolvedValue({ success: true, txHash: "0xabc" }),
}));

vi.mock("@/lib/zerodev/yo-vault-executor", () => ({
  executeYoVaultRedeem: vi.fn().mockResolvedValue({ success: true, txHash: "0xabc" }),
}));

vi.mock("@/lib/redis/rate-limiter", () => ({
  incrementUserOpCount: vi.fn().mockResolvedValue(undefined),
  checkTransferRateLimitRedis: vi.fn().mockResolvedValue({ allowed: true, remaining: 5 }),
  recordTransferAttemptRedis: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────
import { requireAuthForAddress, authenticateRequest } from "@/lib/auth/middleware";

// ── Helpers ────────────────────────────────────────────────────────────
function createRequest(
  url: string,
  method: string,
  body?: any,
  headers?: Record<string, string>
): NextRequest {
  const nextUrl = new URL(url);
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
const MOCK_VAULT = "0x1234567890123456789012345678901234567890";

// ── M-5: BigInt validation on shares ──────────────────────────────────
describe("M-5: POST /api/vault/redeem validates shares parameter", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSql.mockResolvedValue([{ id: 1, authorization_7702: {} }]);

    (authenticateRequest as any).mockResolvedValue({
      authenticated: true,
      userId: "user-1",
      walletAddress: MOCK_ADDRESS,
      allWalletAddresses: [MOCK_ADDRESS],
    });

    const mod = await import("@/app/api/vault/redeem/route");
    POST = mod.POST;
  });

  it("rejects negative shares", async () => {
    const req = createRequest("http://localhost/api/vault/redeem", "POST", {
      vaultAddress: MOCK_VAULT,
      shares: "-100",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/non-negative integer/i);
  });

  it("rejects decimal shares", async () => {
    const req = createRequest("http://localhost/api/vault/redeem", "POST", {
      vaultAddress: MOCK_VAULT,
      shares: "100.5",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/non-negative integer/i);
  });

  it("rejects shares with non-digit characters", async () => {
    const req = createRequest("http://localhost/api/vault/redeem", "POST", {
      vaultAddress: MOCK_VAULT,
      shares: "abc123",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/non-negative integer/i);
  });

  it("rejects shares exceeding 78 digits (uint256 max)", async () => {
    const hugeNumber = "1" + "0".repeat(78); // 79 digits
    const req = createRequest("http://localhost/api/vault/redeem", "POST", {
      vaultAddress: MOCK_VAULT,
      shares: hugeNumber,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/uint256/i);
  });

  it("rejects zero shares", async () => {
    const req = createRequest("http://localhost/api/vault/redeem", "POST", {
      vaultAddress: MOCK_VAULT,
      shares: "0",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/greater than 0/i);
  });

  it("accepts valid shares (small number)", async () => {
    const req = createRequest("http://localhost/api/vault/redeem", "POST", {
      vaultAddress: MOCK_VAULT,
      shares: "1000000",
    });
    const res = await POST(req);
    // Should not be a 400 validation error (may be 200 or 500 depending on mocks)
    expect(res.status).not.toBe(400);
  });

  it("accepts valid shares at uint256 boundary (78 digits)", async () => {
    const maxUint256Digits = "1" + "0".repeat(77); // 78 digits, valid
    const req = createRequest("http://localhost/api/vault/redeem", "POST", {
      vaultAddress: MOCK_VAULT,
      shares: maxUint256Digits,
    });
    const res = await POST(req);
    expect(res.status).not.toBe(400);
  });
});

// ── M-6: GET /api/transfer/register requires auth ─────────────────────
describe("M-6: GET /api/transfer/register requires authentication", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSql.mockResolvedValue([
      {
        transfer_authorization: {
          smartAccountAddress: "0xsmart",
          sessionKeyAddress: "0xsession",
          expiry: Math.floor(Date.now() / 1000) + 3600,
          createdAt: Date.now(),
        },
      },
    ]);

    const mod = await import("@/app/api/transfer/register/route");
    GET = mod.GET;
  });

  it("returns 401 when no Authorization header is provided", async () => {
    (requireAuthForAddress as any).mockResolvedValue({
      authenticated: false,
      error: "Missing or invalid Authorization header",
    });

    const req = createRequest(
      `http://localhost/api/transfer/register?address=${MOCK_ADDRESS}`,
      "GET"
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when querying a different user's address", async () => {
    (requireAuthForAddress as any).mockResolvedValue({
      authenticated: false,
      error: "Address does not belong to authenticated user",
    });

    const req = createRequest(
      `http://localhost/api/transfer/register?address=${MOCK_ADDRESS}`,
      "GET"
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns session data when authenticated for own address", async () => {
    (requireAuthForAddress as any).mockResolvedValue({
      authenticated: true,
      userId: "user-1",
      walletAddress: MOCK_ADDRESS,
      allWalletAddresses: [MOCK_ADDRESS],
    });

    const req = createRequest(
      `http://localhost/api/transfer/register?address=${MOCK_ADDRESS}`,
      "GET"
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isEnabled).toBe(true);
  });
});

// ── M-4: Error messages not leaked in production ──────────────────────
describe("M-4: Error messages not leaked in production catch blocks", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    (process.env as any).NODE_ENV = originalEnv;
  });

  it("vault/redeem catch block does not leak error.message in production", async () => {
    (process.env as any).NODE_ENV = "production";

    (authenticateRequest as any).mockRejectedValue(new Error("secret DB connection string leaked"));

    const mod = await import("@/app/api/vault/redeem/route");
    const req = createRequest("http://localhost/api/vault/redeem", "POST", {
      vaultAddress: MOCK_VAULT,
      shares: "1000",
    });
    const res = await mod.POST(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Internal server error");
    expect(json.details).toBeUndefined();
    expect(JSON.stringify(json)).not.toContain("secret DB connection string leaked");
  });

  it("transfer/send catch block does not leak error.message in production", async () => {
    (process.env as any).NODE_ENV = "production";

    // Force a throw in the route handler by making json() throw
    const mod = await import("@/app/api/transfer/send/route");
    const badReq = new NextRequest("http://localhost/api/transfer/send", {
      method: "POST",
      body: "not-json{{{",
      headers: { "Content-Type": "application/json" },
    });
    const res = await mod.POST(badReq);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.details).toBeUndefined();
  });
});
