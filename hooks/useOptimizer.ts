// React hook for yield optimizer - replaces useYields.ts
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "./useWallet";
import { useWallets, usePrivy, useSign7702Authorization } from "@privy-io/react-auth";
import { createWalletClient, custom, type WalletClient } from "viem";
import { base } from "viem/chains";

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

  // Access Privy wallets and auth for ZeroDev integration
  const { wallets } = useWallets();
  const { getAccessToken } = usePrivy();
  const { signAuthorization } = useSign7702Authorization();

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

      console.log("[Agent Registration] Starting secure ZeroDev registration", {
        address,
      });

      try {
        const { registerAgentSecure } = await import("@/lib/zerodev/client-secure");

        // Get Privy access token for API authentication
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error("Failed to get access token");
        }

        // Sign EIP-7702 authorization via Privy's native hook
        // This delegates the EOA's code slot to Kernel V3.3 implementation
        console.log("[Agent Registration] Signing EIP-7702 authorization...");
        const { KERNEL_V3_3, KernelVersionToAddressesMap } = await import("@zerodev/sdk/constants");
        const implAddress = KernelVersionToAddressesMap[KERNEL_V3_3].accountImplementationAddress;

        const signedAuth = await signAuthorization({
          contractAddress: implAddress,
          chainId: 8453,
        });

        // Create Viem WalletClient from Privy provider for signing enable data
        console.log("[Agent Registration] Creating wallet client for account serialization...");
        const provider = await wallets[0].getEthereumProvider();
        const privyWalletClient = createWalletClient({
          account: address as `0x${string}`,
          chain: base,
          transport: custom(provider),
        });

        console.log("[Agent Registration] EIP-7702 authorization signed, creating serialized account...");
        const result = await registerAgentSecure(address as `0x${string}`, accessToken, signedAuth, privyWalletClient);

        console.log("[Agent Registration] ✅ Secure registration complete!");
        console.log("[Agent Registration] Session key address:", result.sessionKeyAddress);
        console.log("[Agent Registration] Expiry:", new Date(result.expiry * 1000).toISOString());

        return result;
      } catch (error: any) {
        console.error("[Agent Registration] ❌ Registration failed:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-status", address] });
      // Enable auto-optimize through the proper toggle workflow
      toggleAutoOptimize.mutate(true);
    },
  });

  const toggleAutoOptimize = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!address) throw new Error("No wallet connected");

      // Get access token for authenticated request
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("Failed to get access token");
      }

      const res = await fetch("/api/agent/register", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
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

  const undelegate = useMutation({
    mutationFn: async () => {
      if (!address) throw new Error("No wallet connected");

      // Get access token for API authentication
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("Failed to get access token");
      }

      // Get embedded wallet's Ethereum provider
      const provider = await wallets[0].getEthereumProvider();

      // Create Viem wallet client
      const walletClient = createWalletClient({
        chain: base,
        transport: custom(provider),
      });

      // Import ZeroDev client functions
      const { undelegateEoa, revokeSessionKey } = await import("@/lib/zerodev/client-secure");

      // Undelegate EOA and revoke session key
      await undelegateEoa(address as `0x${string}`, walletClient);
      await revokeSessionKey(address as `0x${string}`, accessToken);
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
    undelegate: undelegate.mutate,
    isUndelegating: undelegate.isPending,
    undelegateError: undelegate.error,
  };
}

// Vault exit hook - for exiting Morpho vault positions
export function useVaultExit() {
  const { wallet } = useWallet();
  const queryClient = useQueryClient();
  const { getAccessToken } = usePrivy();

  return useMutation({
    mutationFn: async ({ vaultAddress, shares }: { vaultAddress: string; shares: string }) => {
      if (!wallet?.address) throw new Error("No wallet connected");

      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("Failed to get access token");
      }

      const res = await fetch("/api/vault/redeem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ vaultAddress, shares }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to exit position");
      }

      return data;
    },
    onSuccess: () => {
      // Invalidate positions query to trigger refetch
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
