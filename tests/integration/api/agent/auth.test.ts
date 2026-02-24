import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// 1. Define mock implementation first
const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }));

// 2. Mock modules
vi.mock("@neondatabase/serverless", () => ({
  neon: () => mockSql,
}));

vi.mock("@/lib/auth/middleware", () => ({
  requireAuthForAddress: vi.fn(),
  authenticateRequest: vi.fn(),
  unauthorizedResponse: vi
    .fn()
    .mockReturnValue({ status: 401, json: async () => ({ error: "Unauthorized" }) }),
  forbiddenResponse: vi
    .fn()
    .mockReturnValue({ status: 403, json: async () => ({ error: "Forbidden" }) }),
}));

vi.mock("@/lib/security/session-encryption", () => ({
  encryptAuthorization: vi.fn((data) => ({ encrypted: JSON.stringify(data) })),
}));

vi.mock("@/lib/security/session-revocation", () => ({
  revokeSession: vi.fn(),
}));

// 3. Import modules under test
import {
  POST as registerPOST,
  GET as checkStatusGET,
  PATCH as updateStatusPATCH,
} from "@/app/api/agent/register/route";
import {
  POST as generateSessionPOST,
  DELETE as revokeSessionDELETE,
} from "@/app/api/agent/generate-session-key/route";
import { requireAuthForAddress, authenticateRequest } from "@/lib/auth/middleware";
import { encryptAuthorization } from "@/lib/security/session-encryption";
import { revokeSession } from "@/lib/security/session-revocation";

