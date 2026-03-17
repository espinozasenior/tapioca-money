import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createDeserializedKernelClient,
  verifyDelegationAfterExecution,
  createSessionKernelClient,
} from "@/lib/zerodev/kernel-client";
import { checkSmartAccountActive } from "@/lib/zerodev/client-secure";

// Mock dependencies
const mockGetCode = vi.fn().mockResolvedValue("0xef0100abc123");
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "success" }),
      getCode: mockGetCode,
    })),
    http: vi.fn(),
  };
});

vi.mock("@/lib/zerodev/client-secure", () => ({
  checkSmartAccountActive: vi.fn(),
}));

const mockKernelClient = {
  sendUserOperation: vi.fn(),
  waitForUserOperationReceipt: vi.fn(),
};
vi.mock("@zerodev/sdk", () => ({
  createKernelAccountClient: vi.fn().mockResolvedValue(mockKernelClient),
  createKernelAccount: vi.fn().mockResolvedValue({ address: "0xkernel" }),
}));

vi.mock("@zerodev/sdk/constants", () => ({
  KERNEL_V3_3: "0.3.3",
  KernelVersionToAddressesMap: {
    "0.3.3": { accountImplementationAddress: "0xactiveImpl" },
  },
}));

const mockGetFactoryArgs = vi.fn().mockResolvedValue({
  factory: "0xd703aaE79538628d27099B8c4f621bE4CCd142d5",
  factoryData: "0xc5265d5d",
});
vi.mock("@zerodev/permissions", () => ({
  deserializePermissionAccount: vi.fn().mockResolvedValue({
    address: "0xdeserialized",
    getFactoryArgs: mockGetFactoryArgs,
  }),
  toPermissionValidator: vi.fn(),
}));

vi.mock("@zerodev/permissions/policies", () => ({
  toCallPolicy: vi.fn(),
  CallPolicyVersion: { V0_0_5: "0.0.5" },
  toGasPolicy: vi.fn(),
  toRateLimitPolicy: vi.fn(),
}));

vi.mock("@zerodev/permissions/signers", () => ({
  toECDSASigner: vi.fn(),
}));

describe("Kernel Client (ZeroDev)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ZERODEV_PROJECT_ID = "mock-project-id";
  });

  describe("createDeserializedKernelClient", () => {
    it("should deserialize and create client", async () => {
      const result = await createDeserializedKernelClient("mockSerialized");

      expect(result.sendUserOperation).toBeDefined();
    });

    it("should strip factory when account has on-chain code (AA14 fix)", async () => {
      // Account has delegation code on-chain
      mockGetCode.mockResolvedValueOnce("0xef0100abc123");
      // Account has factory from serialization
      mockGetFactoryArgs.mockResolvedValueOnce({
        factory: "0xd703aaE79538628d27099B8c4f621bE4CCd142d5",
        factoryData: "0xc5265d5d",
      });

      await createDeserializedKernelClient("mockSerialized");

      // The deserialized account should have factory stripped
      const { deserializePermissionAccount } = await import("@zerodev/permissions");
      const account = await (deserializePermissionAccount as any).mock.results[0]?.value;
      if (account) {
        // After the fix, getFactoryArgs should return undefined factory
        const { factory } = await account.getFactoryArgs();
        expect(factory).toBeUndefined();
      }
    });

    it("should strip factory even when account has no on-chain code", async () => {
      // Account not deployed yet — factory should still be stripped because
      // our accounts always use an explicit address, and the factory's CREATE2
      // would compute a different address (AA14).
      mockGetFactoryArgs.mockResolvedValueOnce({
        factory: "0xd703aaE79538628d27099B8c4f621bE4CCd142d5",
        factoryData: "0xc5265d5d",
      });

      await createDeserializedKernelClient("mockSerialized");

      // Factory should be stripped regardless of on-chain code
      const { deserializePermissionAccount } = await import("@zerodev/permissions");
      const account = await (deserializePermissionAccount as any).mock.results[0]?.value;
      if (account) {
        const { factory } = await account.getFactoryArgs();
        expect(factory).toBeUndefined();
      }
    });
  });

  describe("verifyDelegationAfterExecution", () => {
    it("should return true if delegation is active", async () => {
      (checkSmartAccountActive as any).mockResolvedValue({
        active: true,
        isDelegation: true,
        implementationAddress: "0xactiveImpl",
      });

      const result = await verifyDelegationAfterExecution("0xuser", "0xtxhash");

      expect(result).toBe(true);
      expect(checkSmartAccountActive).toHaveBeenCalledWith("0xuser");
    });

    it("should return false if delegation is inactive", async () => {
      (checkSmartAccountActive as any).mockResolvedValue({
        active: false,
      });

      const result = await verifyDelegationAfterExecution("0xuser", "0xtxhash");

      expect(result).toBe(false);
    });
  });

  describe("createSessionKernelClient (Legacy)", () => {
    const mockParams = {
      smartAccountAddress: "0xkernel" as `0x${string}`,
      // Valid 32-byte private key
      sessionPrivateKey:
        "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" as `0x${string}`,
      permissions: [],
      eip7702SignedAuth: { v: "1" },
    };

    it("should throw if no permissions provided", async () => {
      await expect(createSessionKernelClient(mockParams)).rejects.toThrow(
        "Session key requires explicit permissions"
      );
    });

    it("should create client if delegation is active", async () => {
      (checkSmartAccountActive as any).mockResolvedValue({
        active: true,
        isDelegation: true,
        implementationAddress: "0xactiveImpl",
      });

      // Add a permission to pass validation
      const validParams = {
        ...mockParams,
        permissions: [{ target: "0x123", selector: "0x12345678" }],
      };

      const result = await createSessionKernelClient(validParams as any);

      expect(result).toBeDefined();
    });
  });
});
