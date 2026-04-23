import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  executeUserPaidTransfer,
  executeGaslessTransfer,
  validateTransferParams,
} from "@/lib/zerodev/transfer-executor";
import { createDeserializedKernelClient } from "@/lib/zerodev/kernel-client";

// Mock kernel-client factory.
vi.mock("@/lib/zerodev/kernel-client", () => ({
  createDeserializedKernelClient: vi.fn(),
}));

// Mock paymaster client + fee parse (allowance pre-read comes from baseClient).
const { mockReadContract } = vi.hoisted(() => ({ mockReadContract: vi.fn() }));

vi.mock("@/lib/shared/rpc-client", () => ({
  baseClient: { readContract: mockReadContract },
}));

vi.mock("@/lib/zerodev/paymaster-client", () => ({
  createUsdcPaymaster: vi.fn(async () => ({
    getPaymasterData: vi.fn(),
    getPaymasterStubData: vi.fn(),
  })),
  getPaymasterTreasury: vi.fn(async () => "0x0000000000000000000000000000000000001234"),
  parsePaymasterFeeFromReceipt: vi.fn(() => 0n),
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    encodeFunctionData: vi.fn(() => "0xcalldata"),
    parseUnits: vi.fn((val) => BigInt(Number(val) * 1e6)),
  };
});

describe("Transfer Executor", () => {
  const mockParams = {
    userAddress: "0x1234567890123456789012345678901234567890" as `0x${string}`,
    smartAccountAddress: "0x1234567890123456789012345678901234567890" as `0x${string}`,
    recipient: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as `0x${string}`,
    amount: "10",
    serializedAccount: "mockSerialized",
  };

  const mockKernelClient = {
    sendUserOperation: vi.fn().mockResolvedValue("0xuserOpHash"),
    waitForUserOperationReceipt: vi.fn().mockResolvedValue({
      receipt: { transactionHash: "0xtxHash", logs: [] },
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AGENT_SIMULATION_MODE = "false";
    // Default: allowance sufficient → no approve call; kernel client is returned.
    mockReadContract.mockResolvedValue(0n);
  });

  describe("validateTransferParams", () => {
    it("should validate correct params", () => {
      const result = validateTransferParams(mockParams);
      expect(result.valid).toBe(true);
    });

    it("should fail if recipient missing", () => {
      const result = validateTransferParams({ ...mockParams, recipient: undefined });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Recipient address required");
    });

    it("should fail if recipient invalid", () => {
      const result = validateTransferParams({ ...mockParams, recipient: "invalid" as any });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid recipient");
    });

    it("should fail if amount missing", () => {
      const result = validateTransferParams({ ...mockParams, amount: "" });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Amount required");
    });

    it("should fail if amount invalid", () => {
      const result = validateTransferParams({ ...mockParams, amount: "abc" });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Amount must be greater than 0");
    });

    it("should fail if amount negative", () => {
      const result = validateTransferParams({ ...mockParams, amount: "-5" });
      expect(result.valid).toBe(false);
    });

    it("should fail if amount exceeds limit", () => {
      const result = validateTransferParams({ ...mockParams, amount: "1000" });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exceeds $500 limit");
    });

    it("should fail if authorization missing", () => {
      const result = validateTransferParams({
        ...mockParams,
        serializedAccount: undefined,
        sessionPrivateKey: undefined,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Session authorization required");
    });
  });

  describe("executeUserPaidTransfer", () => {
    it("should use simulation mode when enabled", async () => {
      process.env.AGENT_SIMULATION_MODE = "true";

      const result = await executeUserPaidTransfer(mockParams);

      expect(result.success).toBe(true);
      expect(result.hash).toBeDefined();
      expect(result.userOpHash).toBeDefined();
      expect(createDeserializedKernelClient).not.toHaveBeenCalled();
    });

    it("should execute transfer with paymaster when allowance sufficient", async () => {
      // Pretend paymaster already has infinite allowance → only one call (transfer).
      mockReadContract.mockResolvedValue(BigInt("99999999999999"));
      (createDeserializedKernelClient as any).mockResolvedValue(mockKernelClient);

      const result = await executeUserPaidTransfer(mockParams);

      expect(createDeserializedKernelClient).toHaveBeenCalledWith(
        "mockSerialized",
        expect.objectContaining({ paymaster: expect.anything() })
      );
      expect(mockKernelClient.sendUserOperation).toHaveBeenCalledTimes(1);
      const calls = mockKernelClient.sendUserOperation.mock.calls[0][0].calls;
      expect(calls.length).toBe(1); // transfer only, approve skipped
      expect(result.success).toBe(true);
      expect(result.hash).toBe("0xtxHash");
    });

    it("should batch approve+transfer when allowance is below feeCap", async () => {
      mockReadContract.mockResolvedValue(0n); // no allowance → approve required
      (createDeserializedKernelClient as any).mockResolvedValue(mockKernelClient);

      await executeUserPaidTransfer(mockParams);

      const calls = mockKernelClient.sendUserOperation.mock.calls[0][0].calls;
      expect(calls.length).toBe(2); // [approve, transfer]
    });

    it("should return SESSION_UPGRADE_REQUIRED if serializedAccount missing", async () => {
      const invalidParams = { ...mockParams, serializedAccount: undefined as any };

      const result = await executeUserPaidTransfer(invalidParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain("SESSION_UPGRADE_REQUIRED");
    });

    it("should return error if execution fails", async () => {
      mockReadContract.mockResolvedValue(BigInt("99999999999999")); // skip approve
      (createDeserializedKernelClient as any).mockRejectedValue(new Error("Bundler error"));

      const result = await executeUserPaidTransfer(mockParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Bundler error");
    });

    it("executeGaslessTransfer alias still routes to user-paid path", async () => {
      mockReadContract.mockResolvedValue(BigInt("99999999999999"));
      (createDeserializedKernelClient as any).mockResolvedValue(mockKernelClient);

      const result = await executeGaslessTransfer(mockParams);

      expect(result.success).toBe(true);
    });
  });
});
