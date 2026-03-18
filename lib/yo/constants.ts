/**
 * YO Protocol Constants
 * Gateway address, vault registry, and ABI fragments for session key scoping
 */

import { type Hex } from "viem";
import {
  YO_GATEWAY_ADDRESS as SDK_GATEWAY_ADDRESS,
  VAULTS,
  yoGatewayAbi,
  YO_TOKEN as SDK_YO_TOKEN,
  merklDistributorAbi as sdkMerklDistributorAbi,
} from "@yo-protocol/core";

// Re-export Gateway address from SDK (single source of truth)
export const YO_GATEWAY_ADDRESS = SDK_GATEWAY_ADDRESS;

// Partner ID for attribution (configurable via env)
export const YO_PARTNER_ID = Number(process.env.YO_PARTNER_ID ?? 0);

// Re-export Gateway ABI from SDK
export const YO_GATEWAY_ABI = yoGatewayAbi;

// Re-export vault configs from SDK for convenience
export const YO_VAULTS = VAULTS;

// Slippage buffer in basis points (50 = 0.5%)
export const YO_SLIPPAGE_BPS = 50;

/** Apply slippage buffer: value * (10000 - bps) / 10000 */
export function applyYoSlippage(value: bigint): bigint {
  return (value * BigInt(10000 - YO_SLIPPAGE_BPS)) / 10000n;
}

// Merkl Distributor — reward claiming
export const MERKL_DISTRIBUTOR_ADDRESS_BASE = "0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae" as Hex;
export const MERKL_CLAIM_SELECTOR = "0x71ee95c0" as Hex; // claim(address[],address[],uint256[],bytes32[][])
export const YO_TOKEN = SDK_YO_TOKEN;
export const merklDistributorAbi = sdkMerklDistributorAbi;

// Function selectors for session key scoping (Gateway contract)
export const YO_GATEWAY_DEPOSIT_SELECTOR = "0x82b78ba7" as Hex; // deposit(address,uint256,uint256,address,uint32)
export const YO_GATEWAY_REDEEM_SELECTOR = "0x99519ab8" as Hex; // redeem(address,uint256,uint256,address,uint32)
