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
  mockToCallPolicy,
  mockToECDSASigner,
  mockGeneratePrivateKey,
  mockPrivateKeyToAccount,
} = vi.hoisted(() => ({
  mockGetCacheInterface: vi.fn(),
  mockCreateKernelAccount: vi.fn(),
  mockSignerToEcdsaValidator: vi.fn(),
  mockToPermissionValidator: vi.fn(),
  mockToCallPolicy: vi.fn(),
  mockToECDSASigner: vi.fn(),
  mockGeneratePrivateKey: vi.fn(),
  mockPrivateKeyToAccount: vi.fn(),
}));

vi.mock("@/lib/redis/client", () => ({
  getCacheInterface: mockGetCacheInterface,
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
}));

vi.mock("@zerodev/permissions/policies", () => ({
  toCallPolicy: mockToCallPolicy,
  CallPolicyVersion: { V0_0_5: "0.0.5" },
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
        smartAccountAddress: "0xAccount",
        sessionKeyAddress: "0xKey",
        sessionPrivateKey: "0xPriv",
        expiry: Math.floor(Date.now() / 1000) + 3600,
        createdAt: Date.now(),
      };

      it("should return valid for correct auth", () => {
        expect(validateTransferSession(validAuth).valid).toBe(true);
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

      it("should return invalid if missing fields", () => {
        const invalidAuth = { ...validAuth, sessionPrivateKey: undefined as any };
        const result = validateTransferSession(invalidAuth);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe("Invalid session data");
      });
    });

    describe("createTransferSessionKey", () => {
      it("should create session key successfully", async () => {
        const mockWallet = {
          getEthereumProvider: vi.fn().mockResolvedValue({}),
          address: "0xUser",
        };

        mockGeneratePrivateKey.mockReturnValue("0xSessionPriv");
        mockPrivateKeyToAccount.mockReturnValue({ address: "0xSessionKey" });
        mockCreateKernelAccount.mockResolvedValue({ address: "0xSmartAccount" });

        const result = await createTransferSessionKey(mockWallet, "0xUser");

        expect(result.type).toBe("zerodev-transfer-session");
        expect(result.smartAccountAddress).toBe("0xSmartAccount");
        expect(result.sessionKeyAddress).toBe("0xSessionKey");
        expect(result.sessionPrivateKey).toBe("0xSessionPriv");
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
