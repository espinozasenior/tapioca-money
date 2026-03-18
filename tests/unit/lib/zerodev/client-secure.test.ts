import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  serializeSignedAuth,
  checkSmartAccountActive,
  revokeSessionKey,
  undelegateEoa,
  registerAgentSecure,
  delegateViaExternalWallet,
  registerAgentSecureExternal,
} from "@/lib/zerodev/client-secure";

// Mock dependencies
const mockPublicClient = {
  getBytecode: vi.fn(),
  waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "success" }),
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
  ParamCondition: { LESS_THAN_OR_EQUAL: 1, EQUAL: 2 },
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
      // YO Gateway address is also included for session key scoping
      expect(result.approvedVaults).toHaveLength(3);
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

  describe("delegateViaExternalWallet", () => {
    it("should check capabilities, switch chain, and send Type 4 tx", async () => {
      const mockWalletClient = {
        request: vi
          .fn()
          // First call: wallet_getCapabilities
          .mockResolvedValueOnce({ "0x2105": { atomic: { status: "supported" } } })
          // Second call: eth_sendTransaction
          .mockResolvedValueOnce("0xdelegationtx"),
        switchChain: vi.fn().mockResolvedValue(undefined),
      };
      const implAddress = "0x2222222222222222222222222222222222222222" as `0x${string}`;

      // Mock receipt with eip7702 type
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        status: "success",
        type: "eip7702",
      });

      // Mock delegation verification — return valid delegation bytecode
      const delegationBytecode = "0xef0100" + implAddress.slice(2);
      mockPublicClient.getBytecode.mockResolvedValue(delegationBytecode);

      const txHash = await delegateViaExternalWallet(mockWalletClient, mockAddress, implAddress);

      // Verify capability check
      expect(mockWalletClient.request).toHaveBeenNthCalledWith(1, {
        method: "wallet_getCapabilities",
        params: [mockAddress],
      });
      expect(mockWalletClient.switchChain).toHaveBeenCalledWith({ id: 8453 });
      // Verify eth_sendTransaction with type "0x4"
      expect(mockWalletClient.request).toHaveBeenNthCalledWith(2, {
        method: "eth_sendTransaction",
        params: [
          expect.objectContaining({
            type: "0x4",
            from: mockAddress,
            to: mockAddress,
            authorizationList: [
              {
                address: implAddress,
                chainId: "0x2105",
              },
            ],
          }),
        ],
      });
      expect(txHash).toBe("0xdelegationtx");
    });

    it("should throw immediately if wallet lacks 7702 support", async () => {
      const mockWalletClient = {
        request: vi
          .fn()
          // wallet_getCapabilities returns no 7702 support
          .mockResolvedValueOnce({ "0x2105": {} }),
        switchChain: vi.fn(),
      };
      const implAddress = "0x2222222222222222222222222222222222222222" as `0x${string}`;

      await expect(
        delegateViaExternalWallet(mockWalletClient, mockAddress, implAddress)
      ).rejects.toThrow("does not support EIP-7702");

      // Should NOT have attempted sendTransaction
      expect(mockWalletClient.request).toHaveBeenCalledTimes(1);
      expect(mockWalletClient.switchChain).not.toHaveBeenCalled();
    });

    it("should throw if wallet_getCapabilities is not supported", async () => {
      const mockWalletClient = {
        request: vi
          .fn()
          // wallet_getCapabilities throws (not supported)
          .mockRejectedValueOnce(new Error("method not found")),
        switchChain: vi.fn(),
      };
      const implAddress = "0x2222222222222222222222222222222222222222" as `0x${string}`;

      await expect(
        delegateViaExternalWallet(mockWalletClient, mockAddress, implAddress)
      ).rejects.toThrow("does not support EIP-7702");
    });

    it("should add chain if switchChain returns 4902", async () => {
      const mockWalletClient = {
        request: vi
          .fn()
          .mockResolvedValueOnce({ "0x2105": { atomic: { status: "ready" } } })
          .mockResolvedValueOnce("0xdelegationtx"),
        switchChain: vi
          .fn()
          .mockRejectedValueOnce({ code: 4902, message: "chain not added" })
          .mockResolvedValueOnce(undefined),
        addChain: vi.fn().mockResolvedValue(undefined),
      };
      const implAddress = "0x2222222222222222222222222222222222222222" as `0x${string}`;

      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        status: "success",
        type: "eip7702",
      });
      const delegationBytecode = "0xef0100" + implAddress.slice(2);
      mockPublicClient.getBytecode.mockResolvedValue(delegationBytecode);

      const txHash = await delegateViaExternalWallet(mockWalletClient, mockAddress, implAddress);

      expect(mockWalletClient.addChain).toHaveBeenCalled();
      expect(mockWalletClient.switchChain).toHaveBeenCalledTimes(2);
      expect(txHash).toBe("0xdelegationtx");
    });

    it("should throw if tx type is not eip7702", async () => {
      const mockWalletClient = {
        request: vi
          .fn()
          .mockResolvedValueOnce({ "0x2105": { atomic: { status: "supported" } } })
          .mockResolvedValueOnce("0xplaintx"),
        switchChain: vi.fn().mockResolvedValue(undefined),
      };
      const implAddress = "0x2222222222222222222222222222222222222222" as `0x${string}`;

      // Receipt type is regular eip1559, not eip7702
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        status: "success",
        type: "eip1559",
      });

      await expect(
        delegateViaExternalWallet(mockWalletClient, mockAddress, implAddress)
      ).rejects.toThrow("regular transaction instead of EIP-7702");
    });

    it("should throw if delegation not detected after Type 4 tx", async () => {
      const mockWalletClient = {
        request: vi
          .fn()
          .mockResolvedValueOnce({ "0x2105": { atomic: { status: "supported" } } })
          .mockResolvedValueOnce("0xfailedtx"),
        switchChain: vi.fn().mockResolvedValue(undefined),
      };
      const implAddress = "0x3333333333333333333333333333333333333333" as `0x${string}`;

      // Receipt is Type 4 but delegation didn't stick
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        status: "success",
        type: "eip7702",
      });
      // Mock: no delegation bytecode found after tx
      mockPublicClient.getBytecode.mockResolvedValue("0x");

      await expect(
        delegateViaExternalWallet(mockWalletClient, mockAddress, implAddress)
      ).rejects.toThrow("delegation not detected on-chain");
    });
  });

  describe("registerAgentSecureExternal", () => {
    const mockWalletClient = {
      signMessage: vi.fn(),
      signTypedData: vi.fn(),
    };

    it("should register external wallet successfully when delegation is on-chain", async () => {
      // Mock delegation check — active delegation
      const implBytecode = "0xef0100" + "44".repeat(20);
      mockPublicClient.getBytecode.mockResolvedValue(implBytecode);

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

      const result = await registerAgentSecureExternal(mockAddress, "token", mockWalletClient);

      expect(result.smartAccountAddress).toBe(mockAddress);
      expect(result.sessionKeyAddress).toBe("0xsessionKey");
      expect(result.approvedVaults).toEqual(expect.arrayContaining(["0xvault1", "0xvault2"]));
      expect(result.approvedVaults).toHaveLength(3); // 2 from /api/optimize + YO Gateway

      // Verify server call includes serialized account (no eip7702Auth)
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        "/api/agent/generate-session-key",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("mockSerializedAccount"),
        })
      );
    });

    it("should throw if delegation is not on-chain", async () => {
      // Mock: no delegation
      mockPublicClient.getBytecode.mockResolvedValue("0x");

      await expect(
        registerAgentSecureExternal(mockAddress, "token", mockWalletClient)
      ).rejects.toThrow("Delegation not found on-chain");
    });

    it("should handle optimization API failure", async () => {
      // Mock: delegation active
      mockPublicClient.getBytecode.mockResolvedValue("0xef0100" + "55".repeat(20));

      (global.fetch as any).mockResolvedValueOnce({ ok: false });

      await expect(
        registerAgentSecureExternal(mockAddress, "token", mockWalletClient)
      ).rejects.toThrow("Failed to fetch vault opportunities");
    });
  });

  // ── M-3: Vault share approve constrains spender to YO_GATEWAY_ADDRESS ──
  describe("M-3: buildSessionKeyAndPermissions approve spender constraint", () => {
    it("vault approve permission constrains spender to YO_GATEWAY_ADDRESS with EQUAL", async () => {
      const { toCallPolicy } = await import("@zerodev/permissions/policies");
      const { ParamCondition } = await import("@zerodev/permissions/policies");

      // Reset the mock to capture the next call
      (toCallPolicy as any).mockClear();

      // Trigger buildSessionKeyAndPermissions via registerAgentSecure
      // which internally calls it with the approved vaults
      const mockWalletClient = {
        signMessage: vi.fn(),
        signTypedData: vi.fn(),
      };

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            opportunities: [
              { metadata: { vaultAddress: "0xABCD000000000000000000000000000000000001" } },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });

      await registerAgentSecure(mockAddress, "token", { chainId: 1n, nonce: 0n }, mockWalletClient);

      // toCallPolicy should have been called with permissions array
      expect(toCallPolicy).toHaveBeenCalledTimes(1);
      const callPolicyArgs = (toCallPolicy as any).mock.calls[0][0];
      const permissions = callPolicyArgs.permissions;

      // Find vault approve permissions (target is the vault address, functionName is "approve")
      const vaultApprovePerms = permissions.filter(
        (p: any) =>
          p.functionName === "approve" &&
          p.target?.toLowerCase() !== "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" // Not USDC approve
      );

      expect(vaultApprovePerms.length).toBeGreaterThanOrEqual(1);

      // Each vault approve must constrain the spender (args[0]) to YO_GATEWAY_ADDRESS
      for (const perm of vaultApprovePerms) {
        expect(perm.args[0]).toEqual(
          expect.objectContaining({
            condition: ParamCondition.EQUAL,
          })
        );
        // The value should be a hex address (YO_GATEWAY_ADDRESS)
        expect(perm.args[0].value).toBeDefined();
        expect(typeof perm.args[0].value).toBe("string");
        expect(perm.args[0].value).toMatch(/^0x[a-fA-F0-9]{40}$/);
      }
    });

    it("USDC approve does NOT constrain spender (allows any spender)", async () => {
      const { toCallPolicy } = await import("@zerodev/permissions/policies");
      (toCallPolicy as any).mockClear();

      const mockWalletClient = {
        signMessage: vi.fn(),
        signTypedData: vi.fn(),
      };

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            opportunities: [
              { metadata: { vaultAddress: "0xABCD000000000000000000000000000000000002" } },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });

      await registerAgentSecure(mockAddress, "token", { chainId: 1n, nonce: 0n }, mockWalletClient);

      const callPolicyArgs = (toCallPolicy as any).mock.calls[0][0];
      const permissions = callPolicyArgs.permissions;

      // USDC approve: target is USDC_ADDRESS, spender arg (args[0]) is null (unconstrained)
      const usdcApprove = permissions.find(
        (p: any) =>
          p.functionName === "approve" &&
          p.target?.toLowerCase() === "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
      );

      expect(usdcApprove).toBeDefined();
      expect(usdcApprove.args[0]).toBeNull(); // No spender constraint on USDC approve
    });
  });
});
