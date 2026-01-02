// Moonwell Protocol Integration (Base Sepolia)
import { createPublicClient, http, encodeFunctionData } from "viem";
import { baseSepolia } from "viem/chains";
import type { YieldOpportunity, Position } from "../types";
import { USDC_BASE_SEPOLIA } from "../types";
import { PROTOCOLS, ESTIMATED_APYS } from "../config";

const MOONWELL_USDC = PROTOCOLS.moonwell.mUsdc || ("0x0000000000000000000000000000000000000000" as `0x${string}`);

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

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

export async function getMoonwellOpportunities(): Promise<YieldOpportunity[]> {
  // Moonwell not deployed on Base Sepolia
  if (!PROTOCOLS.moonwell.enabled) {
    return [];
  }
  return [];
}

export async function getMoonwellPosition(_userAddress: `0x${string}`): Promise<Position | null> {
  // Moonwell not deployed on Base Sepolia
  if (!PROTOCOLS.moonwell.enabled) {
    return null;
  }
  return null;
}

export function buildMoonwellDepositTx(amount: bigint, _userAddress: `0x${string}`) {
  return {
    approve: {
      to: USDC_BASE_SEPOLIA,
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
