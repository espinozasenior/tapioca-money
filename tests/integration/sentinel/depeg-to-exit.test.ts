import { describe, it, expect, vi, beforeEach } from "vitest";
import { RulesEngine } from "@/sentinel/rules-engine";
import { SignalHistory } from "@/sentinel/types";
import type { Signal, ActiveIncident, VaultConfig } from "@/sentinel/types";

// Test #23: Full depeg-to-exit flow

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
  acquireUserLock: vi.fn().mockResolvedValue({ acquired: true, lockId: "l1" }),
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

describe("Integration: Depeg to Exit", () => {
  const vault: VaultConfig = {
    address: "0xVault" as `0x${string}`,
    exposure: { protocol: "morpho", underlying: "USR", dexPools: [] },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sqlCalls.length = 0;
    sqlCallIndex = 0;
  });

  it("mock-3.5pct-depeg-triggers-rules-engine-then-exit-then-incident", async () => {
    const engine = new RulesEngine();
    const windows = new Map<string, SignalHistory>();
    const incidents = new Map<string, ActiveIncident>();

    // Poll 1: 3.5% depeg
    const signal1: Signal = {
      type: "DEX_PRICE",
      vault,
      asset: "USR",
      value: 0.965,
      timestamp: Date.now(),
      source: "ponder",
    };
    const actions1 = engine.evaluate([signal1], windows, incidents);
    expect(actions1).toHaveLength(0);

    // Poll 2: Still depegged
    const signal2: Signal = {
      type: "DEX_PRICE",
      vault,
      asset: "USR",
      value: 0.96,
      timestamp: Date.now(),
      source: "ponder",
    };
    const actions2 = engine.evaluate([signal2], windows, incidents);
    expect(actions2).toHaveLength(1);
    expect(actions2[0].type).toBe("EXIT");
    expect(actions2[0].reason).toBe("DEPEG");

    // Execute the exit
    const { ExitOrchestrator } = await import("@/sentinel/exit-orchestrator");
    const orchestrator = new ExitOrchestrator("http://localhost:4000");

    // SQL: users query
    sqlCalls.push({
      result: [
        {
          id: "u1",
          wallet_address: "0xUser1",
          session_type: "zerodev-7702-session",
          authorization_7702: { type: "zerodev-7702-session" },
          smart_wallet_address: null,
        },
      ],
    });
    // SQL: idempotency check
    sqlCalls.push({ result: [] });
    // SQL: incident log
    sqlCalls.push({ result: [] });

    mockReadContract.mockResolvedValueOnce(5000n);
    mockRedeem.mockResolvedValueOnce({ success: true, txHash: "0xExitTx" });

    const results = await orchestrator.execute(actions2[0]);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("SUCCESS");
    expect(results[0].txHash).toBe("0xExitTx");
  });
});
