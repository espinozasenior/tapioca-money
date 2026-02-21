// Morpho Simulation SDK Integration
// Provides accurate supply simulations and share/asset conversions

import { SimulationState, simulateOperation } from "@morpho-org/simulation-sdk";
import { ChainId, Market, MarketId } from "@morpho-org/blue-sdk";
import { keccak256, encodeAbiParameters } from "viem";
import { MORPHO_USDC_MARKET_PARAMS, CHAIN_CONFIG, USDC_ADDRESS } from "../config";
import type { MarketParams } from "./morpho";

/**
 * Generate MarketId from market params (used by simulation SDK)
 */
export function getMarketIdFromParams(params: MarketParams): MarketId {
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
  return keccak256(encoded) as MarketId;
}

/**
 * Create a simulation state for Morpho operations
 * Uses mock market data when real data is unavailable (testnet)
 */
export function createSimulationState(
  marketData?: Partial<Market>,
  blockNumber: bigint = BigInt(Math.floor(Date.now() / 1000))
): SimulationState {
  const marketId = getMarketIdFromParams(MORPHO_USDC_MARKET_PARAMS);

  // Default market state (supply-only market)
  const defaultMarket: Market = new Market({
    params: {
      loanToken: MORPHO_USDC_MARKET_PARAMS.loanToken,
      collateralToken: MORPHO_USDC_MARKET_PARAMS.collateralToken,
      oracle: MORPHO_USDC_MARKET_PARAMS.oracle,
      irm: MORPHO_USDC_MARKET_PARAMS.irm,
      lltv: MORPHO_USDC_MARKET_PARAMS.lltv,
    },
    totalSupplyAssets: 1000000n * BigInt(1e6), // 1M USDC mock TVL
    totalSupplyShares: 1000000n * BigInt(1e6), // 1:1 initial share ratio
    totalBorrowAssets: 0n, // No borrowing (supply-only)
    totalBorrowShares: 0n,
    lastUpdate: blockNumber,
    fee: 0n,
    ...marketData,
  });

  return new SimulationState({
    chainId: CHAIN_CONFIG.chainId as ChainId,
    block: {
      number: blockNumber,
      timestamp: blockNumber,
    },
    markets: {
      [marketId]: defaultMarket,
    },
    tokens: {
      [USDC_ADDRESS]: {
        address: USDC_ADDRESS,
        decimals: 6,
        symbol: "USDC",
        name: "USD Coin",
        // Price conversion functions (simplified for testnet)
        fromUsd: (usd: bigint) => usd, // 1:1 for stablecoin
        toUsd: (amount: bigint) => amount, // 1:1 for stablecoin
      },
    },
  });
}

/**
 * Simulate a supply operation and return expected shares
 */
export function simulateSupply(
  userAddress: `0x${string}`,
  amount: bigint,
  state?: SimulationState
): { expectedShares: bigint; newState: SimulationState } {
  const simState = state || createSimulationState();
  const marketId = getMarketIdFromParams(MORPHO_USDC_MARKET_PARAMS);

  const operation = {
    type: "Blue_Supply" as const,
    sender: userAddress,
    args: {
      id: marketId,
      onBehalf: userAddress,
      assets: amount,
    },
  };

  const newState = simulateOperation(operation, simState) as SimulationState;

  // Calculate shares received by comparing position before/after
  const positionBefore = simState.tryGetPosition(userAddress, marketId);
  const positionAfter = newState.tryGetPosition(userAddress, marketId);

  const sharesBefore = positionBefore?.supplyShares || 0n;
  const sharesAfter = positionAfter?.supplyShares || 0n;
  const expectedShares = sharesAfter - sharesBefore;

  return { expectedShares, newState: newState as SimulationState };
}

/**
 * Convert shares to assets using market state
 */
export function sharesToAssets(shares: bigint, state?: SimulationState): bigint {
  const simState = state || createSimulationState();
  const marketId = getMarketIdFromParams(MORPHO_USDC_MARKET_PARAMS);
  const market = simState.tryGetMarket(marketId);

  if (!market || market.totalSupplyShares === 0n) {
    return shares; // 1:1 fallback
  }

  // assets = shares * totalAssets / totalShares
  return (shares * market.totalSupplyAssets) / market.totalSupplyShares;
}

/**
 * Convert assets to shares using market state
 */
export function assetsToShares(assets: bigint, state?: SimulationState): bigint {
  const simState = state || createSimulationState();
  const marketId = getMarketIdFromParams(MORPHO_USDC_MARKET_PARAMS);
  const market = simState.tryGetMarket(marketId);

  if (!market || market.totalSupplyAssets === 0n) {
    return assets; // 1:1 fallback
  }

  // shares = assets * totalShares / totalAssets
  return (assets * market.totalSupplyShares) / market.totalSupplyAssets;
}

/**
 * Calculate supply APY from market utilization
 * For supply-only markets (no borrowing), APY comes from protocol incentives
 */
export function calculateSupplyApy(state?: SimulationState): number {
  const simState = state || createSimulationState();
  const marketId = getMarketIdFromParams(MORPHO_USDC_MARKET_PARAMS);
  const market = simState.tryGetMarket(marketId);

  if (!market) {
    return 0.045; // Default 4.5% estimate
  }

  // For supply-only market with no borrowing, APY is 0 from interest
  // Real APY would come from protocol rewards or incentives
  if (market.totalBorrowAssets === 0n) {
    return 0.045; // Estimated APY from incentives
  }

  // Calculate utilization rate
  const utilization = Number(market.totalBorrowAssets) / Number(market.totalSupplyAssets);

  // Simple APY model based on utilization (would use IRM in production)
  const baseRate = 0.02; // 2% base
  const utilizationMultiplier = 0.1; // 10% at 100% utilization

  return baseRate + utilization * utilizationMultiplier;
}

/**
 * Preview supply result - shows user what they'll receive
 */
export interface SupplyPreview {
  inputAssets: bigint;
  expectedShares: bigint;
  estimatedApy: number;
  priceImpact: number; // Percentage
}

export function previewSupply(
  userAddress: `0x${string}`,
  amount: bigint,
  state?: SimulationState
): SupplyPreview {
  const simState = state || createSimulationState();
  const { expectedShares } = simulateSupply(userAddress, amount, simState);

  // Calculate price impact (difference from 1:1 ratio)
  const idealShares = amount;
  const priceImpact =
    expectedShares > 0n
      ? Math.abs(Number(expectedShares - idealShares) / Number(idealShares)) * 100
      : 0;

  return {
    inputAssets: amount,
    expectedShares,
    estimatedApy: calculateSupplyApy(simState),
    priceImpact,
  };
}
