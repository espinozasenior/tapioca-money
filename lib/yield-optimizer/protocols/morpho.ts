// Morpho Blue Protocol Integration (viem-based with simulation SDK)
import {
  createPublicClient,
  http,
  parseUnits,
  formatUnits,
  encodeFunctionData,
  keccak256,
  encodeAbiParameters,
} from "viem";
import { base } from "viem/chains";
import type { YieldOpportunity, Position } from "../types";
import { MORPHO_BLUE_BASE } from "../types";
import { CHAIN_CONFIG, PROTOCOLS, MORPHO_USDC_MARKET_PARAMS, USDC_ADDRESS } from "../config";
import { morphoClient } from "@/lib/morpho/api-client";
import {
  createSimulationState,
  sharesToAssets,
  calculateSupplyApy,
  previewSupply,
  type SupplyPreview,
} from "./morpho-simulation";
import { calculateRiskScore } from "@/lib/morpho/risk-scoring";

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
  batch: { multicall: true },
});

// ERC4626 Vault ABI for Morpho Vaults
export const ERC4626_VAULT_ABI = [
  {
    name: "deposit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
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
    stateMutability: "nonpayable",
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
  // Fetch live vault data from Morpho API (cached via Redis, 5 min TTL)
  const vaults = await morphoClient.fetchVaults(CHAIN_CONFIG.chainId, "USDC");

  if (vaults.length === 0) {
    // Fallback to simulation-based APY if API fails
    const simState = createSimulationState();
    const apy = calculateSupplyApy(simState);
    const marketId = getMarketId(MORPHO_USDC_MARKET_PARAMS);
    const market = simState.tryGetMarket(
      marketId as unknown as import("@morpho-org/blue-sdk").MarketId
    );
    const tvl = market?.totalSupplyAssets || 0n;

    return [
      {
        id: "morpho-usdc",
        protocol: "morpho" as const,
        name: "Morpho USDC Lending",
        asset: "USDC",
        apy,
        tvl,
        address: MORPHO_BLUE_BASE,
        riskScore: 0.15, // Direct Morpho Blue market - low risk
        liquidityDepth: tvl,
        metadata: { marketParams: MORPHO_USDC_MARKET_PARAMS },
      },
    ];
  }

  // Filter out vaults with RED warnings or restricted depositor access (whitelisted: false)
  const safeVaults = vaults.filter(
    (vault) => !vault.warnings?.some((w: any) => w.level === "RED") && vault.whitelisted !== false
  );

  return safeVaults.map((vault) => ({
    id: `morpho-vault-${vault.address}`,
    protocol: "morpho" as const,
    name: vault.name,
    asset: "USDC",
    apy: vault.avgNetApy ?? vault.netApy ?? 0,
    tvl: BigInt(vault.totalAssets ?? 0),
    address: vault.address,
    riskScore: calculateRiskScore(vault),
    liquidityDepth: BigInt(vault.totalAssets ?? 0),
    metadata: {
      vaultAddress: vault.address,
      curator: vault.curators?.items?.[0]?.name,
      isVault: true,
      // Include risk metadata for display
      warnings: vault.warnings,
      whitelisted: vault.whitelisted,
      curators: vault.curators,
      performanceFee: vault.performanceFee,
      managementFee: vault.managementFee,
      liquidityUsd: vault.liquidityUsd,
      totalAssetsUsd: vault.totalAssetsUsd,
    },
  }));
}

/**
 * Get user's Morpho position using simulation SDK for accurate conversion
 */
/**
 * Get user's positions across all Morpho ERC4626 vaults
 */
export async function getMorphoPosition(userAddress: `0x${string}`): Promise<Position[]> {
  const positions: Position[] = [];

  // ERC4626 vault positions only (direct market deposits are not used)
  // Check all ERC4626 vault positions using batched multicall
  // With batch.multicall enabled on the client, concurrent readContract calls
  // are automatically batched into single eth_call via Multicall3
  try {
    const vaults = await morphoClient.fetchVaults(CHAIN_CONFIG.chainId, "USDC");
    if (vaults.length === 0) return positions;

    // Phase 1: batch all balanceOf calls (auto-batched by viem into 1 multicall)
    const balanceResults = await Promise.allSettled(
      vaults.map((vault) =>
        client.readContract({
          address: vault.address,
          abi: ERC4626_VAULT_ABI,
          functionName: "balanceOf",
          args: [userAddress],
        })
      )
    );

    // Filter to vaults with non-zero balances
    const vaultsWithBalance: { address: `0x${string}`; shares: bigint; apy: number }[] = [];
    for (let i = 0; i < balanceResults.length; i++) {
      const result = balanceResults[i];
      if (result.status === "fulfilled" && (result.value as bigint) > 0n) {
        vaultsWithBalance.push({
          address: vaults[i].address,
          shares: result.value as bigint,
          apy: vaults[i].avgNetApy ?? vaults[i].netApy ?? 0.045,
        });
      }
    }

    if (vaultsWithBalance.length === 0) return positions;

    // Phase 2: batch convertToAssets calls only for vaults with balances
    const assetResults = await Promise.allSettled(
      vaultsWithBalance.map((v) =>
        client.readContract({
          address: v.address,
          abi: ERC4626_VAULT_ABI,
          functionName: "convertToAssets",
          args: [v.shares],
        })
      )
    );

    for (let i = 0; i < assetResults.length; i++) {
      const result = assetResults[i];
      if (result.status === "fulfilled") {
        positions.push({
          protocol: "morpho",
          vaultAddress: vaultsWithBalance[i].address,
          shares: vaultsWithBalance[i].shares,
          assets: result.value as bigint,
          apy: vaultsWithBalance[i].apy,
          enteredAt: Date.now(),
        });
      }
    }
  } catch (error) {
    console.error("Morpho: Error fetching vault positions:", error);
  }

  return positions;
}

/**
 * Get user's position in direct Morpho Blue market (legacy)
 * Not typically used anymore as deposits go to ERC4626 vaults
 */
export async function getMorphoDirectPosition(
  userAddress: `0x${string}`
): Promise<Position | null> {
  try {
    const marketId = getMarketId(MORPHO_USDC_MARKET_PARAMS);

    // Fetch position directly from contract
    const positionData = (await client.readContract({
      address: PROTOCOLS.morpho.core,
      abi: MORPHO_BLUE_ABI,
      functionName: "position",
      args: [marketId, userAddress],
    })) as readonly [bigint, bigint, bigint];

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
export function previewMorphoSupply(userAddress: `0x${string}`, amount: bigint): SupplyPreview {
  return previewSupply(userAddress, amount);
}

// Re-export simulation utilities for external use
export {
  previewSupply,
  createSimulationState,
  sharesToAssets,
  calculateSupplyApy,
} from "./morpho-simulation";

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
        args: [MORPHO_USDC_MARKET_PARAMS, amount, 0n, userAddress, "0x" as `0x${string}`],
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
      args: [MORPHO_USDC_MARKET_PARAMS, assets || 0n, shares || 0n, userAddress, userAddress],
    }),
  };
}
