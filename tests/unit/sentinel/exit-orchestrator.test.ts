import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Action } from "@/sentinel/types";

// ---------------------------------------------------------------------------
// Mocks — hoisted so they're available before module loading
// ---------------------------------------------------------------------------

const { mockReadContract, mockRedeem, mockAcquireLock, mockReleaseLock, mockDecryptAuth } =
  vi.hoisted(() => ({
    mockReadContract: vi.fn(),
    mockRedeem: vi.fn(),
    mockAcquireLock: vi.fn(),
    mockReleaseLock: vi.fn(),
    mockDecryptAuth: vi.fn(),
  }));

// Track SQL calls for assertion
const sqlCalls: Array<{ result: unknown }> = [];
let sqlCallIndex = 0;

function createMockSql() {
  // Returns a function that works as tagged template literal
  const fn = (...args: unknown[]) => {
    const call = sqlCalls[sqlCallIndex];
    sqlCallIndex++;
    return Promise.resolve(call?.result ?? []);
  };
  return fn;
}

vi.mock("@/sentinel/db", () => ({
  getSql: () => createMockSql(),
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      readContract: mockReadContract,
    })),
  };
});

vi.mock("@/lib/agent/vault-executor", () => ({
  getExecutor: vi.fn(() => ({
    redeem: mockRedeem,
  })),
}));

vi.mock("@/lib/redis/distributed-lock", () => ({
  acquireUserLock: (...args: unknown[]) => mockAcquireLock(...args),
  releaseUserLock: (...args: unknown[]) => mockReleaseLock(...args),
}));

vi.mock("@/lib/security/session-encryption", () => ({
  decryptAuthorization: (...args: unknown[]) => mockDecryptAuth(...args),
}));

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const testAction: Action = {
  type: "EXIT",
  reason: "DEPEG",
  vaultAddress: "0xVault" as `0x${string}`,
  protocol: "morpho",
  signalType: "DEX_PRICE",
  value: 0.04,
};

const testUser = {
  id: "user-1",
  wallet_address: "0xUser1",
  session_type: "zerodev-7702-session",
  authorization_7702: { type: "zerodev-7702-session", serializedAccount: "abc" },
  smart_wallet_address: null,
};

const testUser4337 = {
  id: "user-2",
  wallet_address: "0xUser2",
  session_type: "zerodev-erc4337-session",
  authorization_7702: {
    type: "zerodev-erc4337-session",
    serializedAccount: "def",
    smartWalletAddress: "0xSmartWallet2",
  },
  smart_wallet_address: "0xSmartWallet2",
};

