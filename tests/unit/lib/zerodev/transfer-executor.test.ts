import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeGaslessTransfer, validateTransferParams } from "@/lib/zerodev/transfer-executor";
import {
  createDeserializedKernelClient,
  createSessionKernelClient,
} from "@/lib/zerodev/kernel-client";

// Mock dependencies
vi.mock("@/lib/zerodev/kernel-client", () => ({
  createDeserializedKernelClient: vi.fn(),
  createSessionKernelClient: vi.fn(),
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
    recipient: "0x1234567890123456789012345678901234567890" as `0x${string}`,
    amount: "10",
    serializedAccount: "mockSerialized",
  };

  const mockKernelClient = {
    sendUserOperation: vi.fn().mockResolvedValue("0xuserOpHash"),
    waitForUserOperationReceipt: vi.fn().mockResolvedValue({
      receipt: { transactionHash: "0xtxHash" },
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AGENT_SIMULATION_MODE = "false";
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

  describe("executeGaslessTransfer", () => {
    it("should use simulation mode when enabled", async () => {
      process.env.AGENT_SIMULATION_MODE = "true";

      const result = await executeGaslessTransfer(mockParams);

      expect(result.success).toBe(true);
      expect(result.hash).toBeDefined();
      expect(result.userOpHash).toBeDefined();
      expect(createDeserializedKernelClient).not.toHaveBeenCalled();
    });

    it("should execute transfer using deserialized client", async () => {
      (createDeserializedKernelClient as any).mockResolvedValue(mockKernelClient);

      const result = await executeGaslessTransfer(mockParams);

      expect(createDeserializedKernelClient).toHaveBeenCalledWith("mockSerialized");
      expect(mockKernelClient.sendUserOperation).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.hash).toBe("0xtxHash");
    });

    it("should execute transfer using legacy session key", async () => {
      (createSessionKernelClient as any).mockResolvedValue(mockKernelClient);

      const legacyParams = {
        ...mockParams,
        serializedAccount: undefined,
        sessionPrivateKey: "0xpriv" as `0x${string}`,
      };

      const result = await executeGaslessTransfer(legacyParams);

      expect(createSessionKernelClient).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("should fail if no authorization provided", async () => {
      const invalidParams = {
        ...mockParams,
        serializedAccount: undefined,
        sessionPrivateKey: undefined,
      };

      // The function catches the error and returns success: false
      const result = await executeGaslessTransfer(invalidParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain("No serializedAccount or sessionPrivateKey");
    });

    it("should return error if execution fails", async () => {
      (createDeserializedKernelClient as any).mockRejectedValue(new Error("Bundler error"));

      const result = await executeGaslessTransfer(mockParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Bundler error");
    });
  });
});
