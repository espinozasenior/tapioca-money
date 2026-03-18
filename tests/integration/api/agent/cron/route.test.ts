import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// 1. Define mock implementation first (before any imports that use it)
const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }));

// 2. Mock the module using the hoisted variable
vi.mock("@neondatabase/serverless", () => ({
  neon: () => mockSql,
}));

// Must be imported AFTER mocks to ensure process.env is set or mocks are applied if needed
import { POST } from "@/app/api/agent/cron/route";

vi.mock("@/lib/agent/decision-engine", () => ({
  yieldDecisionEngine: {
    evaluateRebalancing: vi.fn().mockResolvedValue({
      shouldRebalance: true,
      reason: "Better APY found",
      currentVault: {
        address: "0xold",
        name: "Old Vault",
        apy: 0.05,
        shares: "100",
        assets: "1000000",
      },
      targetVault: { address: "0xnew", name: "New Vault", apy: 0.1 },
      apyImprovement: 0.05,
      estimatedAnnualGain: 50,
    }),
    getAvailableMorphoVaults: vi.fn().mockResolvedValue([]),
    getAvailableYoVaults: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/agent/rebalance-executor", () => ({
  executeRebalance: vi.fn().mockResolvedValue({
    success: true,
    taskId: "0xtask",
  }),
}));

vi.mock("@/lib/security/session-encryption", () => ({
  decryptAuthorization: vi.fn().mockReturnValue({
    expiry: Date.now() / 1000 + 86400, // Valid for 1 day
    sessionKeyAddress: "0xsession",
    serializedAccount: "mockSerialized",
    eoaAddress: "0xuser",
  }),
}));

vi.mock("@/lib/security/session-revocation", () => ({
  isSessionRevoked: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/redis/distributed-lock", () => ({
  acquireUserLock: vi.fn().mockResolvedValue({ acquired: true, lockId: "lock1" }),
  releaseUserLock: vi.fn(),
}));

vi.mock("@/lib/redis/rate-limiter", () => ({
  getUserOpCount: vi.fn().mockResolvedValue(0),
  incrementUserOpCount: vi.fn(),
}));

vi.mock("@/lib/oracles/chainlink", () => ({
  isRebalanceSafe: vi.fn().mockResolvedValue({ safe: true }),
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
    txHash: "0xClaimTxHash",
    userOpHash: "0xClaimOpHash",
  }),
}));

vi.mock("@/lib/redis/yo-cache", () => ({
  invalidateYoRewards: vi.fn(),
}));

vi.mock("@/lib/agent/resolve-registration", () => ({
  verifyVaultApproval: vi.fn().mockReturnValue({ approved: true }),
}));

vi.mock("@/lib/yo/constants", () => ({
  MERKL_DISTRIBUTOR_ADDRESS_BASE: "0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae",
}));

vi.mock("@/lib/config", () => ({
  CHAIN_CONFIG: { chainId: 8453, rpcUrl: "http://localhost" },
}));