describe("ExitOrchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sqlCalls.length = 0;
    sqlCallIndex = 0;

    // Default mock behaviors
    mockAcquireLock.mockResolvedValue({ acquired: true, lockId: "lock-1" });
    mockReleaseLock.mockResolvedValue(undefined);
    mockDecryptAuth.mockReturnValue({
      type: "zerodev-7702-session",
      serializedAccount: "decrypted",
      approvedVaults: ["0xVault"],
    });
  });

  // Test #9
  it("single-user-exit-completes", async () => {
    const { ExitOrchestrator } = await import("@/sentinel/exit-orchestrator");
    const orchestrator = new ExitOrchestrator("http://localhost:4000");

    // SQL call 1: users query
    sqlCalls.push({ result: [testUser] });
    // SQL call 2: idempotency check (no recent exit)
    sqlCalls.push({ result: [] });
    // SQL call 3: incident log
    sqlCalls.push({ result: [] });

    mockReadContract.mockResolvedValueOnce(1000000n);
    mockRedeem.mockResolvedValueOnce({ success: true, txHash: "0xTx1" });

    const results = await orchestrator.execute(testAction);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("SUCCESS");
    expect(results[0].txHash).toBe("0xTx1");
  });

  // Test #10
  it("batch-10-users-parallel", async () => {
    const { ExitOrchestrator } = await import("@/sentinel/exit-orchestrator");
    const orchestrator = new ExitOrchestrator("http://localhost:4000");

    const users = Array.from({ length: 10 }, (_, i) => ({
      ...testUser,
      id: `user-${i}`,
      wallet_address: `0xUser${i}`,
    }));

    // SQL call 1: users query
    sqlCalls.push({ result: users });

    // For each user: idempotency check + incident log
    for (let i = 0; i < 10; i++) {
      sqlCalls.push({ result: [] }); // idempotency
      sqlCalls.push({ result: [] }); // incident log
    }

    // All have shares
    for (let i = 0; i < 10; i++) {
      mockReadContract.mockResolvedValueOnce(BigInt(1000 * (i + 1)));
    }

    // All succeed
    for (let i = 0; i < 10; i++) {
      mockRedeem.mockResolvedValueOnce({ success: true, txHash: `0xTx${i}` });
    }

    const results = await orchestrator.execute(testAction);

    expect(results).toHaveLength(10);
    expect(results.every((r) => r.status === "SUCCESS")).toBe(true);
  });

  // Test #11
  it("7702-session-exits-to-eoa", async () => {
    const { ExitOrchestrator } = await import("@/sentinel/exit-orchestrator");
    const orchestrator = new ExitOrchestrator("http://localhost:4000");

    sqlCalls.push({ result: [testUser] });
    sqlCalls.push({ result: [] }); // idempotency
    sqlCalls.push({ result: [] }); // incident log

    mockReadContract.mockResolvedValueOnce(500n);
    mockRedeem.mockResolvedValueOnce({ success: true, txHash: "0xTx7702" });

    const results = await orchestrator.execute(testAction);

    expect(results).toHaveLength(1);
    expect(mockRedeem).toHaveBeenCalledWith(
      expect.objectContaining({
        smartAccountAddress: "0xUser1",
      }),
      expect.objectContaining({
        receiver: "0xUser1",
      })
    );
  });

  // Test #12
  it("4337-session-exits-to-smart-wallet", async () => {
    const { ExitOrchestrator } = await import("@/sentinel/exit-orchestrator");
    const orchestrator = new ExitOrchestrator("http://localhost:4000");

    sqlCalls.push({ result: [testUser4337] });
    sqlCalls.push({ result: [] }); // idempotency
    sqlCalls.push({ result: [] }); // incident log

    mockReadContract.mockResolvedValueOnce(500n);
    mockDecryptAuth.mockReturnValue({
      type: "zerodev-erc4337-session",
      serializedAccount: "decrypted",
      approvedVaults: ["0xVault"],
      smartWalletAddress: "0xSmartWallet2",
    });
    mockRedeem.mockResolvedValueOnce({ success: true, txHash: "0xTx4337" });

    const results = await orchestrator.execute(testAction);

    expect(results).toHaveLength(1);
    expect(mockRedeem).toHaveBeenCalledWith(
      expect.objectContaining({
        smartAccountAddress: "0xSmartWallet2",
      }),
      expect.objectContaining({
        receiver: "0xSmartWallet2",
      })
    );
  });

  // Test #13
  it("retry-once-on-bundler-failure", async () => {
    const { ExitOrchestrator } = await import("@/sentinel/exit-orchestrator");
    const orchestrator = new ExitOrchestrator("http://localhost:4000");

    sqlCalls.push({ result: [testUser] });
    sqlCalls.push({ result: [] }); // idempotency
    sqlCalls.push({ result: [] }); // incident log

    mockReadContract.mockResolvedValueOnce(500n);

    // First attempt fails, second succeeds
    mockRedeem.mockRejectedValueOnce(new Error("Bundler error"));
    mockRedeem.mockResolvedValueOnce({ success: true, txHash: "0xRetryTx" });

    const results = await orchestrator.execute(testAction);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("SUCCESS");
    expect(mockRedeem).toHaveBeenCalledTimes(2);
  }, 60_000); // Extended timeout for retry delay

  // Test #14
  it("acquires-distributed-lock", async () => {
    const { ExitOrchestrator } = await import("@/sentinel/exit-orchestrator");
    const orchestrator = new ExitOrchestrator("http://localhost:4000");

    sqlCalls.push({ result: [testUser] });
    sqlCalls.push({ result: [] }); // idempotency
    sqlCalls.push({ result: [] }); // incident log

    mockReadContract.mockResolvedValueOnce(500n);
    mockRedeem.mockResolvedValueOnce({ success: true, txHash: "0xTx" });

    await orchestrator.execute(testAction);

    expect(mockAcquireLock).toHaveBeenCalledWith("0xUser1", 120);
    expect(mockReleaseLock).toHaveBeenCalledWith("0xUser1", "lock-1");
  });
});
