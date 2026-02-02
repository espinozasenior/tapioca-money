// React hook for yield optimizer - replaces useYields.ts
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "./useWallet";
import { useWallets } from "@privy-io/react-auth";

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
    vaultAddress?: `0x${string}`; // For Morpho vaults
    curator?: string;
    isVault?: boolean;
    marketParams?: Record<string, unknown>;
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
  // Rewards tracking
  rewards?: {
    totalEarned: string; // Display-friendly format (USDC)
    earnedThisMonth: string; // Current month estimate
    monthlyRate: string; // Current monthly earning rate
    daysActive: number; // Days since entry
  };
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

// Agent status and registration hook
export function useAgent() {
  const { wallet } = useWallet();
  const queryClient = useQueryClient();
  const address = wallet?.address;

  // Access Privy wallets for ZeroDev integration
  const { wallets } = useWallets();

  const status = useQuery({
    queryKey: ["agent-status", address],
    queryFn: async () => {
      if (!address) return { isRegistered: false, autoOptimizeEnabled: false, hasAuthorization: false };
      const res = await fetch(`/api/agent/register?address=${address}`);
      if (!res.ok) throw new Error("Failed to fetch agent status");
      return res.json();
    },
    enabled: !!address,
  });

  const register = useMutation({
    mutationFn: async () => {
      if (!wallet || !address) throw new Error("No wallet connected");

      console.log("[Agent Registration] Starting ZeroDev smart account registration", {
        address,
      });

      try {
        // Import ZeroDev client helper
        const { registerAgentWithZeroDev } = await import("@/lib/zerodev/client");

        // Use Privy wallet from hook scope
        const privyWallet = wallets?.[0];
        if (!privyWallet) {
          throw new Error("Privy wallet not found");
        }

        // Execute ZeroDev Kernel smart account creation + session key grant (client-side)
        // No agent wallet needed - session key allows backend to execute on behalf of user
        console.log("[Agent Registration] Creating ZeroDev Kernel smart account...");
        const authorization = await registerAgentWithZeroDev(privyWallet as any);

        console.log("[Agent Registration] ✓ Kernel smart account created");
        console.log("[Agent Registration] Sending authorization to backend...");

        // Send session key authorization to backend for storage
        const res = await fetch("/api/agent/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address,
            authorization: {
              type: "zerodev-session-key",
              ...authorization
            }
          }),
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          console.error("[Agent Registration] ❌ Backend storage failed:", errorData);
          throw new Error(errorData.error || "Failed to store authorization");
        }

        const result = await res.json();
        console.log("[Agent Registration] ✅ Registration complete!");
        return result;
      } catch (error: any) {
        console.error("[Agent Registration] ❌ Registration failed:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-status", address] });
    },
  });

  const toggleAutoOptimize = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!address) throw new Error("No wallet connected");

      const res = await fetch("/api/agent/register", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          autoOptimizeEnabled: enabled
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update auto-optimize setting");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-status", address] });
    },
  });

  return {
    isRegistered: status.data?.isRegistered ?? false,
    autoOptimizeEnabled: status.data?.autoOptimizeEnabled ?? false,
    hasAuthorization: status.data?.hasAuthorization ?? false,
    isLoading: status.isLoading,
    register: register.mutate,
    isRegistering: register.isPending,
    registerError: register.error,
    toggleAutoOptimize: toggleAutoOptimize.mutate,
    isTogglingAutoOptimize: toggleAutoOptimize.isPending,
    toggleError: toggleAutoOptimize.error,
  };
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
