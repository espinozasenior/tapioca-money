/**
 * YO Protocol Types
 * Internal types used by Tapioca's YO integration layer
 */

import type { Address } from "viem";

export interface YoVault {
  id: string; // e.g. "yoUSD"
  address: Address;
  name: string;
  underlying: {
    address: Address;
    symbol: string;
    decimals: number;
  };
  apy: number; // Annualized (e.g. 0.05 = 5%)
  tvlUsd: number;
  totalAssets: bigint;
  totalShares: bigint;
  riskRating?: string; // Optional external risk rating
}

export interface YoUserPosition {
  vaultId: string; // e.g. "yoUSD"
  vaultAddress: Address;
  vaultName: string;
  shares: bigint;
  assets: bigint;
  assetsUsd: number;
  enteredAt?: number; // Timestamp ms
  unrealizedPnl?: number; // From getUserPerformance() (USD)
  realizedPnl?: number; // From getUserPerformance() (USD)
}
