// Morpho Blue Protocol Integration (viem-based with simulation SDK)
import { createPublicClient, http, parseUnits, formatUnits, encodeFunctionData, keccak256, encodeAbiParameters } from "viem";
import { base } from "viem/chains";
import type { YieldOpportunity, Position } from "../types";
import { MORPHO_BLUE_BASE } from "../types";
import { CHAIN_CONFIG, PROTOCOLS, MORPHO_USDC_MARKET_PARAMS, USDC_ADDRESS } from "../config";
import { fetchMorphoUsdcVaults, getBestUsdcVault } from "../morpho-api";
import type { MorphoVault } from "@/lib/morpho/api-client";
import {
  createSimulationState,
  sharesToAssets,
  calculateSupplyApy,
  previewSupply,
  type SupplyPreview
} from "./morpho-simulation";
import { calculateRiskScore } from "@/lib/morpho/risk-scoring";

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
  chain: base,
  transport: http(CHAIN_CONFIG.rpcUrl),
});

// ERC4626 Vault ABI for Morpho Vaults
export const ERC4626_VAULT_ABI = [
  {
    name: "deposit",
    type: "function",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    name: "withdraw",
    type: "function",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    name: "redeem",
    type: "function",
    inputs: [
      { name: "shares", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner", type: "address" },
    ],
    outputs: [{ name: "assets", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "convertToAssets",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalAssets",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

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
 * Get Morpho yield opportunities from production vaults via API
 */
export async function getMorphoOpportunities(): Promise<YieldOpportunity[]> {
  // Fetch live vault data from Morpho API
  const vaults = await fetchMorphoUsdcVaults();
  
  if (vaults.length === 0) {
    // Fallback to simulation-based APY if API fails
    const simState = createSimulationState();
    const apy = calculateSupplyApy(simState);
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
      riskScore: 0.15, // Direct Morpho Blue market - low risk
      liquidityDepth: tvl,
      metadata: { marketParams: MORPHO_USDC_MARKET_PARAMS }
    }];
  }

  // Filter out vaults with RED warnings and convert API vaults to yield opportunities
  const safeVaults = vaults.filter((vault: any) =>
    !vault.warnings?.some((w: any) => w.level === "RED")
  );

  return safeVaults.map((vault: any) => ({
    id: `morpho-vault-${vault.address.slice(0, 8)}`,
    protocol: "morpho" as const,
    name: vault.name,
    asset: "USDC",
    apy: vault.netApy ?? vault.avgNetApy ?? 0,
    tvl: BigInt(vault.totalAssets),
    address: vault.address,
    riskScore: calculateRiskScore(vault),
    liquidityDepth: BigInt(vault.totalAssets),
    metadata: {
      vaultAddress: vault.address,
      curator: vault.curator,
      isVault: true,
      // Include risk metadata for display
      warnings: vault.warnings,
      whitelisted: vault.whitelisted,
      curators: vault.curators,
      performanceFee: vault.performanceFee,
      managementFee: vault.managementFee,
      liquidityUsd: vault.liquidityUsd,
    }
  }));
}

/**
 * Get user's Morpho position using simulation SDK for accurate conversion
 */
/**
 * Get user's positions across all Morpho vaults and direct markets
 * Checks both ERC4626 vaults and direct Morpho Blue market
 */
export async function getMorphoPosition(userAddress: `0x${string}`): Promise<Position[]> {
  const positions: Position[] = [];

  // Check direct Morpho Blue market position (legacy)
  const directPosition = await getMorphoDirectPosition(userAddress);
  if (directPosition) {
    positions.push(directPosition);
  }

  // Check all ERC4626 vault positions
  try {
    const vaults = await fetchMorphoUsdcVaults();
    const vaultPositions = await Promise.allSettled(
      vaults.map(vault => getMorphoVaultPosition(userAddress, vault.address))
    );
    
    vaultPositions.forEach(result => {
      if (result.status === "fulfilled" && result.value) {
        positions.push(result.value);
      }
    });
  } catch (error) {
    console.error("Morpho: Error fetching vault positions:", error);
  }

  return positions;
}

/**
 * Get user's position in direct Morpho Blue market (legacy)
 * Not typically used anymore as deposits go to ERC4626 vaults
 */
export async function getMorphoDirectPosition(userAddress: `0x${string}`): Promise<Position | null> {
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
    console.error("Morpho: Error fetching direct position:", error);
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
 * Supports both direct Morpho Blue markets and ERC4626 vaults
 */
export function buildMorphoDepositTx(
  amount: bigint,
  userAddress: `0x${string}`,
  vaultAddress?: `0x${string}`
) {
  // If vault address provided, use ERC4626 vault deposit
  if (vaultAddress) {
    return {
      approve: {
        to: USDC_ADDRESS as `0x${string}`,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "approve",
          args: [vaultAddress, amount],
        }),
      },
      supply: {
        to: vaultAddress,
        data: encodeFunctionData({
          abi: ERC4626_VAULT_ABI,
          functionName: "deposit",
          args: [amount, userAddress],
        }),
      },
    };
  }

  // Fallback: direct Morpho Blue market supply
  return {
    approve: {
      to: USDC_ADDRESS as `0x${string}`,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [PROTOCOLS.morpho.core, amount],
      }),
    },
    supply: {
      to: PROTOCOLS.morpho.core,
      data: encodeFunctionData({
        abi: MORPHO_BLUE_ABI,
        functionName: "supply",
        args: [
          MORPHO_USDC_MARKET_PARAMS,
          amount,
          0n,
          userAddress,
          "0x" as `0x${string}`,
        ],
      }),
    },
  };
}

