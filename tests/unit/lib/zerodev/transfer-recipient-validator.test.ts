import { describe, it, expect } from "vitest";
import {
  validateTransferRecipient,
  isAddressBlocked,
  addBlockedAddress,
} from "@/lib/zerodev/transfer-recipient-validator";

const SENDER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const VALID_RECIPIENT = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ENTRYPOINT_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const MERKL_ADDRESS = "0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae";

describe("Transfer Recipient Validator", () => {
  describe("validateTransferRecipient", () => {
    it("should accept a valid EOA recipient", () => {
      const result = validateTransferRecipient(VALID_RECIPIENT, SENDER);
      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("should reject empty recipient", () => {
      const result = validateTransferRecipient("", SENDER);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Invalid recipient");
    });

    it("should reject malformed address", () => {
      const result = validateTransferRecipient("0xinvalid", SENDER);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Invalid recipient");
    });

    it("should reject the zero address", () => {
      const result = validateTransferRecipient(ZERO_ADDRESS, SENDER);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("zero address");
    });

    it("should reject self-transfer (same case)", () => {
      const result = validateTransferRecipient(SENDER, SENDER);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("own address");
    });

    it("should reject self-transfer (checksummed vs lowercase)", () => {
      // Use a checksummed version — viem's isAddress accepts both
      const checksummed = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";
      const result = validateTransferRecipient(checksummed, SENDER);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("own address");
    });

    it("should reject USDC token contract as recipient", () => {
      const result = validateTransferRecipient(USDC_ADDRESS, SENDER);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("known contract");
    });

    it("should reject USDC contract regardless of case", () => {
      const result = validateTransferRecipient(USDC_ADDRESS.toLowerCase(), SENDER);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("known contract");
    });

    it("should reject EntryPoint as recipient", () => {
      const result = validateTransferRecipient(ENTRYPOINT_ADDRESS, SENDER);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("known contract");
    });

    it("should reject Merkl Distributor as recipient", () => {
      const result = validateTransferRecipient(MERKL_ADDRESS, SENDER);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("known contract");
    });
  });

  describe("isAddressBlocked", () => {
    it("should return true for blocked addresses", () => {
      expect(isAddressBlocked(USDC_ADDRESS)).toBe(true);
    });

    it("should return false for non-blocked addresses", () => {
      expect(isAddressBlocked(VALID_RECIPIENT)).toBe(false);
    });

    it("should return false for invalid address", () => {
      expect(isAddressBlocked("not-an-address")).toBe(false);
    });
  });

  describe("addBlockedAddress", () => {
    it("should dynamically block a new address", () => {
      const newBadAddress = "0xcccccccccccccccccccccccccccccccccccccccc";
      expect(isAddressBlocked(newBadAddress)).toBe(false);

      addBlockedAddress(newBadAddress);
      expect(isAddressBlocked(newBadAddress)).toBe(true);

      // Also blocks via validation
      const result = validateTransferRecipient(newBadAddress, SENDER);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("known contract");
    });

    it("should throw on invalid address", () => {
      expect(() => addBlockedAddress("invalid")).toThrow("Invalid address");
    });
  });
});
