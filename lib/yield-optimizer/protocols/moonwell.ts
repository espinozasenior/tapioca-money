// Moonwell Protocol Integration (Base Mainnet)
import { encodeFunctionData } from "viem";
import { baseClient } from "@/lib/shared/rpc-client";
import { getMoonwellUsdcPool } from "../defi-llama-api";
import type { YieldOpportunity, Position } from "../types";
import { PROTOCOLS } from "../config";

// Base Mainnet addresses
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`;
const MOONWELL_USDC = "0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22" as const;

const MOONWELL_ABI = [
  {
    name: "mint",
    type: "function",
    inputs: [{ name: "mintAmount", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "redeem",
    type: "function",
    inputs: [{ name: "redeemTokens", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "redeemUnderlying",
    type: "function",
    inputs: [{ name: "redeemAmount", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "balanceOfUnderlying",
    type: "function",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "supplyRatePerTimestamp",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getCash",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export async function getMoonwellOpportunities(): Promise<YieldOpportunity[]> {
  if (!PROTOCOLS.moonwell.enabled) {
    return [];
  }

  try {
    // Try DeFi Llama API first (no RPC needed, cached)
    const llamaPool = await getMoonwellUsdcPool();
    if (llamaPool) {
      return [{
        id: "moonwell-usdc-base",
        protocol: "moonwell",
        name: "Moonwell USDC",
        asset: "USDC",
        apy: llamaPool.apy,
        tvl: BigInt(Math.round(llamaPool.tvlUsd * 1e6)), // Convert USD to USDC units (6 decimals)
        address: MOONWELL_USDC,
        riskScore: 0.3,
        liquidityDepth: BigInt(Math.round(llamaPool.tvlUsd * 1e6)),
        metadata: {
          isVault: false,
          source: "defillama",
        },
      }];
    }

    // Fallback to RPC if DeFi Llama unavailable
    console.warn("[Moonwell] DeFi Llama unavailable, falling back to RPC");
    const supplyRate = await baseClient.readContract({
      address: MOONWELL_USDC,
      abi: MOONWELL_ABI,
      functionName: "supplyRatePerTimestamp",
    }) as bigint;

    const liquidity = await baseClient.readContract({
      address: MOONWELL_USDC,
      abi: MOONWELL_ABI,
      functionName: "getCash",
    }) as bigint;

    const ratePerSecond = Number(supplyRate) / 1e18;
    const secondsPerYear = 365 * 24 * 3600;
    const apy = Math.pow(1 + ratePerSecond, secondsPerYear) - 1;

    return [{
      id: "moonwell-usdc-base",
      protocol: "moonwell",
      name: "Moonwell USDC",
      asset: "USDC",
      apy,
      tvl: liquidity,
      address: MOONWELL_USDC,
      riskScore: 0.3,
      liquidityDepth: liquidity,
      metadata: {
        isVault: false,
        source: "rpc",
      },
    }];
  } catch (error) {
    console.error("Error fetching Moonwell opportunities:", error);
    return [];
  }
}

export async function getMoonwellPosition(userAddress: `0x${string}`): Promise<Position | null> {
  if (!PROTOCOLS.moonwell.enabled) {
    return null;
  }

  try {
    // Check cToken balance
    const cTokenBalance = await baseClient.readContract({
      address: MOONWELL_USDC,
      abi: MOONWELL_ABI,
      functionName: "balanceOf",
      args: [userAddress],
    }) as bigint;

    if (cTokenBalance === 0n) {
      return null;
    }

    // Get underlying USDC amount
    const underlyingBalance = await baseClient.readContract({
      address: MOONWELL_USDC,
      abi: MOONWELL_ABI,
      functionName: "balanceOfUnderlying",
      args: [userAddress],
    }) as bigint;

    // Fetch current APY
    const supplyRate = await baseClient.readContract({
      address: MOONWELL_USDC,
      abi: MOONWELL_ABI,
      functionName: "supplyRatePerTimestamp",
    }) as bigint;

    const ratePerSecond = Number(supplyRate) / 1e18;
    const secondsPerYear = 365 * 24 * 3600;
    const apy = Math.pow(1 + ratePerSecond, secondsPerYear) - 1;

    return {
      protocol: "moonwell",
      vaultAddress: MOONWELL_USDC,
      shares: cTokenBalance,
      assets: underlyingBalance,
      apy,
      enteredAt: Date.now(), // Note: actual entry timestamp would require historical data
    };
  } catch (error) {
    console.error("Error fetching Moonwell position:", error);
    return null;
  }
}

export function buildMoonwellDepositTx(amount: bigint, _userAddress: `0x${string}`) {
  return {
    approve: {
      to: USDC_BASE,
      value: 0n,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [MOONWELL_USDC, amount],
      }),
    },
    mint: {
      to: MOONWELL_USDC,
      value: 0n,
      data: encodeFunctionData({
        abi: MOONWELL_ABI,
        functionName: "mint",
        args: [amount],
      }),
    },
  };
}

export function buildMoonwellWithdrawTx(amount: bigint, _userAddress: `0x${string}`) {
  return {
    to: MOONWELL_USDC,
    value: 0n,
    data: encodeFunctionData({
      abi: MOONWELL_ABI,
      functionName: "redeemUnderlying",
      args: [amount],
    }),
  };
}