/**
 * Build withdrawal transaction to exit position
 * Supports both direct Morpho Blue markets and ERC4626 vaults
 */
export function buildMorphoWithdrawTx(
  userAddress: `0x${string}`,
  shares?: bigint,
  assets?: bigint,
  vaultAddress?: `0x${string}`
) {
  if (!shares && !assets) {
    throw new Error("Must provide either shares or assets to withdraw");
  }

  // If vault address provided, use ERC4626 vault redeem/withdraw
  if (vaultAddress) {
    if (shares) {
      return {
        to: vaultAddress,
        data: encodeFunctionData({
          abi: ERC4626_VAULT_ABI,
          functionName: "redeem",
          args: [shares, userAddress, userAddress],
        }),
      };
    }
    return {
      to: vaultAddress,
      data: encodeFunctionData({
        abi: ERC4626_VAULT_ABI,
        functionName: "withdraw",
        args: [assets!, userAddress, userAddress],
      }),
    };
  }

  // Fallback: direct Morpho Blue market withdraw
  return {
    to: PROTOCOLS.morpho.core,
    data: encodeFunctionData({
      abi: MORPHO_BLUE_ABI,
      functionName: "withdraw",
      args: [
        MORPHO_USDC_MARKET_PARAMS,
        assets || 0n,
        shares || 0n,
        userAddress,
        userAddress,
      ],
    }),
  };
}

/**
 * Get user's position in a Morpho vault (ERC4626)
 */
export async function getMorphoVaultPosition(
  userAddress: `0x${string}`,
  vaultAddress: `0x${string}`
): Promise<Position | null> {
  try {
    const shares = await client.readContract({
      address: vaultAddress,
      abi: ERC4626_VAULT_ABI,
      functionName: "balanceOf",
      args: [userAddress],
    }) as bigint;

    if (shares === 0n) return null;

    const assets = await client.readContract({
      address: vaultAddress,
      abi: ERC4626_VAULT_ABI,
      functionName: "convertToAssets",
      args: [shares],
    }) as bigint;

    // Get APY from API
    const vault = await getBestUsdcVault();
    const apy = vault?.apy.netApy || 0.045;

    return {
      protocol: "morpho",
      vaultAddress,
      shares,
      assets,
      apy,
      enteredAt: Date.now(),
    };
  } catch (error) {
    console.error("Error fetching vault position:", error);
    return null;
  }
}
