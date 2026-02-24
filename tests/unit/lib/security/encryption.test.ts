import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { encrypt, decrypt, generateKey, isEncrypted } from "@/lib/security/encryption";

describe("Encryption Utils", () => {
  const originalEnv = process.env;
  const mockKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"; // 32 bytes hex

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, DATABASE_ENCRYPTION_KEY: mockKey };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Configuration", () => {
    it("should throw if key missing", () => {
      delete process.env.DATABASE_ENCRYPTION_KEY;
      expect(() => encrypt("test")).toThrow(
        "DATABASE_ENCRYPTION_KEY environment variable is not set"
      );
    });

    it("should throw if key invalid length", () => {
      process.env.DATABASE_ENCRYPTION_KEY = "short";
      expect(() => encrypt("test")).toThrow("must be 64 hex characters");
    });
  });

  describe("encrypt", () => {
    it("should encrypt string with correct format", () => {
      const result = encrypt("test-data");
      expect(result).toMatch(/^encrypted:v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    });

    it("should produce different outputs for same input (IV randomization)", () => {
      const res1 = encrypt("test");
      const res2 = encrypt("test");
      expect(res1).not.toBe(res2);
    });

    it("should not re-encrypt already encrypted data", () => {
      const encrypted = encrypt("test");
      const result = encrypt(encrypted);
      expect(result).toBe(encrypted);
    });

    it("should throw on empty input", () => {
      expect(() => encrypt("")).toThrow("Cannot encrypt empty string");
    });
  });

  describe("decrypt", () => {
    it("should decrypt successfully", () => {
      const plaintext = "secret-message";
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("should return plaintext if input is not encrypted", () => {
      expect(decrypt("plaintext")).toBe("plaintext");
    });

    it("should throw on empty input", () => {
      expect(() => decrypt("")).toThrow("Cannot decrypt empty string");
    });

    it("should throw on invalid format (parts count)", () => {
      expect(() => decrypt("encrypted:v1:bad")).toThrow("expected 5 parts");
    });

    it("should return as plaintext if prefix invalid", () => {
      const input = "wrong:v1:iv:data:tag";
      expect(decrypt(input)).toBe(input);
    });

    it("should return as plaintext if version invalid", () => {
      const input = "encrypted:v2:iv:data:tag";
      expect(decrypt(input)).toBe(input);
    });

    it("should throw on tampering (auth tag mismatch)", () => {
      const encrypted = encrypt("test");
      // Tamper with the ciphertext part
      const parts = encrypted.split(":");
      parts[3] = Buffer.from("tampered").toString("base64");
      const tampered = parts.join(":");

      expect(() => decrypt(tampered)).toThrow();
    });
  });

  describe("generateKey", () => {
    it("should generate valid 32-byte hex key", () => {
      const key = generateKey();
      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe("isEncrypted", () => {
    it("should identify encrypted strings", () => {
      expect(isEncrypted("encrypted:v1:...")).toBe(true);
    });

    it("should identify plaintext", () => {
      expect(isEncrypted("plaintext")).toBe(false);
    });
  });
});