describe("Agent Auth API", () => {
  const mockUserAddress = "0xuser" as `0x${string}`;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };

    // Default happy path mocks
    (requireAuthForAddress as any).mockResolvedValue({ authenticated: true });
    (authenticateRequest as any).mockResolvedValue({ authenticated: true });

    // Mock SQL insert/update success
    mockSql.mockResolvedValue([]);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const createRequest = (
    url: string,
    method: string,
    body?: any,
    query?: Record<string, string>
  ) => {
    const nextUrl = new URL(url);
    if (query) {
      Object.entries(query).forEach(([k, v]) => nextUrl.searchParams.set(k, v));
    }

    return new NextRequest(nextUrl, {
      method,
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  describe("POST /register", () => {
    const validBody = {
      address: mockUserAddress,
      authorization: {
        type: "zerodev-7702-session",
        eoaAddress: mockUserAddress,
        sessionKeyAddress: "0xsession",
        sessionPrivateKey: "0xpriv",
        approvedVaults: [],
        expiry: 1234567890,
      },
    };

    it("should return 400 if fields missing", async () => {
      const req = createRequest("http://localhost/api/agent/register", "POST", {});
      const res = await registerPOST(req);
      expect(res.status).toBe(400);
    });

    it("should return 401 if unauthorized", async () => {
      (requireAuthForAddress as any).mockResolvedValue({
        authenticated: false,
        error: "Unauthorized",
      });

      const req = createRequest("http://localhost/api/agent/register", "POST", validBody);
      const res = await registerPOST(req);

      expect(res.status).toBe(401);
    });

    it("should return 403 if forbidden", async () => {
      (requireAuthForAddress as any).mockResolvedValue({
        authenticated: false,
        error: "Address does not belong to authenticated user",
      });

      const req = createRequest("http://localhost/api/agent/register", "POST", validBody);
      const res = await registerPOST(req);

      expect(res.status).toBe(403);
    });

    it("should return 400 if invalid auth type", async () => {
      const invalidBody = {
        ...validBody,
        authorization: { ...validBody.authorization, type: "invalid" },
      };

      const req = createRequest("http://localhost/api/agent/register", "POST", invalidBody);
      const res = await registerPOST(req);

      expect(res.status).toBe(400);
    });

    it("should return 400 if missing private key", async () => {
      const invalidBody = {
        ...validBody,
        authorization: { ...validBody.authorization, sessionPrivateKey: undefined },
      };

      const req = createRequest("http://localhost/api/agent/register", "POST", invalidBody);
      const res = await registerPOST(req);

      expect(res.status).toBe(400);
    });

    it("should register agent successfully", async () => {
      const req = createRequest("http://localhost/api/agent/register", "POST", validBody);
      const res = await registerPOST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.status).toBe("active");

      // Check that INSERT INTO users was called
      const calls = mockSql.mock.calls;
      const insertUserCall = calls.find((call: any) => call[0][0].includes("INSERT INTO users"));
      expect(insertUserCall).toBeDefined();
      expect(insertUserCall![1]).toBe(mockUserAddress);
    });

    it("should handle DB error", async () => {
      mockSql.mockRejectedValue(new Error("DB Error"));

      const req = createRequest("http://localhost/api/agent/register", "POST", validBody);
      const res = await registerPOST(req);

      expect(res.status).toBe(500);
    });
  });

  describe("GET /register (Status Check)", () => {
    it("should return 400 if address missing", async () => {
      const req = createRequest("http://localhost/api/agent/register", "GET");
      const res = await checkStatusGET(req);
      expect(res.status).toBe(400);
    });

    it("should return inactive if user not found", async () => {
      mockSql.mockResolvedValue([]);

      const req = createRequest("http://localhost/api/agent/register", "GET", undefined, {
        address: mockUserAddress,
      });
      const res = await checkStatusGET(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.isRegistered).toBe(false);
      expect(body.status).toBe("inactive");
    });

    it("should return active if user registered", async () => {
      mockSql.mockResolvedValue([
        {
          authorization_7702: {},
          auto_optimize_enabled: true,
        },
      ]);

      const req = createRequest("http://localhost/api/agent/register", "GET", undefined, {
        address: mockUserAddress,
      });
      const res = await checkStatusGET(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.isRegistered).toBe(true);
      expect(body.status).toBe("active");
    });

    it("should handle DB error", async () => {
      mockSql.mockRejectedValue(new Error("DB Error"));

      const req = createRequest("http://localhost/api/agent/register", "GET", undefined, {
        address: mockUserAddress,
      });
      const res = await checkStatusGET(req);

      expect(res.status).toBe(500);
    });
  });

  describe("PATCH /register (Update Status)", () => {
    const validBody = {
      address: mockUserAddress,
      autoOptimizeEnabled: true,
    };

    it("should return 400 if missing address", async () => {
      const req = createRequest("http://localhost/api/agent/register", "PATCH", {
        autoOptimizeEnabled: true,
      });
      const res = await updateStatusPATCH(req);
      expect(res.status).toBe(400);
    });

    it("should return 401 if unauthorized", async () => {
      (authenticateRequest as any).mockResolvedValue({
        authenticated: false,
        error: "Unauthorized",
      });

      const req = createRequest("http://localhost/api/agent/register", "PATCH", validBody);
      const res = await updateStatusPATCH(req);

      expect(res.status).toBe(401);
    });

    it("should return 400 if invalid type", async () => {
      const req = createRequest("http://localhost/api/agent/register", "PATCH", {
        ...validBody,
        autoOptimizeEnabled: "yes",
      });
      const res = await updateStatusPATCH(req);
      expect(res.status).toBe(400);
    });

    it("should return 400 if agent not registered", async () => {
      mockSql.mockResolvedValue([]); // User not found

      const req = createRequest("http://localhost/api/agent/register", "PATCH", validBody);
      const res = await updateStatusPATCH(req);

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual(
        expect.objectContaining({ error: expect.stringContaining("not registered") })
      );
    });

    it("should update status successfully", async () => {
      mockSql.mockResolvedValue([{ authorization_7702: {} }]); // User found

      const req = createRequest("http://localhost/api/agent/register", "PATCH", validBody);
      const res = await updateStatusPATCH(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.status).toBe("active");

      // Check UPDATE called
      const calls = mockSql.mock.calls;
      const updateCall = calls.find((call: any) => call[0][0].includes("UPDATE users"));
      expect(updateCall).toBeDefined();
    });
  });

  // Keep existing session key tests
  describe("POST /generate-session-key", () => {
    const validBody = {
      address: mockUserAddress,
      smartAccountAddress: mockUserAddress,
      sessionKeyAddress: "0xsession",
      serializedAccount: "mockSerialized",
      approvedVaults: [],
      expiry: 1234567890,
    };

    it("should store session key successfully", async () => {
      const req = createRequest(
        "http://localhost/api/agent/generate-session-key",
        "POST",
        validBody
      );
      const res = await generateSessionPOST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(encryptAuthorization).toHaveBeenCalled();

      // Check that INSERT INTO users was called
      const calls = mockSql.mock.calls;
      const insertUserCall = calls.find((call: any) => call[0][0].includes("INSERT INTO users"));
      expect(insertUserCall).toBeDefined();
      expect(insertUserCall![1]).toBe(mockUserAddress);
    });
  });

  describe("DELETE /generate-session-key", () => {
    const validBody = {
      address: mockUserAddress,
    };

    it("should revoke session key successfully", async () => {
      mockSql.mockResolvedValue([{ session_key: "0xsession" }]);

      const req = createRequest(
        "http://localhost/api/agent/generate-session-key",
        "DELETE",
        validBody
      );
      const res = await revokeSessionDELETE(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(revokeSession).toHaveBeenCalledWith("0xsession");

      // Check for UPDATE query to clear auth
      const calls = mockSql.mock.calls;
      const updateCall = calls.find((call: any) => call[0][0].includes("UPDATE users"));
      expect(updateCall).toBeDefined();
      expect(updateCall![1]).toBe(mockUserAddress);
    });
  });
});
