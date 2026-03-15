import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Hoisted mocks
const { mockSql, mockDecryptAuthorization, mockEvaluateRebalancing, mockGetAvailableMorphoVaults, mockGetAvailableYoVaults } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockDecryptAuthorization: vi.fn(),
  mockEvaluateRebalancing: vi.fn(),
  mockGetAvailableMorphoVaults: vi.fn(),
  mockGetAvailableYoVaults: vi.fn(),
}));

vi.mock("@neondatabase/serverless", () => ({
  neon: () => mockSql,
}));

vi.mock("@/lib/agent/decision-engine", () => ({
  YieldDecisionEngine: class {
    evaluateRebalancing = mockEvaluateRebalancing;
    getAvailableMorphoVaults = mockGetAvailableMorphoVaults;
    getAvailableYoVaults = mockGetAvailableYoVaults;
  },
  yieldDecisionEngine: {
    evaluateRebalancing: mockEvaluateRebalancing,
    getAvailableMorphoVaults: mockGetAvailableMorphoVaults,
    getAvailableYoVaults: mockGetAvailableYoVaults,
  },
}));

vi.mock("@/lib/agent/rebalance-executor", () => ({
  executeRebalance: vi.fn().mockResolvedValue({ success: true, taskId: "0xtask" }),
}));

