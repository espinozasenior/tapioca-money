import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildRebalanceCalls,
  executeRebalance,
  simulateRebalance,
  RebalanceParams,
} from "@/lib/agent/rebalance-executor";

// Mocks
const {
  mockReadContract,
  mockCall,
  mockSendUserOperation,
  mockWaitForUserOperationReceipt,
  mockCheckSmartAccountActive,
  mockCreateDeserializedKernelClient,
  mockCreateSessionKernelClient,
  mockVerifyDelegation,
} = vi.hoisted(() => ({
  mockReadContract: vi.fn(),
  mockCall: vi.fn(),
  mockSendUserOperation: vi.fn(),
  mockWaitForUserOperationReceipt: vi.fn(),
  mockCheckSmartAccountActive: vi.fn(),
  mockCreateDeserializedKernelClient: vi.fn(),
  mockCreateSessionKernelClient: vi.fn(),
  mockVerifyDelegation: vi.fn(),
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      readContract: mockReadContract,
      call: mockCall,
    })),
    encodeFunctionData: vi.fn(() => "0xencoded"),
  };
});

vi.mock("@/lib/zerodev/client-secure", () => ({
  checkSmartAccountActive: mockCheckSmartAccountActive,
}));

vi.mock("@/lib/zerodev/kernel-client", () => ({
  createDeserializedKernelClient: mockCreateDeserializedKernelClient,
  createSessionKernelClient: mockCreateSessionKernelClient,
  verifyDelegationAfterExecution: mockVerifyDelegation,
}));

vi.mock("@zerodev/sdk/constants", () => ({
  KernelVersionToAddressesMap: {
    "0.3.3": { accountImplementationAddress: "0xKernelV3Impl" },
  },
  KERNEL_V3_3: "0.3.3",
}));

describe("Rebalance Executor", () => {
  const mockParams: RebalanceParams = {
    fromVault: "0xSourceVault",
    toVault: "0xDestVault",
    shares: 1000n,
    userAddress: "0xUser",
  };

  const mockKernelClient = {
    sendUserOperation: mockSendUserOperation,
    waitForUserOperationReceipt: mockWaitForUserOperationReceipt,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks
    mockReadContract.mockResolvedValue(1000000n); // 1 USDC
    mockCheckSmartAccountActive.mockResolvedValue({
      active: true,
      isDelegation: true,
      implementationAddress: "0xKernelV3Impl",
    });
    mockCreateDeserializedKernelClient.mockResolvedValue(mockKernelClient);
    mockCreateSessionKernelClient.mockResolvedValue(mockKernelClient);
    mockSendUserOperation.mockResolvedValue("0xOpHash");
    mockWaitForUserOperationReceipt.mockResolvedValue({
      success: true,
      receipt: { transactionHash: "0xTxHash" },
    });
    mockVerifyDelegation.mockResolvedValue(true);
  });

  describe("buildRebalanceCalls", () => {
    it("should build 3 calls with correct slippage", async () => {
      const calls = await buildRebalanceCalls(mockParams);

      expect(calls).toHaveLength(3);
      expect(calls[0].to).toBe(mockParams.fromVault); // Redeem
      expect(calls[1].to).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"); // Approve USDC
      expect(calls[2].to).toBe(mockParams.toVault); // Deposit

      // Slippage check: 1000000 * 0.995 = 995000
      // Since encodeFunctionData is mocked, we can't check args directly here easily without complex mocking
      // But we can check that readContract was called to get preview
      expect(mockReadContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "previewRedeem",
          args: [mockParams.shares],
        })
      );
    });

    it("should throw if previewRedeem returns 0", async () => {
      mockReadContract.mockResolvedValue(0n);
      await expect(buildRebalanceCalls(mockParams)).rejects.toThrow("previewRedeem returned 0");
    });
  });

  describe("executeRebalance", () => {
    it("should fail if delegation not active", async () => {
      mockCheckSmartAccountActive.mockResolvedValue({ active: false });

      const result = await executeRebalance("0xAccount", mockParams, "0xKey");

      expect(result.success).toBe(false);
      expect(result.error).toContain("EIP-7702 delegation not active");
    });

    it("should fail if implementation mismatch", async () => {
      mockCheckSmartAccountActive.mockResolvedValue({
        active: true,
        isDelegation: true,
        implementationAddress: "0xWrongImpl",
      });

      const result = await executeRebalance("0xAccount", mockParams, "0xKey");

      expect(result.success).toBe(false);
      expect(result.error).toContain("EIP-7702 delegated to wrong implementation");
    });

    it("should execute successfully with serialized account", async () => {
      const result = await executeRebalance(
        "0xAccount",
        mockParams,
        "0xKey",
        undefined,
        undefined,
        "serialized-data"
      );

      expect(mockCreateDeserializedKernelClient).toHaveBeenCalledWith("serialized-data");
      expect(mockSendUserOperation).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.taskId).toBe("0xTxHash");
    });

    it("should execute successfully with legacy params", async () => {
      const result = await executeRebalance("0xAccount", mockParams, "0xKey", ["0xVault1"]);

      expect(mockCreateSessionKernelClient).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("should handle paymaster error", async () => {
      mockSendUserOperation.mockRejectedValue(new Error("paymaster out of gas"));

      const result = await executeRebalance(
        "0xAccount",
        mockParams,
        "0xKey",
        [],
        undefined,
        "data"
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Gas sponsorship failed");
    });

    it("should handle revert on-chain", async () => {
      mockWaitForUserOperationReceipt.mockResolvedValue({
        success: false,
        reason: "Slippage exceeded",
        receipt: { transactionHash: "0xTxHash" },
      });

      const result = await executeRebalance(
        "0xAccount",
        mockParams,
        "0xKey",
        [],
        undefined,
        "data"
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("UserOp reverted");
    });
  });

  describe("simulateRebalance", () => {
    it("should return success if all calls pass", async () => {
      const result = await simulateRebalance("0xAccount", mockParams, "0xKey");
      expect(result.success).toBe(true);
      expect(mockCall).toHaveBeenCalledTimes(3);
    });

    it("should return error if simulation fails", async () => {
      mockCall.mockRejectedValueOnce(new Error("Revert"));

      const result = await simulateRebalance("0xAccount", mockParams, "0xKey");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Simulation failed");
    });
  });
});
