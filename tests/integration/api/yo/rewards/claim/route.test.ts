import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Hoisted mocks
const { mockSql, mockAcquireUserLock, mockReleaseUserLock } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockAcquireUserLock: vi.fn(),
  mockReleaseUserLock: vi.fn(),
}));

vi.mock("@neondatabase/serverless", () => ({
  neon: () => mockSql,
}));

vi.mock("@/lib/auth/middleware", () => ({
  authenticateRequest: vi.fn().mockResolvedValue({
    authenticated: true,
    walletAddress: "0xaabbccdd00112233445566778899aabbccddeeff",
    userId: "user1",
    linkedWallets: [{ address: "0xaabbccdd00112233445566778899aabbccddeeff", type: "wallet" }],
  }),
  unauthorizedResponse: vi.fn(
    (msg: string) => new Response(JSON.stringify({ error: msg }), { status: 401 })
  ),
}));

vi.mock("@/lib/agent/resolve-registration", () => ({
  buildWalletAddresses: vi.fn().mockReturnValue({
    primary: "0xaabbccdd00112233445566778899aabbccddeeff",
  }),
  resolveAndDecryptRegistration: vi.fn().mockResolvedValue({
    ok: true,
    decryptedAuth: { serializedAccount: "mock-serialized" },
    accountAddress: "0xaabbccdd00112233445566778899aabbccddeeff" as `0x${string}`,
    authorizationData: {
      approvedVaults: ["0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae"],
    },
  }),
  verifyVaultApproval: vi.fn().mockReturnValue({ approved: true }),
}));

vi.mock("@/lib/yo/rewards-client", () => ({
  fetchClaimableRewards: vi.fn().mockResolvedValue({
    hasClaimable: true,
    totalClaimableFormatted: "5.0",
    rawChainRewards: { chainId: 8453, rewards: [] },
  }),
}));

vi.mock("@/lib/zerodev/yo-rewards-executor", () => ({
  executeYoRewardsClaim: vi.fn().mockResolvedValue({
    success: true,
    txHash: "0xTxHash",
    userOpHash: "0xOpHash",
  }),
}));

vi.mock("@/lib/redis/yo-cache", () => ({
  invalidateYoRewards: vi.fn(),
}));

vi.mock("@/lib/redis/rate-limiter", () => ({
  incrementUserOpCount: vi.fn(),
}));

vi.mock("@/lib/redis/distributed-lock", () => ({
  acquireUserLock: mockAcquireUserLock,
  releaseUserLock: mockReleaseUserLock,
}));

vi.mock("@/lib/yo/constants", () => ({
  MERKL_DISTRIBUTOR_ADDRESS_BASE: "0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae",
}));

vi.mock("@/lib/config", () => ({
  CHAIN_CONFIG: { chainId: 8453, rpcUrl: "http://localhost" },
}));

import { POST } from "@/app/api/yo/rewards/claim/route";

describe("POST /api/yo/rewards/claim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: lock acquired
    mockAcquireUserLock.mockResolvedValue({ acquired: true, lockId: "lock-123" });
    mockReleaseUserLock.mockResolvedValue(undefined);
    // Default: SQL for audit log
    mockSql.mockResolvedValue([{ id: "user1" }]);
  });

  // Finding #1: No address field needed in body
  it("should succeed without address field in request body", async () => {
    const req = new NextRequest("http://localhost/api/yo/rewards/claim", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.txHash).toBe("0xTxHash");
  });

  it("should not require or validate an address field", async () => {
    // Even sending an address should be irrelevant -- server resolves from auth
    const req = new NextRequest("http://localhost/api/yo/rewards/claim", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  // Finding #4: Distributed lock prevents concurrent claims
  it("should return 409 when lock cannot be acquired", async () => {
    mockAcquireUserLock.mockResolvedValue({ acquired: false });

    const req = new NextRequest("http://localhost/api/yo/rewards/claim", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toContain("already in progress");
  });

  it("should release lock after successful claim", async () => {
    const req = new NextRequest("http://localhost/api/yo/rewards/claim", {
      method: "POST",
      body: JSON.stringify({}),
    });

    await POST(req);

    expect(mockReleaseUserLock).toHaveBeenCalledWith(
      "0xaabbccdd00112233445566778899aabbccddeeff",
      "lock-123"
    );
  });

  it("should release lock even when claim fails", async () => {
    const { executeYoRewardsClaim } = await import("@/lib/zerodev/yo-rewards-executor");
    (executeYoRewardsClaim as any).mockResolvedValueOnce({
      success: false,
      error: "Claim failed",
    });

    const req = new NextRequest("http://localhost/api/yo/rewards/claim", {
      method: "POST",
      body: JSON.stringify({}),
    });

    await POST(req);

    expect(mockReleaseUserLock).toHaveBeenCalledWith(
      "0xaabbccdd00112233445566778899aabbccddeeff",
      "lock-123"
    );
  });
});