describe("Cron API", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: "test-secret", AGENT_SIMULATION_MODE: "false" };

    // Mock successful SQL queries (two-phase pattern):
    // Phase 1: Lightweight user list (no authorization blob)
    mockSql.mockResolvedValueOnce([
      {
        id: "user1",
        wallet_address: "0xuser",
        min_apy_gain_threshold: "0.005",
        session_type: "zerodev-7702-session",
      },
    ]);
    // Phase 2: Deferred authorization fetch (only for users that need rebalancing)
    mockSql.mockResolvedValueOnce([
      {
        authorization_7702: { type: "zerodev-7702-session", data: "encrypted" },
      },
    ]);
    // Phase 3: Log action INSERT
    mockSql.mockResolvedValueOnce([]);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return 401 if unauthorized", async () => {
    const req = new NextRequest("http://localhost/api/agent/cron", {
      headers: { "x-cron-secret": "wrong-secret" },
      method: "POST",
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("should process users if authorized", async () => {
    const req = new NextRequest("http://localhost/api/agent/cron", {
      headers: { "x-cron-secret": "test-secret" },
      method: "POST",
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.summary.processed).toBe(1);
    expect(body.summary.rebalanced).toBe(1);
  });

  it("should skip users if lock not acquired", async () => {
    // Re-setup lightweight user list for this test
    mockSql.mockResolvedValueOnce([
      {
        id: "user1",
        wallet_address: "0xuser",
        min_apy_gain_threshold: "0.005",
        session_type: "zerodev-7702-session",
      },
    ]);

    const { acquireUserLock } = await import("@/lib/redis/distributed-lock");
    (acquireUserLock as any).mockResolvedValueOnce({ acquired: false });

    const req = new NextRequest("http://localhost/api/agent/cron", {
      headers: { "x-cron-secret": "test-secret" },
      method: "POST",
    });

    const res = await POST(req);
    const body = await res.json();

    expect(body.summary.skipped).toBe(1);
    expect(body.summary.details[0].reason).toContain("locked");
  });

  it("should handle safety check failure", async () => {
    const { isRebalanceSafe } = await import("@/lib/oracles/chainlink");
    (isRebalanceSafe as any).mockResolvedValueOnce({ safe: false, reason: "Price deviation" });

    const req = new NextRequest("http://localhost/api/agent/cron", {
      headers: { "x-cron-secret": "test-secret" },
      method: "POST",
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.success).toBe(false);
    expect(body.error).toContain("Price deviation");
  });

  // Finding #8: ERC-4337 users should use smartWalletAddress for reward fetching
  it("should fetch rewards using smartWalletAddress for ERC-4337 users", async () => {
    const smartWalletAddr = "0x1111111111111111111111111111111111111111";

    // Override decryptAuthorization to return ERC-4337 session
    const { decryptAuthorization } = await import("@/lib/security/session-encryption");
    (decryptAuthorization as any).mockReturnValue({
      expiry: Date.now() / 1000 + 86400,
      sessionKeyAddress: "0xsession",
      serializedAccount: "mockSerialized",
      eoaAddress: "0xuser",
      type: "zerodev-erc4337-session",
      smartWalletAddress: smartWalletAddr,
      approvedVaults: ["0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae"],
    });

    // Rebalance decision: skip rebalance so we only test claim phase
    const { yieldDecisionEngine } = await import("@/lib/agent/decision-engine");
    (yieldDecisionEngine.evaluateRebalancing as any).mockResolvedValue({
      shouldRebalance: false,
      reason: "No improvement",
      apyImprovement: 0,
    });

    // Setup SQL mocks:
    // 1. User list
    mockSql.mockReset();
    mockSql.mockResolvedValueOnce([
      {
        id: "user-4337",
        wallet_address: "0xuser",
        min_apy_gain_threshold: "0.005",
        session_type: "zerodev-erc4337-session",
      },
    ]);
    // 2. No recent claims (cooldown check)
    mockSql.mockResolvedValueOnce([]);
    // 3. Auth fetch for claim phase
    mockSql.mockResolvedValueOnce([
      {
        authorization_7702: { type: "zerodev-erc4337-session", data: "encrypted" },
      },
    ]);
    // 4. Claim log INSERT
    mockSql.mockResolvedValueOnce([]);

    const req = new NextRequest("http://localhost/api/agent/cron", {
      headers: { "x-cron-secret": "test-secret" },
      method: "POST",
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);

    // Verify fetchClaimableRewards was called with smartWalletAddress, not wallet_address
    const { fetchClaimableRewards } = await import("@/lib/yo/rewards-client");
    expect(fetchClaimableRewards).toHaveBeenCalledWith(smartWalletAddr, true);

    // Verify executeYoRewardsClaim was also called with smartWalletAddress
    const { executeYoRewardsClaim } = await import("@/lib/zerodev/yo-rewards-executor");
    expect(executeYoRewardsClaim).toHaveBeenCalledWith(
      expect.objectContaining({
        smartAccountAddress: smartWalletAddr,
        userAddress: smartWalletAddr,
      })
    );
  });
});
