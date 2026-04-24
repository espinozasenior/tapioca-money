import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// 1. Define mock implementation first
const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }));

// 2. Mock modules
vi.mock("@neondatabase/serverless", () => ({
  neon: () => mockSql,
}));

vi.mock("@/lib/auth/middleware", () => ({
  requireAuthForAddress: vi.fn(),
  unauthorizedResponse: vi
    .fn()
    .mockReturnValue({ status: 401, json: async () => ({ error: "Unauthorized" }) }),
  forbiddenResponse: vi
    .fn()
    .mockReturnValue({ status: 403, json: async () => ({ error: "Forbidden" }) }),
}));

vi.mock("@/lib/security/session-encryption", () => ({
  decryptAuthorization: vi.fn(),
}));

vi.mock("@/lib/zerodev/transfer-session", () => ({
  validateTransferSession: vi.fn(),
  TRANSFER_PERMISSIONS_VERSION: 2,
}));

vi.mock("@/lib/redis/rate-limiter", () => ({
  checkTransferRateLimitRedis: vi.fn(),
  recordTransferAttemptRedis: vi.fn(),
  checkAndRecordRateLimit: vi.fn(),
}));

vi.mock("@/lib/redis/idempotency", () => ({
  withIdempotencyKey: vi.fn((_userId: string, _key: string, fn: () => Promise<any>) => fn()),
  IdempotencyBusyError: class extends Error {
    code = "IDEMPOTENCY_BUSY";
  },
}));

vi.mock("@/lib/zerodev/transfer-executor", () => ({
  validateTransferParams: vi.fn(),
  executeUserPaidTransfer: vi.fn(),
}));

vi.mock("@/lib/zerodev/transfer-recipient-validator", () => ({
  validateTransferRecipient: vi.fn(),
}));

vi.mock("@/lib/config", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config")>("@/lib/config");
  return {
    ...actual,
    isUsdcPaymasterEnabledServer: () => true,
  };
});

// 3. Import module under test
import { POST } from "@/app/api/transfer/send/route";
import { requireAuthForAddress } from "@/lib/auth/middleware";
import { decryptAuthorization } from "@/lib/security/session-encryption";
import { validateTransferSession } from "@/lib/zerodev/transfer-session";
import { checkTransferRateLimitRedis, checkAndRecordRateLimit } from "@/lib/redis/rate-limiter";
import { validateTransferParams, executeUserPaidTransfer } from "@/lib/zerodev/transfer-executor";
import { validateTransferRecipient } from "@/lib/zerodev/transfer-recipient-validator";

