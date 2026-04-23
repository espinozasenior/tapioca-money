import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  validateTransferSession,
  createTransferSessionKey,
  TransferSessionAuthorization,
} from "@/lib/zerodev/transfer-session";
import {
  verifyDelegationTarget,
  getExpectedDelegationTarget,
} from "@/lib/zerodev/delegation-verification";
import { revokeSession, isSessionRevoked } from "@/lib/security/session-revocation";

// Mocks
const {
  mockGetCacheInterface,
  mockCreateKernelAccount,
  mockSignerToEcdsaValidator,
  mockToPermissionValidator,
  mockSerializePermissionAccount,
  mockToCallPolicy,
  mockToECDSASigner,
  mockGeneratePrivateKey,
  mockPrivateKeyToAccount,
} = vi.hoisted(() => ({
  mockGetCacheInterface: vi.fn(),
  mockCreateKernelAccount: vi.fn(),
  mockSignerToEcdsaValidator: vi.fn(),
  mockToPermissionValidator: vi.fn(),
  mockSerializePermissionAccount: vi.fn(),
  mockToCallPolicy: vi.fn(),
  mockToECDSASigner: vi.fn(),
  mockGeneratePrivateKey: vi.fn(),
  mockPrivateKeyToAccount: vi.fn(),
}));

vi.mock("@/lib/redis/client", () => ({
  getCacheInterface: mockGetCacheInterface,
}));

vi.mock("@/lib/config", () => ({
  CHAIN_CONFIG: { rpcUrl: "http://localhost:8545" },
  USDC_ADDRESS: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  USDC_PAYMASTER_ADDRESS: "0x7EE87982c03463DbAfe27A50b3D8e4FfAf1435F7",
  FEE_CAP_USDC: 200_000n,
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(),
    createWalletClient: vi.fn(),
    custom: vi.fn(),
    http: vi.fn(),
    encodeFunctionData: vi.fn(() => "0xencoded"),
  };
});

vi.mock("viem/accounts", () => ({
  generatePrivateKey: mockGeneratePrivateKey,
  privateKeyToAccount: mockPrivateKeyToAccount,
  toAccount: vi.fn(({ address }) => ({
    address,
    type: "local",
    signMessage: vi.fn(),
    signTransaction: vi.fn(),
    signTypedData: vi.fn(),
  })),
}));

vi.mock("@zerodev/sdk", () => ({
  createKernelAccount: mockCreateKernelAccount,
}));

vi.mock("@zerodev/sdk/constants", () => ({
  KERNEL_V3_3: "0.3.3",
  KernelVersionToAddressesMap: {
    "0.3.3": { accountImplementationAddress: "0xKernelV3Impl" },
  },
}));

vi.mock("@zerodev/ecdsa-validator", () => ({
  signerToEcdsaValidator: mockSignerToEcdsaValidator,
}));

vi.mock("@zerodev/permissions", () => ({
  toPermissionValidator: mockToPermissionValidator,
  serializePermissionAccount: mockSerializePermissionAccount,
}));

vi.mock("@zerodev/permissions/policies", () => ({
  toCallPolicy: mockToCallPolicy,
  CallPolicyVersion: { V0_0_5: "0.0.5" },
  toGasPolicy: vi.fn(),
  toRateLimitPolicy: vi.fn(),
  toTimestampPolicy: vi.fn(),
  ParamCondition: {
    LESS_THAN_OR_EQUAL: "LESS_THAN_OR_EQUAL",
    EQUAL: "EQUAL",
  },
}));

vi.mock("@zerodev/permissions/signers", () => ({
  toECDSASigner: mockToECDSASigner,
}));

