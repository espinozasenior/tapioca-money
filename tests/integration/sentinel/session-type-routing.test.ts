import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Action } from "@/sentinel/types";

// Test #25: 7702 vs 4337 session routing

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

const mockDecrypt = vi.fn();
vi.mock("@/lib/security/session-encryption", () => ({
  decryptAuthorization: (...args: unknown[]) => mockDecrypt(...args),
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

const action: Action = {
  type: "EXIT",
  reason: "DEPEG",
  vaultAddress: "0xVault" as `0x${string}`,
  protocol: "morpho",
  signalType: "DEX_PRICE",
  value: 0.04,
};

describe("Integration: Session Type Routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sqlCalls.length = 0;
    sqlCallIndex = 0;
  });

  it("7702-exits-to-eoa-and-4337-exits-to-smart-wallet", async () => {
    const { ExitOrchestrator } = await import("@/sentinel/exit-orchestrator");
    const orchestrator = new ExitOrchestrator("http://localhost:4000");

    // Two users
    sqlCalls.push({
      result: [
        {
          id: "u-7702",
          wallet_address: "0xEOA",
          session_type: "zerodev-7702-session",
          authorization_7702: { type: "zerodev-7702-session" },
          smart_wallet_address: null,
        },
        {
          id: "u-4337",
          wallet_address: "0xExternal",
          session_type: "zerodev-erc4337-session",
          authorization_7702: { type: "zerodev-erc4337-session" },
          smart_wallet_address: "0xSmartWallet",
        },
      ],
    });

    // Both have shares
    mockReadContract.mockResolvedValueOnce(100n); // 7702 user
    mockReadContract.mockResolvedValueOnce(200n); // 4337 user

    // SQL calls for each user: idempotency + incident
    sqlCalls.push({ result: [] }); // 4337 idempotency (higher shares, processed first)
    sqlCalls.push({ result: [] }); // 4337 incident log
    sqlCalls.push({ result: [] }); // 7702 idempotency
    sqlCalls.push({ result: [] }); // 7702 incident log

    // Decrypt returns appropriate types
    mockDecrypt
      .mockReturnValueOnce({
        type: "zerodev-erc4337-session",
        serializedAccount: "s",
        approvedVaults: [],
        smartWalletAddress: "0xSmartWallet",
      })
      .mockReturnValueOnce({
        type: "zerodev-7702-session",
        serializedAccount: "s",
        approvedVaults: [],
      });

    mockRedeem
      .mockResolvedValueOnce({ success: true, txHash: "0xTx4337" })
      .mockResolvedValueOnce({ success: true, txHash: "0xTx7702" });

    const results = await orchestrator.execute(action);

    expect(results).toHaveLength(2);

    // Verify 4337 user exits to smart wallet
    expect(mockRedeem).toHaveBeenCalledWith(
      expect.objectContaining({ smartAccountAddress: "0xSmartWallet" }),
      expect.objectContaining({ receiver: "0xSmartWallet" })
    );

    // Verify 7702 user exits to EOA
    expect(mockRedeem).toHaveBeenCalledWith(
      expect.objectContaining({ smartAccountAddress: "0xEOA" }),
      expect.objectContaining({ receiver: "0xEOA" })
    );
  });
});
