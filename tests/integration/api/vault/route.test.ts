import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// 1. Define mock implementation first
const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }));

// 2. Mock modules
vi.mock("@neondatabase/serverless", () => ({
  neon: () => mockSql,
}));

vi.mock("@/lib/auth/middleware", () => ({
  authenticateRequest: vi.fn(),
  unauthorizedResponse: vi
    .fn()
    .mockReturnValue({ status: 401, json: async () => ({ error: "Unauthorized" }) }),
}));

vi.mock("@/lib/security/session-encryption", () => ({
  decryptAuthorization: vi.fn(),
}));

vi.mock("@/lib/zerodev/deposit-executor", () => ({
  executeGaslessDeposit: vi.fn(),
}));

vi.mock("@/lib/zerodev/vault-executor", () => ({
  executeVaultRedeem: vi.fn(),
}));

vi.mock("@/lib/redis/rate-limiter", () => ({
  incrementUserOpCount: vi.fn(),
}));

// 3. Import modules under test
import { POST as depositPOST } from "@/app/api/vault/deposit/route";
import { POST as redeemPOST } from "@/app/api/vault/redeem/route";
import { authenticateRequest } from "@/lib/auth/middleware";
import { decryptAuthorization } from "@/lib/security/session-encryption";
import { executeGaslessDeposit } from "@/lib/zerodev/deposit-executor";
import { executeVaultRedeem } from "@/lib/zerodev/vault-executor";

describe("Vault API", () => {
  const mockUserAddress = "0xuser" as `0x${string}`;
  const mockVaultAddress = "0x1234567890123456789012345678901234567890" as `0x${string}`;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default happy path mocks
    (authenticateRequest as any).mockResolvedValue({
      authenticated: true,
      walletAddress: mockUserAddress,
      allWalletAddresses: [mockUserAddress],
    });

    mockSql.mockResolvedValue([
      {
        wallet_address: mockUserAddress,
        authorization_7702: {
          type: "zerodev-7702-session",
          expiry: Math.floor(Date.now() / 1000) + 3600,
          approvedVaults: [mockVaultAddress],
        },
      },
    ]);

    (decryptAuthorization as any).mockReturnValue({
      eoaAddress: mockUserAddress,
      sessionPrivateKey: "0xpriv",
      serializedAccount: "mockSerialized",
    });

    (executeGaslessDeposit as any).mockResolvedValue({
      success: true,
      txHash: "0xtxhash",
      userOpHash: "0xopHash",
    });

    (executeVaultRedeem as any).mockResolvedValue({
      success: true,
      txHash: "0xtxhash",
      userOpHash: "0xopHash",
    });
  });

  const createRequest = (url: string, body: any) => {
    return new NextRequest(url, {
      method: "POST",
      body: JSON.stringify(body),
    });
  };

  describe("POST /deposit", () => {
    it("should return 400 if fields missing", async () => {
      const req = createRequest("http://localhost/api/vault/deposit", { amount: "10" });
      const res = await depositPOST(req);
      expect(res.status).toBe(400);
    });

    it("should return 401 if unauthorized", async () => {
      (authenticateRequest as any).mockResolvedValue({
        authenticated: false,
        error: "Unauthorized",
      });

      const req = createRequest("http://localhost/api/vault/deposit", {
        vaultAddress: mockVaultAddress,
        amount: "10",
      });
      const res = await depositPOST(req);

      expect(res.status).toBe(401);
    });

    it("should return 400 if not registered", async () => {
      mockSql.mockResolvedValue([]);

      const req = createRequest("http://localhost/api/vault/deposit", {
        vaultAddress: mockVaultAddress,
        amount: "10",
      });
      const res = await depositPOST(req);

      expect(res.status).toBe(400);
    });

    it("should return 400 if session expired", async () => {
      mockSql.mockResolvedValue([
        {
          wallet_address: mockUserAddress,
          authorization_7702: {
            type: "zerodev-7702-session",
            expiry: Math.floor(Date.now() / 1000) - 3600, // Expired
          },
        },
      ]);

      const req = createRequest("http://localhost/api/vault/deposit", {
        vaultAddress: mockVaultAddress,
        amount: "10",
      });
      const res = await depositPOST(req);

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual(
        expect.objectContaining({ error: expect.stringContaining("expired") })
      );
    });

    it("should return 403 if vault not approved", async () => {
      mockSql.mockResolvedValue([
        {
          wallet_address: mockUserAddress,
          authorization_7702: {
            type: "zerodev-7702-session",
            expiry: Math.floor(Date.now() / 1000) + 3600,
            approvedVaults: ["0xother"],
          },
        },
      ]);

      const req = createRequest("http://localhost/api/vault/deposit", {
        vaultAddress: mockVaultAddress,
        amount: "10",
      });
      const res = await depositPOST(req);

      expect(res.status).toBe(403);
    });

    it("should execute deposit and return success", async () => {
      const req = createRequest("http://localhost/api/vault/deposit", {
        vaultAddress: mockVaultAddress,
        amount: "10",
      });
      const res = await depositPOST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(executeGaslessDeposit).toHaveBeenCalled();
    });

    it("should handle execution failure", async () => {
      (executeGaslessDeposit as any).mockResolvedValue({
        success: false,
        error: "Deposit failed",
      });

      const req = createRequest("http://localhost/api/vault/deposit", {
        vaultAddress: mockVaultAddress,
        amount: "10",
      });
      const res = await depositPOST(req);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.error).toBe("Deposit failed");
    });
  });

  describe("POST /redeem", () => {
    it("should return 400 if fields missing", async () => {
      const req = createRequest("http://localhost/api/vault/redeem", { shares: "100" });
      const res = await redeemPOST(req);
      expect(res.status).toBe(400);
    });

    it("should execute redeem and return success", async () => {
      const req = createRequest("http://localhost/api/vault/redeem", {
        vaultAddress: mockVaultAddress,
        shares: "100",
      });
      const res = await redeemPOST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(executeVaultRedeem).toHaveBeenCalled();
    });

    it("should handle known error codes", async () => {
      (executeVaultRedeem as any).mockResolvedValue({
        success: false,
        error: "0xace2a47e",
      });

      const req = createRequest("http://localhost/api/vault/redeem", {
        vaultAddress: mockVaultAddress,
        shares: "100",
      });
      const res = await redeemPOST(req);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.error).toContain("This vault rejected the redeem");
    });
  });
});