describe("Transfer Send API", () => {
  const mockUserAddress = "0xuser" as `0x${string}`;
  const mockRecipient = "0xrecipient" as `0x${string}`;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default happy path mocks
    (requireAuthForAddress as any).mockResolvedValue({ authenticated: true, userId: "privy:1" });

    mockSql.mockResolvedValue([
      {
        id: "user1",
        transfer_authorization: "encrypted_auth_string",
      },
    ]);

    (decryptAuthorization as any).mockReturnValue({
      smartAccountAddress: "0xsmart",
      serializedAccount: "base64SerializedAccount",
      permissionsVersion: 2,
    });

    (validateTransferSession as any).mockReturnValue({ valid: true });

    (validateTransferRecipient as any).mockReturnValue({ valid: true });

    (checkAndRecordRateLimit as any).mockResolvedValue({ allowed: true });

    (checkTransferRateLimitRedis as any).mockResolvedValue({ allowed: true, remaining: 5 });

    (validateTransferParams as any).mockReturnValue({ valid: true });

    (executeUserPaidTransfer as any).mockResolvedValue({
      success: true,
      hash: "0xtxhash",
      userOpHash: "0xopHash",
      feePaid: "0.03",
    });
  });

  const createRequest = (body: any) => {
    return new NextRequest("http://localhost/api/transfer/send", {
      method: "POST",
      body: JSON.stringify(body),
    });
  };

  it("should return 400 if fields missing", async () => {
    const req = createRequest({ address: mockUserAddress }); // missing recipient/amount
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("should return 401 if unauthorized", async () => {
    (requireAuthForAddress as any).mockResolvedValue({
      authenticated: false,
      error: "Unauthorized",
    });

    const req = createRequest({ address: mockUserAddress, recipient: mockRecipient, amount: "10" });
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it("should return 403 if address does not belong to authenticated user", async () => {
    (requireAuthForAddress as any).mockResolvedValue({
      authenticated: false,
      error: "Address does not belong to authenticated user",
    });

    const req = createRequest({ address: mockUserAddress, recipient: mockRecipient, amount: "10" });
    const res = await POST(req);

    expect(res.status).toBe(403);
  });

  it("should return 404 if user not found", async () => {
    mockSql.mockResolvedValue([]); // No user found

    const req = createRequest({ address: mockUserAddress, recipient: mockRecipient, amount: "10" });
    const res = await POST(req);

    expect(res.status).toBe(404);
  });

  it("should return 409 SESSION_UPGRADE_REQUIRED when transfer_authorization is null (new user)", async () => {
    mockSql.mockResolvedValue([{ id: "user1", transfer_authorization: null }]);

    const req = createRequest({ address: mockUserAddress, recipient: mockRecipient, amount: "10" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("SESSION_UPGRADE_REQUIRED");
  });

  it("should return 409 SESSION_UPGRADE_REQUIRED for v1 legacy sessions", async () => {
    (decryptAuthorization as any).mockReturnValue({
      smartAccountAddress: "0xsmart",
      serializedAccount: "legacySerialized",
      permissionsVersion: 1, // legacy
    });

    const req = createRequest({ address: mockUserAddress, recipient: mockRecipient, amount: "10" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("SESSION_UPGRADE_REQUIRED");
  });

  it("should return 409 SESSION_UPGRADE_REQUIRED when permissionsVersion is missing (treated as v1)", async () => {
    (decryptAuthorization as any).mockReturnValue({
      smartAccountAddress: "0xsmart",
      serializedAccount: "legacySerialized",
      // no permissionsVersion field — must default to v1
    });

    const req = createRequest({ address: mockUserAddress, recipient: mockRecipient, amount: "10" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("SESSION_UPGRADE_REQUIRED");
  });

  it("should return 401 SESSION_EXPIRED when session validation fails", async () => {
    (validateTransferSession as any).mockReturnValue({ valid: false, reason: "Session expired" });

    const req = createRequest({ address: mockUserAddress, recipient: mockRecipient, amount: "10" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe("SESSION_EXPIRED");
  });

  it("should return 429 RATE_LIMIT_EXCEEDED when daily rate limit hit", async () => {
    (checkTransferRateLimitRedis as any).mockResolvedValue({
      allowed: false,
      remaining: 0,
      reason: "Too many",
    });

    const req = createRequest({ address: mockUserAddress, recipient: mockRecipient, amount: "10" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.code).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("should return 400 INVALID_PARAMS when param validation fails", async () => {
    (validateTransferParams as any).mockReturnValue({ valid: false, error: "Invalid amount" });

    const req = createRequest({ address: mockUserAddress, recipient: mockRecipient, amount: "10" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("INVALID_PARAMS");
  });

  it("should execute transfer and return success with feePaid", async () => {
    const req = createRequest({ address: mockUserAddress, recipient: mockRecipient, amount: "10" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.hash).toBe("0xtxhash");
    expect(body.feePaid).toBe("0.03");
    expect(executeUserPaidTransfer).toHaveBeenCalled();
  });

  it("should propagate bundler error message on execution failure", async () => {
    (executeUserPaidTransfer as any).mockResolvedValue({
      success: false,
      error: "Bundler error",
    });

    const req = createRequest({ address: mockUserAddress, recipient: mockRecipient, amount: "10" });
    const res = await POST(req);
    const body = await res.json();

    // Generic failure → 500 with TRANSFER_FAILED code; AA31 would be 503 PAYMASTER_UNAVAILABLE.
    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Bundler error");
    expect(body.code).toBe("TRANSFER_FAILED");
  });

  it("should map AA31 bundler errors to 503 PAYMASTER_UNAVAILABLE", async () => {
    (executeUserPaidTransfer as any).mockResolvedValue({
      success: false,
      error: "UserOp failed: AA31 paymaster deposit too low",
    });

    const req = createRequest({ address: mockUserAddress, recipient: mockRecipient, amount: "10" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.code).toBe("PAYMASTER_UNAVAILABLE");
  });
});
