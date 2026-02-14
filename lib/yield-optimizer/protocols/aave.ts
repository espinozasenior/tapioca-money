// Aave V3 Protocol Integration (Base Mainnet)
import { encodeFunctionData } from "viem";
import { baseClient } from "@/lib/shared/rpc-client";
import { getAaveUsdcPool } from "../defi-llama-api";
import type { YieldOpportunity, Position } from "../types";
import { USDC_BASE } from "../types";
import { PROTOCOLS } from "../config";

// Aave V3 Base Mainnet addresses
const AAVE_POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5" as const;
const AAVE_AUSDC = "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB" as const;
const USDC = USDC_BASE;

const AAVE_POOL_ABI = [
  {
    name: "supply",
    type: "function",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "onBehalfOf", type: "address" },
      { name: "referralCode", type: "uint16" },
    ],
    outputs: [],
  },
  {
    name: "withdraw",
    type: "function",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "to", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getReserveData",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      { name: "configuration", type: "uint256" },
      { name: "liquidityIndex", type: "uint128" },
      { name: "currentLiquidityRate", type: "uint128" },
      { name: "variableBorrowIndex", type: "uint128" },
      { name: "currentVariableBorrowRate", type: "uint128" },
      { name: "currentStableBorrowRate", type: "uint128" },
      { name: "lastUpdateTimestamp", type: "uint40" },
      { name: "id", type: "uint16" },
      { name: "aTokenAddress", type: "address" },
      { name: "stableDebtTokenAddress", type: "address" },
      { name: "variableDebtTokenAddress", type: "address" },
      { name: "interestRateStrategyAddress", type: "address" },
      { name: "accruedToTreasury", type: "uint128" },
      { name: "unbacked", type: "uint128" },
      { name: "isolationModeTotalDebt", type: "uint128" },
    ],
  },
] as const;

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/**
 * Fetch Aave V3 USDC lending opportunities on Base mainnet
 * Uses DeFi Llama API for APY/TVL data (cached, no RPC needed).
 * Falls back to RPC if DeFi Llama is unavailable.
 */
export async function getAaveOpportunities(): Promise<YieldOpportunity[]> {
  if (!PROTOCOLS.aave.enabled) {
    return [];
  }

  try {
    // Try DeFi Llama API first (no RPC needed, cached)
    const llamaPool = await getAaveUsdcPool();
    if (llamaPool) {
      return [{
        id: "aave-usdc-base",
        protocol: "aave",
        name: "Aave V3 USDC",
        asset: "USDC",
        apy: llamaPool.apy,
        tvl: BigInt(Math.round(llamaPool.tvlUsd * 1e6)), // Convert USD to USDC units (6 decimals)
        address: AAVE_POOL,
        riskScore: 0.2,
        liquidityDepth: BigInt(Math.round(llamaPool.tvlUsd * 1e6)),
        metadata: {
          aTokenAddress: AAVE_AUSDC,
          isVault: false,
          source: "defillama",
        },
      }];
    }

    // Fallback to RPC if DeFi Llama unavailable
    console.warn("[Aave] DeFi Llama unavailable, falling back to RPC");
    const reserveData = await baseClient.readContract({
      address: AAVE_POOL,
      abi: AAVE_POOL_ABI,
      functionName: "getReserveData",
      args: [USDC],
    });

    const liquidityRate = (reserveData as readonly bigint[])[2];
    const apy = Number(liquidityRate) / 1e27;

    const tvl = await baseClient.readContract({
      address: AAVE_AUSDC,
      abi: ERC20_ABI,
      functionName: "totalSupply",
    }) as bigint;

    return [{
      id: "aave-usdc-base",
      protocol: "aave",
      name: "Aave V3 USDC",
      asset: "USDC",
      apy,
      tvl,
      address: AAVE_POOL,
      riskScore: 0.2,
      liquidityDepth: tvl,
      metadata: {
        aTokenAddress: AAVE_AUSDC,
        isVault: false,
        source: "rpc",
      },
    }];
  } catch (error) {
    console.error("Failed to fetch Aave opportunities:", error);
    return [];
  }
}

/**
 * Fetch user's Aave V3 position on Base mainnet
 * Returns position if user has aUSDC balance, null otherwise
 */
export async function getAavePosition(userAddress: `0x${string}`): Promise<Position | null> {
  if (!PROTOCOLS.aave.enabled) {
    return null;
  }

  try {
    // Get user's aUSDC balance
    const balance = await baseClient.readContract({
      address: AAVE_AUSDC,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [userAddress],
    });

    if (balance === 0n) {
      return null;
    }

    // Fetch current APY
    const reserveData = await baseClient.readContract({
      address: AAVE_POOL,
      abi: AAVE_POOL_ABI,
      functionName: "getReserveData",
      args: [USDC],
    });

    const liquidityRate = (reserveData as readonly bigint[])[2];
    const apy = Number(liquidityRate) / 1e27;

    return {
      protocol: "aave",
      vaultAddress: AAVE_POOL,
      shares: balance as bigint, // aTokens are 1:1 with underlying
      assets: balance as bigint, // aTokens represent the underlying amount
      apy,
      enteredAt: Date.now(), // We don't have historical data, use current timestamp
    };
  } catch (error) {
    console.error("Failed to fetch Aave position:", error);
    return null;
  }
}

/**
 * Build deposit transaction data for Aave V3
 * Returns approve + supply transaction objects
 */
export function buildAaveDepositTx(amount: bigint, userAddress: `0x${string}`) {
  return {
    approve: {
      to: USDC,
      value: 0n,
      data: encodeApprove(AAVE_POOL, amount),
    },
    supply: {
      to: AAVE_POOL,
      value: 0n,
      data: encodeSupply(USDC, amount, userAddress),
    },
  };
}

/**
 * Build withdraw transaction data for Aave V3
 * Returns withdraw transaction object
 */
export function buildAaveWithdrawTx(amount: bigint, userAddress: `0x${string}`) {
  return {
    to: AAVE_POOL,
    value: 0n,
    data: encodeWithdraw(USDC, amount, userAddress),
  };
}

function encodeApprove(spender: `0x${string}`, amount: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "approve",
    args: [spender, amount],
  });
}

function encodeSupply(
  asset: `0x${string}`,
  amount: bigint,
  onBehalfOf: `0x${string}`
): `0x${string}` {
  return encodeFunctionData({
    abi: AAVE_POOL_ABI,
    functionName: "supply",
    args: [asset, amount, onBehalfOf, 0],
  });
}

function encodeWithdraw(asset: `0x${string}`, amount: bigint, to: `0x${string}`): `0x${string}` {
  return encodeFunctionData({
    abi: AAVE_POOL_ABI,
    functionName: "withdraw",
    args: [asset, amount, to],
  });
}
