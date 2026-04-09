import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Action } from "@/sentinel/types";

// Test #29: Restart idempotency

const sqlCalls: Array<{ result: unknown }> = [];
let sqlCallIndex = 0;

vi.mock("@/sentinel/db", () => ({
  getSql:
    () =>
    (..._args: unknown[]) => {
      const call = sqlCalls[sqlCallIndex];
      sqlCallIndex++;
      return Promise.resolve(call?.result ?? []);
    },
}));

const mockRedeem = vi.fn();
vi.mock("@/lib/agent/vault-executor", () => ({
  getExecutor: vi.fn(() => ({ redeem: mockRedeem })),
}));

vi.mock("@/lib/redis/distributed-lock", () => ({
  acquireUserLock: vi.fn().mockResolvedValue({ acquired: true, lockId: "l" }),
  releaseUserLock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/security/session-encryption", () => ({
  decryptAuthorization: vi.fn().mockReturnValue({
    type: "zerodev-7702-session",
    serializedAccount: "s",
    approvedVaults: [],
  }),
}));

const mockReadContract = vi.fn();
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      readContract: mockReadContract,
    })),
  };
});

describe("Integration: Restart Idempotency", () => {
  const action: Action = {
    type: "EXIT",
    reason: "DEPEG",
    vaultAddress: "0xVault" as `0x${string}`,
    protocol: "morpho",
    signalType: "DEX_PRICE",
    value: 0.05,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sqlCalls.length = 0;
    sqlCallIndex = 0;
  });

  it("user-a-already-exited-skipped-user-b-processed", async () => {
    const { ExitOrchestrator } = await import("@/sentinel/exit-orchestrator");
    const orchestrator = new ExitOrchestrator("http://localhost:4000");

    // SQL: users query
    sqlCalls.push({
      result: [
        {
          id: "ua",
          wallet_address: "0xUserA",
          session_type: "zerodev-7702-session",
          authorization_7702: { type: "zerodev-7702-session" },
          smart_wallet_address: null,
        },
        {
          id: "ub",
          wallet_address: "0xUserB",
          session_type: "zerodev-7702-session",
          authorization_7702: { type: "zerodev-7702-session" },
          smart_wallet_address: null,
        },
      ],
    });

    // Both have shares
    mockReadContract.mockResolvedValueOnce(1000n); // UserA
    mockReadContract.mockResolvedValueOnce(500n); // UserB

    // UserA: has recent exit (idempotency check finds it)
    sqlCalls.push({ result: [{ "1": 1 }] }); // UserA idempotent

    // UserB: no recent exit
    sqlCalls.push({ result: [] }); // UserB clean
    sqlCalls.push({ result: [] }); // UserB incident log

    mockRedeem.mockResolvedValueOnce({ success: true, txHash: "0xTxB" });

    const results = await orchestrator.execute(action);

    expect(results).toHaveLength(2);

    const userAResult = results.find((r) => r.userAddress === "0xUserA");
    const userBResult = results.find((r) => r.userAddress === "0xUserB");

    expect(userAResult!.status).toBe("SKIPPED");
    expect(userAResult!.reason).toBe("IDEMPOTENT");

    expect(userBResult!.status).toBe("SUCCESS");
    expect(userBResult!.txHash).toBe("0xTxB");

    // Redeem only called once (for UserB)
    expect(mockRedeem).toHaveBeenCalledTimes(1);
  });
});
