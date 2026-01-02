// Morpho Blue Protocol Integration (viem-based with simulation SDK)
import { createPublicClient, http, parseUnits, formatUnits, encodeFunctionData, keccak256, encodeAbiParameters } from "viem";
import { baseSepolia } from "viem/chains";
import type { YieldOpportunity, Position } from "../types";
import { MORPHO_BLUE_BASE, USDC_BASE_SEPOLIA } from "../types";
import { CHAIN_CONFIG, PROTOCOLS, MORPHO_USDC_MARKET_PARAMS } from "../config";
import { 
  createSimulationState, 
  sharesToAssets, 
  calculateSupplyApy,
  previewSupply,
  type SupplyPreview 
} from "./morpho-simulation";

// Morpho Blue ABI (minimal for deposits/withdrawals)
export const MORPHO_BLUE_ABI = [
  {
    name: "supply",
    type: "function",
    inputs: [
      {
        name: "marketParams",
        type: "tuple",
        components: [
          { name: "loanToken", type: "address" },
          { name: "collateralToken", type: "address" },
          { name: "oracle", type: "address" },
          { name: "irm", type: "address" },
          { name: "lltv", type: "uint256" },
        ],
      },
      { name: "assets", type: "uint256" },
      { name: "shares", type: "uint256" },
      { name: "onBehalf", type: "address" },
      { name: "data", type: "bytes" },
    ],
    outputs: [
      { name: "assetsSupplied", type: "uint256" },
      { name: "sharesSupplied", type: "uint256" },
    ],
  },
  {
    name: "withdraw",
    type: "function",
    inputs: [
      {
        name: "marketParams",
        type: "tuple",
        components: [
          { name: "loanToken", type: "address" },
          { name: "collateralToken", type: "address" },
          { name: "oracle", type: "address" },
          { name: "irm", type: "address" },
          { name: "lltv", type: "uint256" },
        ],
      },
      { name: "assets", type: "uint256" },
      { name: "shares", type: "uint256" },
      { name: "onBehalf", type: "address" },
      { name: "receiver", type: "address" },
    ],
    outputs: [
      { name: "assetsWithdrawn", type: "uint256" },
      { name: "sharesWithdrawn", type: "uint256" },
    ],
  },
  {
    name: "position",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "id", type: "bytes32" },
      { name: "user", type: "address" },
    ],
    outputs: [
      { name: "supplyShares", type: "uint256" },
      { name: "borrowShares", type: "uint128" },
      { name: "collateral", type: "uint128" },
    ],
  },
] as const;

// ERC20 ABI for approvals
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
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(CHAIN_CONFIG.rpcUrl),
});

// Market parameter type
export interface MarketParams {
  loanToken: `0x${string}`;
  collateralToken: `0x${string}`;
  oracle: `0x${string}`;
  irm: `0x${string}`;
  lltv: bigint;
}

/**
 * Generate market ID from market params (keccak256 hash)
 */
function getMarketId(params: MarketParams): `0x${string}` {
  const encoded = encodeAbiParameters(
    [
      { type: "address" },
      { type: "address" },
      { type: "address" },
      { type: "address" },
      { type: "uint256" },
    ],
    [params.loanToken, params.collateralToken, params.oracle, params.irm, params.lltv]
  );
  return keccak256(encoded);
}

/**
 * Fetch active USDC market using direct viem calls
 * Returns the market params if available
 */
export async function findActiveUsdcMarket(): Promise<MarketParams | null> {
  // Simply return the configured market params
  // The market may or may not exist on-chain yet
  console.log("Morpho: Using configured USDC market params");
  return MORPHO_USDC_MARKET_PARAMS;
}

/**
 * Build encoded supply transaction for Morpho Blue
 */
export function buildMorphoSupplyData(
  marketParams: MarketParams,
  amount: bigint,
  userAddress: `0x${string}`
): `0x${string}` {
  // Encode using viem's encodeFunctionData
  const data = encodeFunctionData({
    abi: MORPHO_BLUE_ABI,
    functionName: "supply",
    args: [
      marketParams,
      amount,
      0n, // shares (0 = use assets amount)
      userAddress,
      "0x" as `0x${string}`, // empty data bytes
    ],
  });
  return data;
}

/**
 * Get Morpho yield opportunities (using simulation SDK for APY)
 */
