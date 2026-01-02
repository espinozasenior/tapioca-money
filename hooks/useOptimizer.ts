// React hook for yield optimizer - replaces useYields.ts
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@crossmint/client-sdk-react-ui";

// Types matching what components expect (compatible with legacy Yield.xyz types)
export interface YieldOpportunity {
  id: string;
  protocol: "morpho" | "aave" | "moonwell";
  name: string;
  asset: string;
  apy: number;
  tvl: bigint;
  address: `0x${string}`;
  riskScore: number;
  liquidityDepth: bigint;
  // Legacy compatibility fields
  providerId: string;
  network: string;
  metadata: {
    name: string;
    description?: string;
  };
  rewardRate: {
    total: number;
  };
  status: {
    enter: boolean;
    exit: boolean;
  };
  mechanics: {
    type: "lending" | "vault";
  };
}

export interface YieldPosition {
  id: string;
  yieldId: string;
  protocol: "morpho" | "aave" | "moonwell";
  vaultAddress: `0x${string}`;
  shares: bigint;
  assets: bigint;
  apy: number;
  enteredAt: number;
  // Legacy compatibility
  amount: string;
  amountUsd: string;
  createdAt: string;
}

interface OptimizerDecision {
  shouldRebalance: boolean;
  from: YieldPosition | null;
  to: YieldOpportunity | null;
  estimatedGasCost: string;
  estimatedSlippage: number;
  netGain: number;
  reason: string;
}

interface OptimizerResponse {
  decision: OptimizerDecision;
  opportunities: YieldOpportunity[];
  positions: YieldPosition[];
  timestamp: number;
}

// Main hook - replaces useYields()
export function useYields() {
  const { wallet } = useWallet();
  const address = wallet?.address as `0x${string}` | undefined;

  const query = useQuery<OptimizerResponse>({
    queryKey: ["optimizer", address],
    queryFn: async () => {
      const params = address ? `?address=${address}` : "";
      const res = await fetch(`/api/optimize${params}`);
      if (!res.ok) throw new Error("Failed to fetch yields");
      return res.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // Find best APY for display
  const bestApy = query.data?.opportunities?.reduce((best: number, opp: YieldOpportunity) => Math.max(best, opp.apy), 0) ?? 0;

  return {
    yields: query.data?.opportunities ?? [],
    bestApy,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

// Positions hook - replaces useYieldPositions()
export function useYieldPositions(address?: string) {
  const query = useQuery<OptimizerResponse>({
    queryKey: ["optimizer", address],
    queryFn: async () => {
      if (!address) throw new Error("No address");
      const res = await fetch(`/api/optimize?address=${address}`);
      if (!res.ok) throw new Error("Failed to fetch positions");
      return res.json();
    },
    enabled: !!address,
    refetchInterval: 60_000,
  });

  return {
    positions: query.data?.positions ?? [],
    positionCount: query.data?.positions?.length ?? 0,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

// Optimizer decision hook
export function useOptimizer(usdcBalance: bigint = BigInt(0)) {
  const { wallet } = useWallet();
  const address = wallet?.address as `0x${string}` | undefined;

  return useQuery<OptimizerResponse>({
    queryKey: ["optimizer", address, usdcBalance.toString()],
    queryFn: async () => {
      if (!address) throw new Error("No wallet connected");
      const res = await fetch(`/api/optimize?address=${address}&balance=${usdcBalance.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch optimization");
      return res.json();
    },
    enabled: !!address,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

// Rebalance mutation
export function useRebalance() {
  const { wallet } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ balance }: { balance: bigint }) => {
      if (!wallet?.address) throw new Error("No wallet connected");
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: wallet.address,
          balance: balance.toString(),
        }),
      });
      if (!res.ok) throw new Error("Rebalance request failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["optimizer"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
    },
  });
}

// Helper functions
export function formatApy(apy: number): string {
  return `${(apy * 100).toFixed(2)}%`;
}

export function getProtocolColor(protocol: string): string {
  const colors: Record<string, string> = {
    morpho: "#00D395",
    aave: "#B6509E",
    moonwell: "#7B3FE4",
  };
  return colors[protocol] || "#888";
}

export function getProtocolInfo(protocol: string) {
  const info: Record<string, { name: string; color: string; icon: string }> = {
    morpho: { name: "Morpho", color: "#00D395", icon: "🔷" },
    aave: { name: "Aave", color: "#B6509E", icon: "👻" },
    moonwell: { name: "Moonwell", color: "#7B3FE4", icon: "🌙" },
  };
  return info[protocol] || { name: protocol, color: "#888", icon: "💰" };
}