describe("ZeroDev Session Management", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("transfer-session", () => {
    describe("validateTransferSession", () => {
      const validAuth: TransferSessionAuthorization = {
        type: "zerodev-transfer-session",
        smartAccountAddress: "0xAccount" as `0x${string}`,
        sessionKeyAddress: "0xKey" as `0x${string}`,
        serializedAccount: "base64data",
        expiry: Math.floor(Date.now() / 1000) + 3600,
        createdAt: Date.now(),
      };

      it("should return valid for auth with serializedAccount", () => {
        expect(validateTransferSession(validAuth).valid).toBe(true);
      });

      it("should return valid for legacy auth with sessionPrivateKey", () => {
        const legacyAuth: TransferSessionAuthorization = {
          type: "zerodev-transfer-session",
          smartAccountAddress: "0xAccount" as `0x${string}`,
          sessionKeyAddress: "0xKey" as `0x${string}`,
          sessionPrivateKey: "0xPriv" as `0x${string}`,
          expiry: Math.floor(Date.now() / 1000) + 3600,
          createdAt: Date.now(),
        };
        expect(validateTransferSession(legacyAuth).valid).toBe(true);
      });

      it("should return invalid if expired", () => {
        const expiredAuth = { ...validAuth, expiry: Math.floor(Date.now() / 1000) - 3600 };
        const result = validateTransferSession(expiredAuth);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe("Session expired");
      });

      it("should return invalid if wrong type", () => {
        const invalidAuth = { ...validAuth, type: "wrong-type" as any };
        const result = validateTransferSession(invalidAuth);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe("Invalid session type");
      });

      it("should return invalid if missing both serializedAccount and sessionPrivateKey", () => {
        const invalidAuth = {
          ...validAuth,
          serializedAccount: undefined as any,
          sessionPrivateKey: undefined as any,
        };
        const result = validateTransferSession(invalidAuth);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe("Invalid session data");
      });
    });

    describe("createTransferSessionKey", () => {
      it("should create session key and serialize account", async () => {
        const mockWallet = {
          getEthereumProvider: vi.fn().mockResolvedValue({}),
          address: "0xUser",
        };

        mockGeneratePrivateKey.mockReturnValue("0xSessionPriv");
        mockPrivateKeyToAccount.mockReturnValue({ address: "0xSessionKey" });
        mockCreateKernelAccount.mockResolvedValue({ address: "0xSmartAccount" });
        mockSerializePermissionAccount.mockResolvedValue("base64SerializedAccount");

        const result = await createTransferSessionKey(mockWallet, "0xUser" as `0x${string}`);

        expect(result.type).toBe("zerodev-transfer-session");
        expect(result.smartAccountAddress).toBe("0xSmartAccount");
        expect(result.sessionKeyAddress).toBe("0xSessionKey");
        expect(result.serializedAccount).toBe("base64SerializedAccount");
        // New sessions should NOT have sessionPrivateKey
        expect(result.sessionPrivateKey).toBeUndefined();
        // Verify serializePermissionAccount was called with the kernel account and session key
        expect(mockSerializePermissionAccount).toHaveBeenCalledWith(
          expect.objectContaining({ address: "0xSmartAccount" }),
          "0xSessionPriv",
          undefined
        );
        expect(mockCreateKernelAccount).toHaveBeenCalled();
      });

      it("should throw on error", async () => {
        const mockWallet = {
          getEthereumProvider: vi.fn().mockRejectedValue(new Error("Provider error")),
          address: "0xUser",
        };

        await expect(createTransferSessionKey(mockWallet, "0xUser")).rejects.toThrow(
          "Transfer session setup failed"
        );
      });
    });

    // CT-2 regression guard: the CallPolicy v2 contract with the paymaster
    // is the load-bearing security boundary. If a future refactor drops
    // either permission OR un-pins the spender, a leaked session key could
    // approve arbitrary contracts. These tests FAIL LOUDLY on regression.
    describe("CallPolicy v2 shape (paymaster-approve + transfer)", () => {
      const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
      const PAYMASTER = "0x7EE87982c03463DbAfe27A50b3D8e4FfAf1435F7";

      let permissions: any[];

      beforeEach(async () => {
        const mockWallet = {
          getEthereumProvider: vi.fn().mockResolvedValue({}),
          address: "0xUser",
        };
        mockGeneratePrivateKey.mockReturnValue("0xSessionPriv");
        mockPrivateKeyToAccount.mockReturnValue({ address: "0xSessionKey" });
        mockCreateKernelAccount.mockResolvedValue({ address: "0xSmartAccount" });
        mockSerializePermissionAccount.mockResolvedValue("base64");

        await createTransferSessionKey(mockWallet, "0xUser" as `0x${string}`);

        // toCallPolicy is called with { policyVersion, permissions: [...] }
        expect(mockToCallPolicy).toHaveBeenCalled();
        const call = mockToCallPolicy.mock.calls[0][0];
        permissions = call.permissions;
      });

      it("stamps permissionsVersion: 2 on the returned session", async () => {
        const mockWallet = {
          getEthereumProvider: vi.fn().mockResolvedValue({}),
          address: "0xUser",
        };
        mockGeneratePrivateKey.mockReturnValue("0xSessionPriv");
        mockPrivateKeyToAccount.mockReturnValue({ address: "0xSessionKey" });
        mockCreateKernelAccount.mockResolvedValue({ address: "0xSmartAccount" });
        mockSerializePermissionAccount.mockResolvedValue("base64");

        const out = await createTransferSessionKey(mockWallet, "0xUser" as `0x${string}`);
        expect(out.permissionsVersion).toBe(2);
      });

      it("contains exactly two permissions: transfer and approve", () => {
        expect(permissions).toHaveLength(2);
        const fns = permissions.map((p) => p.functionName);
        expect(fns).toContain("transfer");
        expect(fns).toContain("approve");
      });

      it("transfer permission targets USDC with a ≤ $500 cap", () => {
        const transfer = permissions.find((p) => p.functionName === "transfer");
        expect(transfer).toBeDefined();
        expect(transfer.target.toLowerCase()).toBe(USDC.toLowerCase());
        expect(transfer.valueLimit).toBe(0n);
        const [recipientArg, amountArg] = transfer.args;
        expect(recipientArg).toBeNull(); // any recipient allowed
        expect(amountArg.condition).toBe("LESS_THAN_OR_EQUAL");
        expect(amountArg.value).toBe(500n * 10n ** 6n);
      });

      it("approve permission pins spender to paymaster with ParamCondition.EQUAL", () => {
        const approve = permissions.find((p) => p.functionName === "approve");
        expect(approve).toBeDefined();
        expect(approve.target.toLowerCase()).toBe(USDC.toLowerCase());
        expect(approve.valueLimit).toBe(0n);

        const [spenderArg, amountArg] = approve.args;
        // LOAD-BEARING INVARIANT: spender pinned via EQUAL to the paymaster.
        // If this drifts to LESS_THAN_OR_EQUAL or null, a leaked session key
        // can approve any spender.
        expect(spenderArg.condition).toBe("EQUAL");
        expect(String(spenderArg.value).toLowerCase()).toBe(PAYMASTER.toLowerCase());

        // Amount capped at FEE_CAP_USDC (0.20 USDC).
        expect(amountArg.condition).toBe("LESS_THAN_OR_EQUAL");
        expect(amountArg.value).toBe(200_000n);
      });

      it("does NOT contain any permission that lets the session key approve arbitrary contracts", () => {
        const approve = permissions.find((p) => p.functionName === "approve");
        // Sanity: any approve permission MUST have the spender pinned.
        expect(approve.args[0].condition).not.toBe("LESS_THAN_OR_EQUAL");
        expect(approve.args[0].value).toBeTruthy();
      });
    });
  });

  describe("delegation-verification", () => {
    it("should return expected delegation target", () => {
      expect(getExpectedDelegationTarget()).toBe("0xKernelV3Impl");
    });

    it("should verify delegation target correctly", () => {
      expect(verifyDelegationTarget("0xKernelV3Impl")).toBe(true);
      expect(verifyDelegationTarget("0xkernelv3impl")).toBe(true); // case insensitive
      expect(verifyDelegationTarget("0xWrong")).toBe(false);
    });
  });

  describe("session-revocation", () => {
    const mockCache = {
      set: vi.fn(),
      get: vi.fn(),
    };

    beforeEach(() => {
      mockGetCacheInterface.mockResolvedValue(mockCache);
    });

    it("should revoke session", async () => {
      await revokeSession("0xSessionKey");
      expect(mockCache.set).toHaveBeenCalledWith(
        "session:revoked:0xsessionkey",
        expect.any(String),
        expect.any(Number)
      );
    });

    it("should return true if session revoked", async () => {
      mockCache.get.mockResolvedValue("revoked");
      const result = await isSessionRevoked("0xSessionKey");
      expect(result).toBe(true);
    });

    it("should return false if session not revoked", async () => {
      mockCache.get.mockResolvedValue(null);
      const result = await isSessionRevoked("0xSessionKey");
      expect(result).toBe(false);
    });
  });
});