export async function getMorphoOpportunities(): Promise<YieldOpportunity[]> {
  // Create simulation state to calculate APY
  const simState = createSimulationState();
  const apy = calculateSupplyApy(simState);
  
  // Get TVL from simulation state
  const marketId = getMarketId(MORPHO_USDC_MARKET_PARAMS);
  const market = simState.tryGetMarket(marketId as unknown as import("@morpho-org/blue-sdk").MarketId);
  const tvl = market?.totalSupplyAssets || 0n;
  
  return [{
    id: "morpho-usdc",
    protocol: "morpho" as const,
    name: "Morpho USDC Lending",
    asset: "USDC",
    apy,
    tvl,
    address: MORPHO_BLUE_BASE,
    riskScore: 0.2,
    liquidityDepth: tvl,
    metadata: { 
      marketParams: MORPHO_USDC_MARKET_PARAMS,
    }
  }];
}

/**
 * Get user's Morpho position using simulation SDK for accurate conversion
 */
export async function getMorphoPosition(userAddress: `0x${string}`): Promise<Position | null> {
  try {
    const marketId = getMarketId(MORPHO_USDC_MARKET_PARAMS);

    // Fetch position directly from contract
    const positionData = await client.readContract({
      address: PROTOCOLS.morpho.core,
      abi: MORPHO_BLUE_ABI,
      functionName: "position",
      args: [marketId, userAddress],
    }) as readonly [bigint, bigint, bigint];

    const [supplyShares, borrowShares, collateral] = positionData;

    // No position if no shares
    if (supplyShares === 0n) {
      return null;
    }

    // Use simulation SDK for accurate share→asset conversion
    const simState = createSimulationState();
    const supplyAssets = sharesToAssets(supplyShares, simState);
    const apy = calculateSupplyApy(simState);

    return {
      protocol: "morpho",
      vaultAddress: PROTOCOLS.morpho.core,
      shares: supplyShares,
      assets: supplyAssets,
      apy,
      enteredAt: Date.now(),
    };
  } catch (error) {
    console.error("Morpho: Error fetching position:", error);
    return null;
  }
}

/**
 * Preview a supply operation before executing
 * Returns expected shares, APY, and price impact
 */
export function previewMorphoSupply(
  userAddress: `0x${string}`,
  amount: bigint
): SupplyPreview {
  return previewSupply(userAddress, amount);
}

// Re-export simulation utilities for external use
export { previewSupply, createSimulationState, sharesToAssets, calculateSupplyApy } from "./morpho-simulation";

/**
 * Build deposit transaction with approval + supply
 * Returns array of transactions to be executed sequentially
 */
export function buildMorphoDepositTx(
  amount: bigint,
  userAddress: `0x${string}`
) {
  return {
    // Step 1: Approve USDC spend
    approve: {
      to: USDC_BASE_SEPOLIA,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [PROTOCOLS.morpho.core, amount],
      }),
    },
    // Step 2: Supply to Morpho
    supply: {
      to: PROTOCOLS.morpho.core,
      data: encodeFunctionData({
        abi: MORPHO_BLUE_ABI,
        functionName: "supply",
        args: [
          MORPHO_USDC_MARKET_PARAMS,
          amount,
          0n, // shares (0 = use assets amount)
          userAddress,
          "0x" as `0x${string}`, // empty callback data
        ],
      }),
    },
  };
}

/**
 * Build withdrawal transaction to exit position
 * Can withdraw by shares or by assets amount
 */
export function buildMorphoWithdrawTx(
  userAddress: `0x${string}`,
  shares?: bigint,
  assets?: bigint
) {
  // Must provide either shares or assets
  if (!shares && !assets) {
    throw new Error("Must provide either shares or assets to withdraw");
  }

  return {
    to: PROTOCOLS.morpho.core,
    data: encodeFunctionData({
      abi: MORPHO_BLUE_ABI,
      functionName: "withdraw",
      args: [
        MORPHO_USDC_MARKET_PARAMS,
        assets || 0n, // If assets specified, use it; otherwise 0 = use shares
        shares || 0n, // If shares specified, use it; otherwise 0 = use assets
        userAddress, // onBehalf - withdraw from this user's position
        userAddress, // receiver - send withdrawn assets to this address
      ],
    }),
  };
}
