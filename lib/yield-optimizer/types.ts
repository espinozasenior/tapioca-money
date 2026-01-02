// Yield Optimizer Types

export interface YieldOpportunity {
  id: string;
  protocol: "morpho" | "aave" | "moonwell";
  name: string;
  asset: string;
  apy: number; // Annual percentage yield (decimal, e.g., 0.05 = 5%)
  tvl: bigint; // Total value locked
  address: `0x${string}`;
  riskScore: number; // 0-1, higher = riskier
  liquidityDepth: bigint;
  metadata?: Record<string, unknown>;
}

export interface Position {
  protocol: "morpho" | "aave" | "moonwell";
  vaultAddress: `0x${string}`;
  shares: bigint;
  assets: bigint; // USDC amount
  apy: number;
  enteredAt: number; // timestamp
}

export interface RebalanceDecision {
  shouldRebalance: boolean;
  from: Position | null;
  to: YieldOpportunity | null;
  estimatedGasCost: bigint;
  estimatedSlippage: number;
  netGain: number; // APY improvement after costs
  reason: string;
}

export interface OptimizationResult {
  success: boolean;
  txHash?: `0x${string}`;
  error?: string;
  fromProtocol?: string;
  toProtocol?: string;
  amount?: bigint;
}

export const TEST_WALLET = "0x77a54c02B48fBEF00f7576D66DE2459f102e7543" as const;
export const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

// Morpho Blue on Base Sepolia
export const MORPHO_BLUE_BASE = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb" as const;
