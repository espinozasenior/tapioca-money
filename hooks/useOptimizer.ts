// React hook for yield optimizer - replaces useYields.ts
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "./useWallet";
import { useWalletSelection } from "./useWalletSelection";
import { usePrivy, useSign7702Authorization } from "@privy-io/react-auth";
import { createWalletClient, custom } from "viem";
import { base } from "viem/chains";

export interface YieldOpportunity {
  id: string;
  protocol: "morpho" | "aave" | "moonwell" | "yo";
  name: string;
  asset: string;
  apy: number;
  tvl: number | null;
  address: `0x${string}`;
  riskScore: number;
  metadata: {
    name: string;
    description?: string;
    vaultAddress?: `0x${string}`;
  };
  // Native Morpho vault fields for safety display
  totalAssetsUsd?: number | null;
  warnings?: Array<{ type: string; level: string }>;
  whitelisted?: boolean;
  curators?: { items: Array<{ name: string; addresses: Array<{ address: string }> }> | null };
  performanceFee?: number | null;
  managementFee?: number | null;
  liquidityUsd?: number | null;
}

export interface YieldPosition {
  id: string;
  yieldId: string;
  protocol: "morpho" | "aave" | "moonwell" | "yo";
  vaultAddress: `0x${string}`;
  vaultName?: string;
  vaultDescription?: string;
  shares: string;
  assets: string;
  apy: number;
  enteredAt: number;
  amount: string;
  amountUsd: string;
  createdAt: string;
  rewards?: {
    totalEarned: string;
    earnedThisMonth: string;
    monthlyRate: string;
    daysActive: number;
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

interface VaultExitResponse {
  success: boolean;
  txHash?: string;
  userOpHash?: string;
  redeemStatus?: "instant" | "queued";
}

interface PendingRedeemEntry {
  vaultAddress: `0x${string}`;
  pendingAssets: string;
  pendingShares: string;
}

interface PendingRedeemsResponse {
  pendingRedeems: PendingRedeemEntry[];
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
  const bestApy =
    query.data?.opportunities?.reduce(
      (best: number, opp: YieldOpportunity) => Math.max(best, opp.apy),
      0
    ) ?? 0;

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
    // Balance is passed as API param but doesn't need to invalidate cache (P2-2 fix)
    queryKey: ["optimizer", address],
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

  // Access active wallet for ZeroDev integration
  const { activeWallet, allWallets, supportsSmartAccount, supportsEip7702, smartWalletAddress } =
    useWalletSelection();
  const { getAccessToken, user } = usePrivy();
  const { signAuthorization } = useSign7702Authorization();

  // Collect all EVM addresses for the status check — the registration may
  // be stored under any of them (external wallet vs embedded wallet).
  const allEvmAddresses = allWallets
    .filter((w) => w.chainType === "ethereum")
    .map((w) => w.address.toLowerCase());

  const status = useQuery({
    queryKey: ["agent-status", ...allEvmAddresses],
    queryFn: async () => {
      if (allEvmAddresses.length === 0)
        return { isRegistered: false, autoOptimizeEnabled: false, hasAuthorization: false };
      const params =
        allEvmAddresses.length === 1
          ? `address=${allEvmAddresses[0]}`
          : `addresses=${allEvmAddresses.join(",")}`;
      const res = await fetch(`/api/agent/register?${params}`);
      if (!res.ok) throw new Error("Failed to fetch agent status");
      return res.json();
    },
    enabled: allEvmAddresses.length > 0,
  });

  const register = useMutation({
    mutationFn: async () => {
      if (!wallet || !address) throw new Error("No wallet connected");
      if (!supportsSmartAccount)
        throw new Error(
          "Smart account registration requires an EVM wallet. Please switch to an Ethereum wallet."
        );
      if (!activeWallet) throw new Error("No active wallet selected");

      console.log("[Agent Registration] Starting secure ZeroDev registration", {
        address,
      });

      try {
        // Get Privy access token for API authentication
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error("Failed to get access token");
        }

        let result;
        const enableErc4337 = process.env.NEXT_PUBLIC_ENABLE_ERC4337_FALLBACK !== "false";

        if (supportsEip7702 && activeWallet.walletClientType === "privy") {
          // ── Path A: EIP-7702 (Privy embedded wallet) ──
          const { registerAgentSecure } = await import("@/lib/zerodev/client-secure");

          console.log("[Agent Registration] Signing EIP-7702 authorization...");
          const { KERNEL_V3_3, KernelVersionToAddressesMap } = await import(
            "@zerodev/sdk/constants"
          );
          const implAddress = KernelVersionToAddressesMap[KERNEL_V3_3].accountImplementationAddress;

          // Phishing guard: verify delegation target matches expected Kernel V3.3
          const { verifyDelegationTarget } = await import("@/lib/zerodev/delegation-verification");
          if (!verifyDelegationTarget(implAddress)) {
            throw new Error(
              `Delegation target mismatch! Expected Kernel V3.3 but got ${implAddress}. ` +
                `This may indicate a compromised SDK. Aborting registration.`
            );
          }
          console.log("[Agent Registration] Delegation target verified:", implAddress);

          // Ensure Privy embedded wallet is on Base before getting its provider.
          // Without this, signTypedData fails with "chainId 0x2105 is not current network"
          // when the wallet provider defaults to a different chain.
          await activeWallet.raw.switchChain(8453);

          const provider = await activeWallet.raw.getEthereumProvider();
          const walletClient = createWalletClient({
            account: address as `0x${string}`,
            chain: base,
            transport: custom(provider),
          });

          console.log("[Agent Registration] Privy wallet — signing EIP-7702 authorization...");
          const signedAuth = await signAuthorization({
            contractAddress: implAddress,
            chainId: 8453,
          });

          result = await registerAgentSecure(
            address as `0x${string}`,
            accessToken,
            signedAuth,
            walletClient
          );
        } else if (enableErc4337 && smartWalletAddress) {
          // ── Path B: ERC-4337 fallback (Privy Kernel smart wallet) ──
          const { registerAgentErc4337 } = await import("@/lib/zerodev/client-secure");

          console.log("[Agent Registration] Using ERC-4337 fallback path...");
          console.log("[Agent Registration] Smart wallet:", smartWalletAddress);

          // Get the embedded wallet (auto-created by Privy for all users) as the signer.
          // If multiple embedded wallets exist, prefer the one linked to the Privy user
          // (user.wallet.address) since that's the one the SmartWalletsProvider uses.
          const embeddedWallets = allWallets.filter(
            (w) => w.walletClientType === "privy" && w.chainType === "ethereum"
          );
          if (embeddedWallets.length === 0) {
            throw new Error(
              "No embedded wallet found. Please log out and log back in to create one."
            );
          }
          // When user.wallet points to an embedded wallet, use that specific one
          const privyLinkedAddress = user?.wallet?.address?.toLowerCase();
          const embeddedWallet =
            (privyLinkedAddress &&
              embeddedWallets.find((w) => w.address.toLowerCase() === privyLinkedAddress)) ||
            embeddedWallets[0];
          if (embeddedWallets.length > 1) {
            console.warn(
              "[Agent Registration] Multiple embedded wallets found:",
              embeddedWallets.map((w) => w.address),
              "| Using:",
              embeddedWallet.address
            );
          }

          await embeddedWallet.raw.switchChain(8453);
          const embeddedProvider = await embeddedWallet.raw.getEthereumProvider();
          const embeddedWalletClient = createWalletClient({
            account: embeddedWallet.address as `0x${string}`,
            chain: base,
            transport: custom(embeddedProvider),
          });

          result = await registerAgentErc4337(
            smartWalletAddress as `0x${string}`,
            address as `0x${string}`,
            accessToken,
            embeddedWalletClient
          );
        } else {
          throw new Error(
            "Your wallet doesn't support smart account registration. " +
              "Please switch to your Privy embedded wallet or re-login."
          );
        }

        console.log("[Agent Registration] Secure registration complete!");
        console.log("[Agent Registration] Session key address:", result.sessionKeyAddress);
        console.log("[Agent Registration] Expiry:", new Date(result.expiry * 1000).toISOString());

        return result;
      } catch (error: any) {
        console.error("[Agent Registration] Registration failed:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-status"] });
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
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          address,
          autoOptimizeEnabled: enabled,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update auto-optimize setting");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-status"] });
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

