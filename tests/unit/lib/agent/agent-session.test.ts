import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentSession } from "@/lib/agent/agent-session";

describe("AgentSession", () => {
  describe("isValidType", () => {
    it("returns true for zerodev-7702-session", () => {
      const session = new AgentSession({
        type: "zerodev-7702-session",
        eoaAddress: "0xabc",
        sessionKeyAddress: "0xkey",
        approvedVaults: [],
        expiry: Math.floor(Date.now() / 1000) + 3600,
        timestamp: Date.now(),
      });
      expect(session.isValidType()).toBe(true);
    });

    it("returns true for zerodev-erc4337-session", () => {
      const session = new AgentSession({
        type: "zerodev-erc4337-session",
        eoaAddress: "0xabc",
        smartWalletAddress: "0xsmart",
        sessionKeyAddress: "0xkey",
        approvedVaults: [],
        expiry: Math.floor(Date.now() / 1000) + 3600,
        timestamp: Date.now(),
      });
      expect(session.isValidType()).toBe(true);
    });

    it("returns false for unknown type", () => {
      const session = AgentSession.fromRaw({ type: "unknown-type" });
      expect(session).not.toBeNull();
      expect(session!.isValidType()).toBe(false);
    });
  });

  describe("isExpired", () => {
    it("returns false for future expiry", () => {
      const session = new AgentSession({
        type: "zerodev-7702-session",
        eoaAddress: "0xabc",
        sessionKeyAddress: "0xkey",
        approvedVaults: [],
        expiry: Math.floor(Date.now() / 1000) + 3600,
        timestamp: Date.now(),
      });
      expect(session.isExpired()).toBe(false);
    });

    it("returns true for past expiry", () => {
      const session = new AgentSession({
        type: "zerodev-7702-session",
        eoaAddress: "0xabc",
        sessionKeyAddress: "0xkey",
        approvedVaults: [],
        expiry: Math.floor(Date.now() / 1000) - 3600,
        timestamp: Date.now(),
      });
      expect(session.isExpired()).toBe(true);
    });

    it("returns false when expiry is undefined", () => {
      const session = AgentSession.fromRaw({
        type: "zerodev-7702-session",
        eoaAddress: "0xabc",
      });
      expect(session).not.toBeNull();
      expect(session!.isExpired()).toBe(false);
    });
  });

  describe("isValid", () => {
    it("returns true when type valid and not expired", () => {
      const session = new AgentSession({
        type: "zerodev-7702-session",
        eoaAddress: "0xabc",
        sessionKeyAddress: "0xkey",
        approvedVaults: [],
        expiry: Math.floor(Date.now() / 1000) + 3600,
        timestamp: Date.now(),
      });
      expect(session.isValid()).toBe(true);
    });

    it("returns false when type invalid", () => {
      const session = AgentSession.fromRaw({ type: "bad" });
      expect(session!.isValid()).toBe(false);
    });

    it("returns false when expired", () => {
      const session = new AgentSession({
        type: "zerodev-7702-session",
        eoaAddress: "0xabc",
        sessionKeyAddress: "0xkey",
        approvedVaults: [],
        expiry: Math.floor(Date.now() / 1000) - 3600,
        timestamp: Date.now(),
      });
      expect(session.isValid()).toBe(false);
    });
  });

  describe("accountAddress", () => {
    it("returns smartWalletAddress for 4337", () => {
      const session = new AgentSession({
        type: "zerodev-erc4337-session",
        eoaAddress: "0xabc",
        smartWalletAddress: "0xsmart",
        sessionKeyAddress: "0xkey",
        approvedVaults: [],
        expiry: Math.floor(Date.now() / 1000) + 3600,
        timestamp: Date.now(),
      });
      expect(session.accountAddress()).toBe("0xsmart");
    });

    it("returns eoaAddress for 7702", () => {
      const session = new AgentSession({
        type: "zerodev-7702-session",
        eoaAddress: "0xeoa",
        sessionKeyAddress: "0xkey",
        approvedVaults: [],
        expiry: Math.floor(Date.now() / 1000) + 3600,
        timestamp: Date.now(),
      });
      expect(session.accountAddress()).toBe("0xeoa");
    });

    it("uses decryptedAuth eoaAddress for 7702 when provided", () => {
      const session = new AgentSession({
        type: "zerodev-7702-session",
        eoaAddress: "0xencrypted_eoa",
        sessionKeyAddress: "0xkey",
        approvedVaults: [],
        expiry: Math.floor(Date.now() / 1000) + 3600,
        timestamp: Date.now(),
      });
      const decrypted = {
        type: "zerodev-7702-session" as const,
        eoaAddress: "0xdecrypted_eoa" as `0x${string}`,
        sessionKeyAddress: "0xkey" as `0x${string}`,
        approvedVaults: [],
        expiry: Math.floor(Date.now() / 1000) + 3600,
        timestamp: Date.now(),
      };
      expect(session.accountAddress(decrypted)).toBe("0xdecrypted_eoa");
    });
  });

  describe("approvedVaults", () => {
    it("returns the approvedVaults array", () => {
      const session = new AgentSession({
        type: "zerodev-7702-session",
        eoaAddress: "0xabc",
        sessionKeyAddress: "0xkey",
        approvedVaults: ["0xvault1", "0xvault2"],
        expiry: Math.floor(Date.now() / 1000) + 3600,
        timestamp: Date.now(),
      });
      expect(session.approvedVaults).toEqual(["0xvault1", "0xvault2"]);
    });

    it("returns empty array when approvedVaults is missing", () => {
      const session = AgentSession.fromRaw({
        type: "zerodev-7702-session",
        eoaAddress: "0xabc",
      });
      expect(session!.approvedVaults).toEqual([]);
    });
  });

  describe("type getter", () => {
    it("returns the session type", () => {
      const session = new AgentSession({
        type: "zerodev-7702-session",
        eoaAddress: "0xabc",
        sessionKeyAddress: "0xkey",
        approvedVaults: [],
        expiry: Math.floor(Date.now() / 1000) + 3600,
        timestamp: Date.now(),
      });
      expect(session.type).toBe("zerodev-7702-session");
    });
  });

  describe("fromRaw", () => {
    it("returns null for null", () => {
      expect(AgentSession.fromRaw(null)).toBeNull();
    });

    it("returns null for undefined", () => {
      expect(AgentSession.fromRaw(undefined)).toBeNull();
    });

    it("returns null for non-object", () => {
      expect(AgentSession.fromRaw("string")).toBeNull();
      expect(AgentSession.fromRaw(42)).toBeNull();
    });

    it("returns null for object without type string", () => {
      expect(AgentSession.fromRaw({ foo: "bar" })).toBeNull();
      expect(AgentSession.fromRaw({ type: 123 })).toBeNull();
    });

    it("returns AgentSession for valid data", () => {
      const data = {
        type: "zerodev-7702-session",
        eoaAddress: "0xabc",
        approvedVaults: ["0xvault"],
        expiry: Math.floor(Date.now() / 1000) + 3600,
      };
      const session = AgentSession.fromRaw(data);
      expect(session).not.toBeNull();
      expect(session!.type).toBe("zerodev-7702-session");
      expect(session!.approvedVaults).toEqual(["0xvault"]);
    });

    it("returns AgentSession even for unknown types (validation is separate)", () => {
      const session = AgentSession.fromRaw({ type: "unknown" });
      expect(session).not.toBeNull();
      expect(session!.isValidType()).toBe(false);
    });
  });
});