vi.mock("@/lib/security/session-encryption", () => ({
  decryptAuthorization: mockDecryptAuthorization,
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

import { POST } from "@/app/api/agent/cron/route";

describe("Cron Performance Optimizations", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: "test-secret", AGENT_SIMULATION_MODE: "false" };

    mockDecryptAuthorization.mockReturnValue({
      expiry: Date.now() / 1000 + 86400,
      sessionKeyAddress: "0xsession",
      serializedAccount: "mockSerialized",
      eoaAddress: "0xuser",
    });

    // Default: prefetch returns empty vault lists (tests that need them will override)
    mockGetAvailableMorphoVaults.mockResolvedValue([]);
    mockGetAvailableYoVaults.mockResolvedValue([]);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const makeRequest = () =>
    new NextRequest("http://localhost/api/agent/cron", {
      headers: { "x-cron-secret": "test-secret" },
      method: "POST",
    });

  describe("P0-2: Lightweight initial query", () => {
    it("should NOT fetch authorization_7702 in the initial user query", async () => {
      // Initial query returns lightweight user data (no authorization blob)
      mockSql.mockResolvedValueOnce([
        {
          id: "user1",
          wallet_address: "0xuser",
          min_apy_gain_threshold: "0.005",
          session_type: "zerodev-7702-session",
        },
      ]);

      // Second query fetches authorization only for users that need rebalancing
      mockSql.mockResolvedValueOnce([
        {
          authorization_7702: { type: "zerodev-7702-session", data: "encrypted" },
        },
      ]);

      mockEvaluateRebalancing.mockResolvedValue({
        shouldRebalance: true,
        reason: "Better APY found",
        currentVault: { address: "0xold", name: "Old", apy: 0.05, shares: "100", assets: "1000000" },
        targetVault: { address: "0xnew", name: "New", apy: 0.1 },
        apyImprovement: 0.05,
        estimatedAnnualGain: 50,
      });

      const res = await POST(makeRequest());
      const body = await res.json();

      expect(res.status).toBe(200);
      // The initial SQL call should NOT select the full authorization_7702 column
      const firstSqlCall = mockSql.mock.calls[0];
      const sqlText = firstSqlCall[0]?.join?.("") ?? String(firstSqlCall[0]);
      // It's fine if authorization_7702 appears in WHERE clause or JSON operator (->>'type'),
      // but it should NOT be selected as a bare column (u.authorization_7702,)
      expect(sqlText).not.toMatch(/u\.authorization_7702\s*,/);
    });
  });

  describe("P2-1: Decrypt after decision check", () => {
    it("should NOT call decryptAuthorization for users that don't need rebalancing", async () => {
      // Lightweight initial query
      mockSql.mockResolvedValueOnce([
        {
          id: "user1",
          wallet_address: "0xuser1",
          min_apy_gain_threshold: "0.005",
          session_type: "zerodev-7702-session",
        },
        {
          id: "user2",
          wallet_address: "0xuser2",
          min_apy_gain_threshold: "0.005",
          session_type: "zerodev-7702-session",
        },
      ]);

      // Decision: user1 should NOT rebalance, user2 SHOULD
      mockEvaluateRebalancing
        .mockResolvedValueOnce({
          shouldRebalance: false,
          reason: "APY improvement too small",
          currentVault: null,
          targetVault: null,
          apyImprovement: 0,
          estimatedAnnualGain: 0,
        })
        .mockResolvedValueOnce({
          shouldRebalance: true,
          reason: "Better APY found",
          currentVault: { address: "0xold", name: "Old", apy: 0.05, shares: "100", assets: "1000000" },
          targetVault: { address: "0xnew", name: "New", apy: 0.1 },
          apyImprovement: 0.05,
          estimatedAnnualGain: 50,
        });

      // Only user2 should trigger a second SQL query for authorization
      mockSql.mockResolvedValueOnce([
        {
          authorization_7702: { type: "zerodev-7702-session", data: "encrypted" },
        },
      ]);

      const res = await POST(makeRequest());

      // decryptAuthorization should be called ONLY for user2 (shouldRebalance=true),
      // NOT for user1 (shouldRebalance=false)
      expect(mockDecryptAuthorization).toHaveBeenCalledTimes(1);
    });
  });

  describe("P0: Cron prefetches vaults before user loop", () => {
    it("should fetch vaults once and pass prefetchedVaults to every evaluateRebalancing call", async () => {
      const mockMorphoVaults = [
        { address: "0xmorpho1", name: "Morpho Vault", avgNetApy: 0.05, totalAssetsUsd: 1000000 },
      ];
      const mockYoVaults = [
        { id: "yoUSD", address: "0xyo1", name: "YO Vault", apy: 0.07, tvlUsd: 5000000 },
      ];

      mockGetAvailableMorphoVaults.mockResolvedValue(mockMorphoVaults);
      mockGetAvailableYoVaults.mockResolvedValue(mockYoVaults);

      // Two users to process
      mockSql.mockResolvedValueOnce([
        {
          id: "user1",
          wallet_address: "0xuser1",
          min_apy_gain_threshold: "0.005",
          session_type: "zerodev-7702-session",
        },
        {
          id: "user2",
          wallet_address: "0xuser2",
          min_apy_gain_threshold: "0.005",
          session_type: "zerodev-7702-session",
        },
      ]);

      // Both users: no rebalance needed (simplifies test -- no auth fetch needed)
      mockEvaluateRebalancing.mockResolvedValue({
        shouldRebalance: false,
        reason: "APY improvement too small",
        currentVault: null,
        targetVault: null,
        apyImprovement: 0,
        estimatedAnnualGain: 0,
      });

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);

      // Vault fetch functions should be called exactly ONCE (before the loop)
      expect(mockGetAvailableMorphoVaults).toHaveBeenCalledTimes(1);
      expect(mockGetAvailableYoVaults).toHaveBeenCalledTimes(1);

      // evaluateRebalancing should receive prefetchedVaults for BOTH users
      expect(mockEvaluateRebalancing).toHaveBeenCalledTimes(2);
      for (const call of mockEvaluateRebalancing.mock.calls) {
        // Third argument should be { morpho: [...], yo: [...] }
        expect(call[2]).toEqual({ morpho: mockMorphoVaults, yo: mockYoVaults });
      }
    });

    it("should still work when vault prefetch returns empty arrays", async () => {
      mockGetAvailableMorphoVaults.mockResolvedValue([]);
      mockGetAvailableYoVaults.mockResolvedValue([]);

      mockSql.mockResolvedValueOnce([
        {
          id: "user1",
          wallet_address: "0xuser1",
          min_apy_gain_threshold: "0.005",
          session_type: "zerodev-7702-session",
        },
      ]);

      mockEvaluateRebalancing.mockResolvedValue({
        shouldRebalance: false,
        reason: "No eligible alternative vaults found",
        currentVault: null,
        targetVault: null,
        apyImprovement: 0,
        estimatedAnnualGain: 0,
      });

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);

      // Should still pass the empty prefetched vaults
      expect(mockEvaluateRebalancing).toHaveBeenCalledWith(
        "0xuser1",
        null,
        { morpho: [], yo: [] }
      );
    });
  });
});
