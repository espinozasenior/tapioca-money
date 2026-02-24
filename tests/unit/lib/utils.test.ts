import { describe, it, expect } from "vitest";
import { cn, isValidEvmAddress, isValidSolanaAddress, isValidAddress, isEmail } from "@/lib/utils";

describe("Utils", () => {
  describe("cn", () => {
    it("should merge classes", () => {
      expect(cn("foo", "bar")).toBe("foo bar");
      expect(cn("foo", { bar: true })).toBe("foo bar");
      expect(cn("foo", { bar: false })).toBe("foo");
    });

    it("should handle tailwind conflicts", () => {
      expect(cn("p-4", "p-2")).toBe("p-2");
      expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
    });
  });

  describe("Validators", () => {
    const validEvm = "0x1234567890123456789012345678901234567890";
    const invalidEvm = "0x123";
    const validSol = "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH";
    const invalidSol = "invalid-sol";

    it("isValidEvmAddress", () => {
      expect(isValidEvmAddress(validEvm)).toBe(true);
      expect(isValidEvmAddress(invalidEvm)).toBe(false);
    });

    it("isValidSolanaAddress", () => {
      expect(isValidSolanaAddress(validSol)).toBe(true);
      expect(isValidSolanaAddress(invalidSol)).toBe(false);
    });

    it("isValidAddress", () => {
      expect(isValidAddress(validEvm)).toBe(true);
      expect(isValidAddress(validSol)).toBe(true);
      expect(isValidAddress("invalid")).toBe(false);
    });

    it("isEmail", () => {
      expect(isEmail("test@example.com")).toBe(true);
      expect(isEmail("invalid")).toBe(false);
    });
  });
});
