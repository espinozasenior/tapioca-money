import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createDeserializedKernelClient,
  verifyDelegationAfterExecution,
  createSessionKernelClient,
} from "@/lib/zerodev/kernel-client";
import { checkSmartAccountActive } from "@/lib/zerodev/client-secure";

// Mock dependencies
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "success" }),
    })),
    http: vi.fn(),
  };
});

vi.mock("@/lib/zerodev/client-secure", () => ({
  checkSmartAccountActive: vi.fn(),
}));

vi.mock("@zerodev/sdk", () => ({
  createKernelAccountClient: vi.fn().mockResolvedValue("mockKernelClient"),
  createKernelAccount: vi.fn().mockResolvedValue({ address: "0xkernel" }),
}));

vi.mock("@zerodev/sdk/constants", () => ({
  KERNEL_V3_3: "0.3.3",
  KernelVersionToAddressesMap: {
    "0.3.3": { accountImplementationAddress: "0xactiveImpl" },
  },
}));

vi.mock("@zerodev/permissions", () => ({
  deserializePermissionAccount: vi.fn().mockResolvedValue({
    address: "0xdeserialized",
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

      expect(result).toBe("mockKernelClient");
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

      expect(result).toBe("mockKernelClient");
    });
  });
});
