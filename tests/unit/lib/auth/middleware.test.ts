import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  authenticateRequest,
  requireAuthForAddress,
  unauthorizedResponse,
  forbiddenResponse,
  _clearUserCacheForTesting,
} from "@/lib/auth/middleware";

// Mock PrivyClient
const mockVerifyAccessToken = vi.fn();
const mockGetUser = vi.fn();

vi.mock("@privy-io/node", () => ({
  PrivyClient: class {
    utils = () => ({
      auth: () => ({ verifyAccessToken: mockVerifyAccessToken }),
    });
    users = () => ({
      _get: mockGetUser,
    });
  },
}));

describe("Auth Middleware", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserCacheForTesting();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_PRIVY_APP_ID: "app-id",
      PRIVY_APP_SECRET: "app-secret",
    };
  });

  const createRequest = (authHeader?: string) => {
    return new NextRequest("http://localhost", {
      headers: authHeader ? { Authorization: authHeader } : undefined,
    });
  };

  describe("authenticateRequest", () => {
    it("should fail if no auth header", async () => {
      const req = createRequest();
      const result = await authenticateRequest(req);
      expect(result.authenticated).toBe(false);
      expect(result.error).toContain("Missing or invalid Authorization header");
    });

    it("should fail if invalid auth header format", async () => {
      const req = createRequest("Token 123");
      const result = await authenticateRequest(req);
      expect(result.authenticated).toBe(false);
    });

    it("should fail if token verification fails", async () => {
      mockVerifyAccessToken.mockRejectedValue(new Error("Invalid token"));
      const req = createRequest("Bearer invalid");
      const result = await authenticateRequest(req);
      expect(result.authenticated).toBe(false);
      expect(result.error).toBe("Invalid token");
    });

    it("should succeed with valid token and wallet", async () => {
      mockVerifyAccessToken.mockResolvedValue({ user_id: "user1" });
      mockGetUser.mockResolvedValue({
        linked_accounts: [{ type: "wallet", chainType: "ethereum", address: "0xUser" }],
      });

      const req = createRequest("Bearer valid");
      const result = await authenticateRequest(req);

      expect(result.authenticated).toBe(true);
      expect(result.userId).toBe("user1");
      expect(result.walletAddress).toBe("0xuser"); // Lowercase check
    });

    it("should succeed with valid token but no wallet", async () => {
      mockVerifyAccessToken.mockResolvedValue({ user_id: "user1" });
      mockGetUser.mockResolvedValue({ linked_accounts: [] });

      const req = createRequest("Bearer valid");
      const result = await authenticateRequest(req);

      expect(result.authenticated).toBe(true);
      expect(result.walletAddress).toBeUndefined();
    });
  });

  describe("requireAuthForAddress", () => {
    it("should fail if authentication fails", async () => {
      mockVerifyAccessToken.mockRejectedValue(new Error("Auth failed"));
      const req = createRequest("Bearer invalid");
      const result = await requireAuthForAddress(req, "0xuser");
      expect(result.authenticated).toBe(false);
    });

    it("should fail if no wallet linked", async () => {
      mockVerifyAccessToken.mockResolvedValue({ user_id: "user1" });
      mockGetUser.mockResolvedValue({ linked_accounts: [] });

      const req = createRequest("Bearer valid");
      const result = await requireAuthForAddress(req, "0xuser");

      expect(result.authenticated).toBe(false);
      expect(result.error).toContain("No wallet linked");
    });

    it("should fail if address mismatch", async () => {
      mockVerifyAccessToken.mockResolvedValue({ user_id: "user1" });
      mockGetUser.mockResolvedValue({
        linked_accounts: [{ type: "wallet", chainType: "ethereum", address: "0xUser" }],
      });

      const req = createRequest("Bearer valid");
      const result = await requireAuthForAddress(req, "0xOther");

      expect(result.authenticated).toBe(false);
      expect(result.error).toContain("Address does not belong");
    });

    it("should succeed if address matches (case-insensitive)", async () => {
      mockVerifyAccessToken.mockResolvedValue({ user_id: "user1" });
      mockGetUser.mockResolvedValue({
        linked_accounts: [{ type: "wallet", chainType: "ethereum", address: "0xUser" }],
      });

      const req = createRequest("Bearer valid");
      const result = await requireAuthForAddress(req, "0xuser"); // lowercase match

      expect(result.authenticated).toBe(true);
    });
  });

  describe("P0-3: User details cache", () => {
    it("should cache user details and not call Privy API on second request", async () => {
      mockVerifyAccessToken.mockResolvedValue({ user_id: "user1" });
      mockGetUser.mockResolvedValue({
        linked_accounts: [{ type: "wallet", chainType: "ethereum", address: "0xUser" }],
      });

      // First request - should call Privy API
      const req1 = createRequest("Bearer valid-token");
      await authenticateRequest(req1);
      expect(mockGetUser).toHaveBeenCalledTimes(1);

      // Second request with same user - should use cache, NOT call Privy API again
      const req2 = createRequest("Bearer valid-token-2");
      mockVerifyAccessToken.mockResolvedValue({ user_id: "user1" }); // Same user_id
      await authenticateRequest(req2);
      expect(mockGetUser).toHaveBeenCalledTimes(1); // Still only 1 call -- cached!
    });

    it("should call Privy API for different user_ids", async () => {
      mockVerifyAccessToken.mockResolvedValueOnce({ user_id: "user1" });
      mockGetUser.mockResolvedValueOnce({
        linked_accounts: [{ type: "wallet", chainType: "ethereum", address: "0xUser1" }],
      });

      await authenticateRequest(createRequest("Bearer token1"));

      mockVerifyAccessToken.mockResolvedValueOnce({ user_id: "user2" });
      mockGetUser.mockResolvedValueOnce({
        linked_accounts: [{ type: "wallet", chainType: "ethereum", address: "0xUser2" }],
      });

      await authenticateRequest(createRequest("Bearer token2"));

      // Two different users -- should call API twice
      expect(mockGetUser).toHaveBeenCalledTimes(2);
    });
  });

  describe("Response Helpers", () => {
    it("unauthorizedResponse should return 401", () => {
      const res = unauthorizedResponse("Test error");
      expect(res.status).toBe(401);
    });

    it("forbiddenResponse should return 403", () => {
      const res = forbiddenResponse("Test error");
      expect(res.status).toBe(403);
    });
  });
});
