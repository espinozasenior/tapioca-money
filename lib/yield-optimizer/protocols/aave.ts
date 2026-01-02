// Aave V3 Protocol Integration (Base Sepolia)
import { createPublicClient, http, encodeFunctionData } from "viem";
import { baseSepolia } from "viem/chains";
import type { YieldOpportunity, Position } from "../types";
import { USDC_BASE_SEPOLIA } from "../types";
import { PROTOCOLS, ESTIMATED_APYS } from "../config";

const AAVE_POOL = PROTOCOLS.aave.pool || ("0x0000000000000000000000000000000000000000" as `0x${string}`);

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
] as const;

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

export async function getAaveOpportunities(): Promise<YieldOpportunity[]> {
  // Aave not deployed on Base Sepolia
  if (!PROTOCOLS.aave.enabled) {
    return [];
  }
  return [];
}

export async function getAavePosition(_userAddress: `0x${string}`): Promise<Position | null> {
  // Aave not deployed on Base Sepolia
  if (!PROTOCOLS.aave.enabled) {
    return null;
  }
  return null;
}

export function buildAaveDepositTx(amount: bigint, userAddress: `0x${string}`) {
  return {
    approve: {
      to: USDC_BASE_SEPOLIA,
      value: 0n,
      data: encodeApprove(AAVE_POOL, amount),
    },
    supply: {
      to: AAVE_POOL,
      value: 0n,
      data: encodeSupply(USDC_BASE_SEPOLIA, amount, userAddress),
    },
  };
}

export function buildAaveWithdrawTx(amount: bigint, userAddress: `0x${string}`) {
  return {
    to: AAVE_POOL,
    value: 0n,
    data: encodeWithdraw(USDC_BASE_SEPOLIA, amount, userAddress),
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
