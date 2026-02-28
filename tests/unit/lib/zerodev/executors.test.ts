import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeGaslessDeposit } from "@/lib/zerodev/deposit-executor";
import { executeVaultRedeem } from "@/lib/zerodev/vault-executor";

// Mocks
const {
  mockSendUserOperation,
  mockWaitForUserOperationReceipt,
  mockCreateDeserializedKernelClient,
  mockCreateSessionKernelClient,
  mockSimulateContract,
} = vi.hoisted(() => ({
  mockSendUserOperation: vi.fn(),
  mockWaitForUserOperationReceipt: vi.fn(),
  mockCreateDeserializedKernelClient: vi.fn(),
  mockCreateSessionKernelClient: vi.fn(),
  mockSimulateContract: vi.fn(),
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      simulateContract: mockSimulateContract,
    })),
    encodeFunctionData: vi.fn(() => "0xencoded"),
    parseUnits: vi.fn((val) => BigInt(Number(val) * 1e6)),
  };
});

vi.mock("@/lib/zerodev/kernel-client", () => ({
  createDeserializedKernelClient: mockCreateDeserializedKernelClient,
  createSessionKernelClient: mockCreateSessionKernelClient,
}));

vi.mock("@/lib/config", () => ({
  CHAIN_CONFIG: { rpcUrl: "http://localhost" },
}));

describe("ZeroDev Executors", () => {
  const mockKernelClient = {
    sendUserOperation: mockSendUserOperation,
    waitForUserOperationReceipt: mockWaitForUserOperationReceipt,
  };

  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.AGENT_SIMULATION_MODE;

    mockCreateDeserializedKernelClient.mockResolvedValue(mockKernelClient);
    mockCreateSessionKernelClient.mockResolvedValue(mockKernelClient);
    mockSendUserOperation.mockResolvedValue("0xOpHash");
    mockWaitForUserOperationReceipt.mockResolvedValue({
      receipt: { transactionHash: "0xTxHash" },
    });
    mockSimulateContract.mockResolvedValue({});
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("executeGaslessDeposit", () => {
    const params = {
      smartAccountAddress: "0xAccount" as `0x${string}`,
      vaultAddress: "0xVault" as `0x${string}`,
      amount: "10.5",
    };

    it("should return mock result in simulation mode", async () => {
      process.env.AGENT_SIMULATION_MODE = "true";
      const result = await executeGaslessDeposit(params);
      expect(result.success).toBe(true);
      expect(result.txHash).toBeDefined();
      expect(mockSendUserOperation).not.toHaveBeenCalled();
    });

    it("should use deserialized client if provided", async () => {
      const result = await executeGaslessDeposit({
        ...params,
        serializedAccount: "serialized",
      });

      expect(mockCreateDeserializedKernelClient).toHaveBeenCalledWith("serialized");
      expect(mockSendUserOperation).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("should use legacy client if private key provided", async () => {
      const result = await executeGaslessDeposit({
        ...params,
        sessionPrivateKey: "0xKey",
        approvedVaults: ["0xVault"],
      });

      expect(mockCreateSessionKernelClient).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("should throw if no credentials provided", async () => {
      const result = await executeGaslessDeposit(params);
      expect(result.success).toBe(false);
      expect(result.error).toContain("No serializedAccount or sessionPrivateKey");
    });

    it("should handle execution errors", async () => {
      mockSendUserOperation.mockRejectedValue(new Error("Bundler error"));

      const result = await executeGaslessDeposit({
        ...params,
        serializedAccount: "serialized",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Bundler error");
    });
  });

  describe("executeVaultRedeem", () => {
    const params = {
      smartAccountAddress: "0xAccount" as `0x${string}`,
      vaultAddress: "0xVault" as `0x${string}`,
      shares: 1000n,
      receiver: "0xAccount" as `0x${string}`,
    };

    it("should return mock result in simulation mode", async () => {
      process.env.AGENT_SIMULATION_MODE = "true";
      const result = await executeVaultRedeem(params);
      expect(result.success).toBe(true);
      expect(result.txHash).toBeDefined();
    });

    it("should fail if pre-flight simulation fails", async () => {
      mockSimulateContract.mockRejectedValue(new Error("Access denied"));

      const result = await executeVaultRedeem({
        ...params,
        serializedAccount: "serialized",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Vault rejected the redeem");
      expect(mockSendUserOperation).not.toHaveBeenCalled();
    });

    it("should execute successfully if simulation passes", async () => {
      const result = await executeVaultRedeem({
        ...params,
        serializedAccount: "serialized",
      });

      expect(mockSimulateContract).toHaveBeenCalled();
      expect(mockSendUserOperation).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("should handle rate limit errors", async () => {
      mockSendUserOperation.mockRejectedValue(new Error("0x3e4983f6: rate limit exceeded"));

      const result = await executeVaultRedeem({
        ...params,
        serializedAccount: "serialized",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Agent daily operation limit reached");
    });

    it("should handle AA23 validation failures", async () => {
      mockSendUserOperation.mockRejectedValue(new Error("AA23 reverted 0x007e472e"));

      const result = await executeVaultRedeem({
        ...params,
        serializedAccount: "serialized",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Session key validation failed");
    });
  });
});
