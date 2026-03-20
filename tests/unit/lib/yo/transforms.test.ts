import { describe, it, expect } from "vitest";
import { transformYoVaultToOpportunity, transformYoPosition } from "@/lib/yo/transforms";
import type { YoVault } from "@/lib/yo/types";

describe("YO Transforms — Multi-Asset", () => {
  const makeVault = (overrides: Partial<YoVault> = {}): YoVault => ({
    id: "yoUSD",
    address: "0x1111111111111111111111111111111111111111",
    name: "yoUSD",
    apy: 0.05,
    tvlUsd: 1000000,
    underlying: {
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      symbol: "USDC",
      decimals: 6,
    },
    totalAssets: 1000000000000n,
    totalShares: 1000000000000n,
    ...overrides,
  });

  describe("transformYoVaultToOpportunity", () => {
    it("should include underlying metadata for USDC vault", () => {
      const opp = transformYoVaultToOpportunity(makeVault());

      expect(opp.underlying).toEqual({
        symbol: "USDC",
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        decimals: 6,
      });
      expect(opp.asset).toBe("USDC");
    });

    it("should include underlying metadata for WETH vault", () => {
      const opp = transformYoVaultToOpportunity(
        makeVault({
          id: "yoETH",
          name: "yoETH",
          underlying: {
            address: "0x4200000000000000000000000000000000000006",
            symbol: "WETH",
            decimals: 18,
          },
        })
      );

      expect(opp.underlying).toEqual({
        symbol: "WETH",
        address: "0x4200000000000000000000000000000000000006",
        decimals: 18,
      });
      expect(opp.asset).toBe("WETH");
    });

    it("should include underlying metadata for cbBTC vault", () => {
      const opp = transformYoVaultToOpportunity(
        makeVault({
          id: "yoBTC",
          name: "yoBTC",
          underlying: {
            address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
            symbol: "cbBTC",
            decimals: 8,
          },
        })
      );

      expect(opp.underlying.symbol).toBe("cbBTC");
      expect(opp.underlying.decimals).toBe(8);
      expect(opp.asset).toBe("cbBTC");
    });
  });

  describe("transformYoPosition", () => {
    it("should include underlyingSymbol from matched opportunity", () => {
      const opportunities = [
        transformYoVaultToOpportunity(
          makeVault({
            underlying: {
              address: "0x4200000000000000000000000000000000000006",
              symbol: "WETH",
              decimals: 18,
            },
          })
        ),
      ];

      const pos = transformYoPosition(
        {
          vaultId: "yoETH",
          vaultAddress: "0x1111111111111111111111111111111111111111",
          vaultName: "yoETH",
          shares: 1000000000000000000n,
          assets: 1000000000000000000n,
          assetsUsd: 3000,
          apy: 0.08,
        },
        opportunities
      );

      expect(pos.underlyingSymbol).toBe("WETH");
    });

    it("should default underlyingSymbol to USDC when no match", () => {
      const pos = transformYoPosition(
        {
          vaultId: "yoUSD",
          vaultAddress: "0x9999999999999999999999999999999999999999",
          vaultName: "yoUSD",
          shares: 1000000n,
          assets: 1000000n,
          assetsUsd: 1,
          apy: 0.05,
        },
        [] // no matched opportunities
      );

      expect(pos.underlyingSymbol).toBe("USDC");
    });
  });
});
