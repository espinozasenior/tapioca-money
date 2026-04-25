import { useQuery } from "@tanstack/react-query";
import { useWallet } from "./useWallet";
import { useWalletSelection } from "./useWalletSelection";
import { createPublicClient, http, formatUnits } from "viem";
import { base } from "viem/chains";
import { useMemo } from "react";
import { CHAIN_CONFIG, USDC_ADDRESS } from "@/lib/config";
const BALANCE_OF_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

interface UseBalanceOptions {
  /** Override token address (defaults to USDC) */
  tokenAddress?: `0x${string}`;
  /** Override token decimals (defaults to 6 for USDC) */
  tokenDecimals?: number;
}

export function useBalance(options?: UseBalanceOptions) {
  const { wallet } = useWallet();
  const { agentAddress, supportsEip7702 } = useWalletSelection();

  const tokenAddress = options?.tokenAddress ?? USDC_ADDRESS;
  const tokenDecimals = options?.tokenDecimals ?? 6;

  // For ERC-4337 users: agentAddress differs from wallet.address (smart wallet vs Brave).
  // Query the smart wallet balance so the deposit UI shows the correct available amount.
  const isErc4337 = !supportsEip7702 && !!agentAddress && agentAddress !== wallet?.address;
  const balanceAddress = isErc4337 ? agentAddress : wallet?.address;

  // Prefer eRPC (load-balanced) over direct provider URL — sidesteps Alchemy
  // free-tier monthly caps that return HTML instead of JSON.
  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: base,
        transport: http(CHAIN_CONFIG.rpcUrl),
      }),
    []
  );

  // ERC-4337 balance: direct on-chain query using agentAddress
  const erc4337Balance = useQuery({
    queryKey: ["balances", "erc4337", agentAddress, tokenAddress],
    queryFn: async () => {
      if (!agentAddress) return null;
      const balance = await publicClient.readContract({
        address: tokenAddress,
        abi: BALANCE_OF_ABI,
        functionName: "balanceOf",
        args: [agentAddress as `0x${string}`],
      });
      return { token: { amount: formatUnits(balance, tokenDecimals), decimals: tokenDecimals } };
    },
    enabled: isErc4337 && !!agentAddress,
    refetchInterval: 30_000, // Auto-refresh every 30s (P2-4 fix)
    staleTime: 15_000,
  });

  // Standard balance: via wallet.balances() (EIP-7702 or no agent)
  // For non-USDC tokens, use direct on-chain query since wallet.balances() only supports USDC
  const isDefaultToken = tokenAddress === USDC_ADDRESS;

  const standardBalance = useQuery({
    queryKey: ["balances", wallet?.address, tokenAddress],
    queryFn: async () => {
      if (isDefaultToken) {
        // Use wallet's built-in balance method for USDC
        const result = await wallet?.balances(["usdc"]);
        return result ? { token: { amount: result.usdc?.amount ?? "0", decimals: 6 } } : null;
      }
      // For non-USDC tokens, query on-chain directly
      if (!balanceAddress) return null;
      const balance = await publicClient.readContract({
        address: tokenAddress,
        abi: BALANCE_OF_ABI,
        functionName: "balanceOf",
        args: [balanceAddress as `0x${string}`],
      });
      return { token: { amount: formatUnits(balance, tokenDecimals), decimals: tokenDecimals } };
    },
    enabled: !!wallet && !isErc4337,
    refetchInterval: 30_000, // Auto-refresh every 30s (P2-4 fix)
    staleTime: 15_000,
  });

  const balanceData = isErc4337 ? erc4337Balance.data : standardBalance.data;
  const isLoading = isErc4337 ? erc4337Balance.isLoading : standardBalance.isLoading;
  const error = isErc4337 ? erc4337Balance.error : standardBalance.error;
  const refetch = isErc4337 ? erc4337Balance.refetch : standardBalance.refetch;

  // Backward-compatible: balances.usdc still works for default USDC queries
  const balances = balanceData
    ? isDefaultToken
      ? { usdc: balanceData.token }
      : { usdc: balanceData.token } // For compat, map to .usdc regardless
    : null;

  return {
    balances: balances ?? null,
    displayableBalance: parseFloat(balanceData?.token?.amount ?? "0").toFixed(2),
    error: error ? (error instanceof Error ? error.message : String(error)) : null,
    isLoading,
    refetch,
    /** The address whose balance is being displayed */
    balanceAddress,
  };
}
