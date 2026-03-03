import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  serializeSignedAuth,
  checkSmartAccountActive,
  revokeSessionKey,
  undelegateEoa,
  registerAgentSecure,
} from "@/lib/zerodev/client-secure";

// Mock dependencies
const mockPublicClient = {
  getBytecode: vi.fn(),
};

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => mockPublicClient),
    http: vi.fn(),
    parseAbi: vi.fn((abi) => abi), // Simple pass-through
    toAccount: vi.fn((config) => ({ ...config, type: "local" })),
  };
});

// Mock ZeroDev SDKs (used via dynamic imports in the code under test)
vi.mock("@zerodev/sdk", () => ({
  createKernelAccount: vi.fn().mockResolvedValue({
    address: "0xkernel",
  }),
}));

vi.mock("@zerodev/sdk/constants", () => ({
  KERNEL_V3_3: "0.3.3",
}));

vi.mock("@zerodev/permissions", () => ({
  toPermissionValidator: vi.fn().mockResolvedValue("mockValidator"),
  serializePermissionAccount: vi.fn().mockResolvedValue("mockSerializedAccount"),
}));

vi.mock("@zerodev/permissions/policies", () => ({
  toCallPolicy: vi.fn(),
  CallPolicyVersion: { V0_0_5: "0.0.5" },
  toGasPolicy: vi.fn(),
  toRateLimitPolicy: vi.fn(),
  toTimestampPolicy: vi.fn(),
  ParamCondition: { LESS_THAN_OR_EQUAL: 1 },
}));

vi.mock("@zerodev/permissions/signers", () => ({
  toECDSASigner: vi.fn().mockResolvedValue("mockSigner"),
}));

vi.mock("viem/accounts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem/accounts")>();
  return {
    ...actual,
    generatePrivateKey: vi.fn(() => "0xprivatekey"),
    privateKeyToAccount: vi.fn(() => ({ address: "0xsessionKey" })),
  };
});

describe("Client Secure (ZeroDev)", () => {
  const mockAddress = "0x1234567890123456789012345678901234567890" as `0x${string}`;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe("serializeSignedAuth", () => {
    it("should serialize BigInts to strings", () => {
      const auth = {
        chainId: 8453n,
        nonce: 1n,
        v: 27n,
        r: "0x...",
        s: "0x...",
      };

      const result = serializeSignedAuth(auth);

      expect(result.v).toBe("27");
      expect(result.yParity).toBe(27);
      expect(result.chainId).toBe(8453);
      expect(result.nonce).toBe(1);
    });

    it("should handle yParity field", () => {
      const auth = {
        chainId: 8453n,
        nonce: 1n,
        yParity: 1n,
      };

      const result = serializeSignedAuth(auth);

      expect(result.v).toBe("1");
      expect(result.yParity).toBe(1);
    });
  });

  describe("checkSmartAccountActive", () => {
    it("should return inactive if no bytecode", async () => {
      mockPublicClient.getBytecode.mockResolvedValue(undefined);

      const result = await checkSmartAccountActive(mockAddress);

      expect(result.active).toBe(false);
      expect(result.isDelegation).toBe(false);
    });

    it("should detect EIP-7702 delegation", async () => {
      // 0xef0100 + 20 bytes (40 chars)
      const implementation = "0x1111111111111111111111111111111111111111";
      const bytecode = "0xef0100" + implementation.slice(2); // 48 chars total length check

      mockPublicClient.getBytecode.mockResolvedValue(bytecode);

      const result = await checkSmartAccountActive(mockAddress);

      expect(result.active).toBe(true);
      expect(result.isDelegation).toBe(true);
      expect(result.implementationAddress).toBe(implementation);
    });

    it("should return active but not delegation for other bytecode", async () => {
      mockPublicClient.getBytecode.mockResolvedValue("0x123456");

      const result = await checkSmartAccountActive(mockAddress);

      expect(result.active).toBe(true);
      expect(result.isDelegation).toBe(false);
    });
  });

  describe("revokeSessionKey", () => {
    it("should call API with correct parameters", async () => {
      (global.fetch as any).mockResolvedValue({ ok: true });

      await revokeSessionKey(mockAddress, "token");

      expect(global.fetch).toHaveBeenCalledWith("/api/agent/generate-session-key", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token",
        },
        body: JSON.stringify({ address: mockAddress }),
      });
    });

    it("should throw on API error", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Failed" }),
      });

      await expect(revokeSessionKey(mockAddress, "token")).rejects.toThrow("Failed");
    });
  });

  describe("undelegateEoa", () => {
    it("should send transaction with pre-signed authorization and explicit gas", async () => {
      const mockWalletClient = {
        sendTransaction: vi.fn().mockResolvedValue("0xtxhash"),
      };
      const mockSignedAuth = { r: "0x1234", s: "0x5678", yParity: 0 };

      const result = await undelegateEoa(mockAddress, mockWalletClient, mockSignedAuth);

      expect(mockWalletClient.sendTransaction).toHaveBeenCalledWith({
        to: mockAddress,
        data: "0x",
        value: BigInt(0),
        authorizationList: [mockSignedAuth],
        gas: BigInt(30000),
      });
      expect(result).toBe("0xtxhash");
    });
  });

  describe("registerAgentSecure", () => {
    const mockWalletClient = {
      signMessage: vi.fn(),
      signTypedData: vi.fn(),
    };
    const mockAuth = { chainId: 1n, nonce: 0n };

    it("should register agent successfully", async () => {
      // Mock /api/optimize response
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            opportunities: [
              { metadata: { vaultAddress: "0xvault1" } },
              { metadata: { vaultAddress: "0xvault2" } },
            ],
          }),
        })
        // Mock /api/agent/generate-session-key response
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });

      const result = await registerAgentSecure(mockAddress, "token", mockAuth, mockWalletClient);

      expect(result.smartAccountAddress).toBe(mockAddress);
      expect(result.sessionKeyAddress).toBe("0xsessionKey");
      expect(result.approvedVaults).toEqual(expect.arrayContaining(["0xvault1", "0xvault2"]));
      // YO Gateway + Pendle Router + yoUSD vault addresses are also included for session key scoping
      expect(result.approvedVaults).toHaveLength(5);
      // serializedAccount is not returned, but sent to server

      // Verify fetch calls
      expect(global.fetch).toHaveBeenNthCalledWith(1, "/api/optimize");
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        "/api/agent/generate-session-key",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("mockSerializedAccount"),
        })
      );
    });

    it("should handle optimization API failure", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
      });

      await expect(
        registerAgentSecure(mockAddress, "token", mockAuth, mockWalletClient)
      ).rejects.toThrow("Failed to fetch vault opportunities");
    });

    it("should handle session key storage failure", async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ opportunities: [] }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: "Storage failed" }),
        });

      await expect(
        registerAgentSecure(mockAddress, "token", mockAuth, mockWalletClient)
      ).rejects.toThrow("Storage failed");
    });
  });
});
