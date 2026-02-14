// Moonwell Protocol Integration (Base Mainnet)
import { createPublicClient, http, encodeFunctionData } from "viem";
import { base } from "viem/chains";
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

const client = createPublicClient({
  chain: base,
  transport: http(),
});

export async function getMoonwellOpportunities(): Promise<YieldOpportunity[]> {
  if (!PROTOCOLS.moonwell.enabled) {
    return [];
  }

  try {
    // Fetch supply rate per timestamp (Moonwell uses per-second rates)
    const supplyRate = await client.readContract({
      address: MOONWELL_USDC,
      abi: MOONWELL_ABI,
      functionName: "supplyRatePerTimestamp",
    }) as bigint;

    // Fetch available liquidity
    const liquidity = await client.readContract({
      address: MOONWELL_USDC,
      abi: MOONWELL_ABI,
      functionName: "getCash",
    }) as bigint;

    // Convert per-timestamp rate to APY: (1 + rate/1e18)^(365*24*3600) - 1
    const ratePerSecond = Number(supplyRate) / 1e18;
    const secondsPerYear = 365 * 24 * 3600;
    const apy = Math.pow(1 + ratePerSecond, secondsPerYear) - 1;

    return [
      {
        id: "moonwell-usdc-base",
        protocol: "moonwell",
        name: "Moonwell USDC",
        asset: "USDC",
        apy,
        tvl: liquidity,
        address: MOONWELL_USDC,
        riskScore: 0.3, // Compound V2 fork, established protocol
        liquidityDepth: liquidity,
        metadata: {
          isVault: false,
        },
      },
    ];
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
    const cTokenBalance = await client.readContract({
      address: MOONWELL_USDC,
      abi: MOONWELL_ABI,
      functionName: "balanceOf",
      args: [userAddress],
    }) as bigint;

    if (cTokenBalance === 0n) {
      return null;
    }

    // Get underlying USDC amount
    const underlyingBalance = await client.readContract({
      address: MOONWELL_USDC,
      abi: MOONWELL_ABI,
      functionName: "balanceOfUnderlying",
      args: [userAddress],
    }) as bigint;

    // Fetch current APY
    const supplyRate = await client.readContract({
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
