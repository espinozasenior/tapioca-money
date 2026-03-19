import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
}));

vi.mock("@/lib/redis/rate-limiter", () => ({
  checkTransferRateLimitRedis: vi.fn(),
  recordTransferAttemptRedis: vi.fn(),
  checkAndRecordRateLimit: vi.fn(),
}));

vi.mock("@/lib/zerodev/transfer-executor", () => ({
  validateTransferParams: vi.fn(),
  executeGaslessTransfer: vi.fn(),
}));

vi.mock("@/lib/zerodev/transfer-recipient-validator", () => ({
  validateTransferRecipient: vi.fn(),
}));

// 3. Import module under test
import { POST } from "@/app/api/transfer/send/route";
import { requireAuthForAddress } from "@/lib/auth/middleware";
import { decryptAuthorization } from "@/lib/security/session-encryption";
import { validateTransferSession } from "@/lib/zerodev/transfer-session";
import { checkTransferRateLimitRedis, checkAndRecordRateLimit } from "@/lib/redis/rate-limiter";
import { validateTransferParams, executeGaslessTransfer } from "@/lib/zerodev/transfer-executor";
import { validateTransferRecipient } from "@/lib/zerodev/transfer-recipient-validator";

describe("Transfer Send API", () => {
  const mockUserAddress = "0xuser" as `0x${string}`;
  const mockRecipient = "0xrecipient" as `0x${string}`;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default happy path mocks
    (requireAuthForAddress as any).mockResolvedValue({ authenticated: true });

    mockSql.mockResolvedValue([
      {
        id: "user1",
        transfer_authorization: "encrypted_auth_string",
      },
    ]);

    (decryptAuthorization as any).mockReturnValue({
      smartAccountAddress: "0xsmart",
      serializedAccount: "base64SerializedAccount",
      // Legacy field also present for backward compat
      sessionPrivateKey: "0xpriv",
    });

    (validateTransferSession as any).mockReturnValue({ valid: true });

    (validateTransferRecipient as any).mockReturnValue({ valid: true });

    (checkAndRecordRateLimit as any).mockResolvedValue({ allowed: true });

    (checkTransferRateLimitRedis as any).mockResolvedValue({ allowed: true, remaining: 5 });

    (validateTransferParams as any).mockReturnValue({ valid: true });

    (executeGaslessTransfer as any).mockResolvedValue({
      success: true,
      hash: "0xtxhash",
      userOpHash: "0xopHash",
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

  it("should return 403 if gasless not enabled", async () => {
    mockSql.mockResolvedValue([{ id: "user1", transfer_authorization: null }]);

    const req = createRequest({ address: mockUserAddress, recipient: mockRecipient, amount: "10" });
    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(
      expect.objectContaining({ error: expect.stringContaining("not enabled") })
    );
  });

  it("should return 403 if session invalid", async () => {
    (validateTransferSession as any).mockReturnValue({ valid: false, reason: "Expired" });

    const req = createRequest({ address: mockUserAddress, recipient: mockRecipient, amount: "10" });
    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(
      expect.objectContaining({ error: "Transfer session invalid or expired" })
    );
  });

  it("should return 429 if rate limit exceeded", async () => {
    (checkTransferRateLimitRedis as any).mockResolvedValue({
      allowed: false,
      remaining: 0,
      reason: "Too many",
    });

    const req = createRequest({ address: mockUserAddress, recipient: mockRecipient, amount: "10" });
    const res = await POST(req);

    expect(res.status).toBe(429);
  });

  it("should return 400 if params invalid", async () => {
    (validateTransferParams as any).mockReturnValue({ valid: false, error: "Invalid amount" });

    const req = createRequest({ address: mockUserAddress, recipient: mockRecipient, amount: "10" });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it("should execute transfer and return success", async () => {
    const req = createRequest({ address: mockUserAddress, recipient: mockRecipient, amount: "10" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.hash).toBe("0xtxhash");
    expect(executeGaslessTransfer).toHaveBeenCalled();
    // Verify DB insert for success
    // The first call is SELECT, second is INSERT
    expect(mockSql).toHaveBeenCalledTimes(2);
    const insertCall = mockSql.mock.calls[1];
    expect(insertCall[0][0]).toContain("INSERT INTO agent_actions");
    expect(insertCall[1]).toBe("user1"); // user_id
    expect(insertCall[2]).toBe("10"); // amount
    expect(insertCall[3]).toBe("0xtxhash"); // tx_hash
  });

  it("should handle execution failure", async () => {
    (executeGaslessTransfer as any).mockResolvedValue({
      success: false,
      error: "Bundler error",
    });

    const req = createRequest({ address: mockUserAddress, recipient: mockRecipient, amount: "10" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Bundler error");
  });
});