      // Sign authorization to delegate to address(0) (removes delegation).
      // Requires Privy embedded wallet — same limitation as registration.
      const signedAuth = await signAuthorization({
        contractAddress: "0x0000000000000000000000000000000000000000" as `0x${string}`,
        chainId: 8453,
      });

      // Serialize BigInt fields for JSON transport
      const serializedAuth = JSON.parse(
        JSON.stringify(signedAuth, (_key, value) =>
          typeof value === "bigint" ? `0x${value.toString(16)}` : value
        )
      );

      // Server relayer sends the Type 4 tx (Privy embedded wallets can't send
      // EIP-7702 txs directly — their RPC doesn't support Type 4).
      const response = await fetch("/api/agent/undelegate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ signedAuthorization: serializedAuth }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Undelegation failed (${response.status})`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-status"] });
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

  return useMutation<
    VaultExitResponse,
    Error,
    { vaultAddress: string; shares: string; protocol?: string }
  >({
    mutationFn: async ({
      vaultAddress,
      shares,
      protocol,
    }: {
      vaultAddress: string;
      shares: string;
      protocol?: string;
    }) => {
      if (!wallet?.address) throw new Error("No wallet connected");

      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("Failed to get access token");
      }

      const res = await fetch("/api/vault/redeem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ vaultAddress, shares, protocol }),
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

export function usePendingRedeems(userAddress?: `0x${string}`) {
  return useQuery<PendingRedeemsResponse>({
    queryKey: ["pending-redeems", userAddress],
    queryFn: async () => {
      if (!userAddress) {
        return { pendingRedeems: [], timestamp: Date.now() };
      }

      const res = await fetch(`/api/yo/pending-redeems?address=${userAddress}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch pending redeems");
      }
      return data;
    },
    enabled: !!userAddress,
    refetchInterval: 30_000,
    staleTime: 30_000,
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
    yo: "#FF6B35",
  };
  return colors[protocol] || "#888";
}

export function getProtocolInfo(protocol: string) {
  const info: Record<string, { name: string; color: string; icon: string }> = {
    morpho: { name: "Morpho", color: "#00D395", icon: "🔷" },
    aave: { name: "Aave", color: "#B6509E", icon: "👻" },
    moonwell: { name: "Moonwell", color: "#7B3FE4", icon: "🌙" },
    yo: { name: "YO Protocol", color: "#FF6B35", icon: "🟠" },
  };
  return info[protocol] || { name: protocol, color: "#888", icon: "💰" };
}
