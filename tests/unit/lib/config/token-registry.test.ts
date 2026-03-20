import { describe, it, expect } from "vitest";
import {
  SUPPORTED_TOKENS,
  getTokenBySymbol,
  getTokenByAddress,
  getTokenIcon,
  USDC_ADDRESS,
} from "@/lib/config";

describe("Token Registry", () => {
  describe("SUPPORTED_TOKENS", () => {
    it("should have 4 supported tokens", () => {
      expect(Object.keys(SUPPORTED_TOKENS)).toHaveLength(4);
    });

    it("should include USDC, WETH, cbBTC, EURC", () => {
      expect(SUPPORTED_TOKENS.USDC).toBeDefined();
      expect(SUPPORTED_TOKENS.WETH).toBeDefined();
      expect(SUPPORTED_TOKENS.cbBTC).toBeDefined();
      expect(SUPPORTED_TOKENS.EURC).toBeDefined();
    });

    it("USDC address should match legacy USDC_ADDRESS constant", () => {
      expect(SUPPORTED_TOKENS.USDC.address).toBe(USDC_ADDRESS);
    });

    it("each token should have required fields", () => {
      for (const [symbol, config] of Object.entries(SUPPORTED_TOKENS)) {
        expect(config.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(config.symbol).toBe(symbol);
        expect(config.decimals).toBeGreaterThan(0);
        expect(config.icon).toMatch(/^\/.*\.svg$/);
        expect(config.maxPerCall).toBeGreaterThan(0n);
      }
    });

    it("WETH should have 18 decimals", () => {
      expect(SUPPORTED_TOKENS.WETH.decimals).toBe(18);
    });

    it("cbBTC should have 8 decimals", () => {
      expect(SUPPORTED_TOKENS.cbBTC.decimals).toBe(8);
    });

    it("USDC and EURC should have 6 decimals", () => {
      expect(SUPPORTED_TOKENS.USDC.decimals).toBe(6);
      expect(SUPPORTED_TOKENS.EURC.decimals).toBe(6);
    });
  });

  describe("getTokenBySymbol", () => {
    it("should find token by exact symbol", () => {
      expect(getTokenBySymbol("USDC")?.symbol).toBe("USDC");
      expect(getTokenBySymbol("WETH")?.symbol).toBe("WETH");
    });

    it("should be case-insensitive", () => {
      expect(getTokenBySymbol("usdc")?.symbol).toBe("USDC");
      expect(getTokenBySymbol("weth")?.symbol).toBe("WETH");
    });

    it("should return undefined for unknown symbol", () => {
      expect(getTokenBySymbol("DOGE")).toBeUndefined();
    });
  });

  describe("getTokenByAddress", () => {
    it("should find token by address", () => {
      const token = getTokenByAddress(SUPPORTED_TOKENS.WETH.address);
      expect(token?.symbol).toBe("WETH");
    });

    it("should be case-insensitive", () => {
      const token = getTokenByAddress(SUPPORTED_TOKENS.USDC.address.toLowerCase());
      expect(token?.symbol).toBe("USDC");
    });

    it("should return undefined for unknown address", () => {
      expect(getTokenByAddress("0x0000000000000000000000000000000000000001")).toBeUndefined();
    });
  });

  describe("getTokenIcon", () => {
    it("should return correct icon for known tokens", () => {
      expect(getTokenIcon("USDC")).toBe("/usdc.svg");
      expect(getTokenIcon("WETH")).toBe("/eth.svg");
      expect(getTokenIcon("cbBTC")).toBe("/btc.svg");
      expect(getTokenIcon("EURC")).toBe("/eur.svg");
    });

    it("should return fallback icon for unknown tokens", () => {
      expect(getTokenIcon("UNKNOWN")).toBe("/usdc.svg");
    });
  });
});
