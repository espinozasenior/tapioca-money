import { useQuery } from "@tanstack/react-query";
import { useWallet } from "./useWallet";
import { useWalletSelection } from "./useWalletSelection";
import { createPublicClient, http, formatUnits } from "viem";
import { base } from "viem/chains";
import { useMemo } from "react";

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const BALANCE_OF_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export function useBalance() {
  const { wallet } = useWallet();
  const { agentAddress, supportsEip7702 } = useWalletSelection();

  // For ERC-4337 users: agentAddress differs from wallet.address (smart wallet vs Brave).
  // Query the smart wallet balance so the deposit UI shows the correct available amount.
  const isErc4337 = !supportsEip7702 && !!agentAddress && agentAddress !== wallet?.address;
  const balanceAddress = isErc4337 ? agentAddress : wallet?.address;

  // Use configured RPC URL to avoid rate-limited public endpoint (P1-2 fix)
  const publicClient = useMemo(
    () => createPublicClient({ chain: base, transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || undefined) }),
    []
  );

  // ERC-4337 balance: direct on-chain query using agentAddress
  const erc4337Balance = useQuery({
    queryKey: ["balances", "erc4337", agentAddress],
    queryFn: async () => {
      if (!agentAddress) return null;
      const balance = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: BALANCE_OF_ABI,
        functionName: "balanceOf",
        args: [agentAddress as `0x${string}`],
      });
      return { usdc: { amount: formatUnits(balance, 6), decimals: 6 } };
    },
    enabled: isErc4337 && !!agentAddress,
    refetchInterval: 30_000, // Auto-refresh every 30s (P2-4 fix)
    staleTime: 15_000,
  });

  // Standard balance: via wallet.balances() (EIP-7702 or no agent)
  const standardBalance = useQuery({
    queryKey: ["balances", wallet?.address],
    queryFn: async () => (await wallet?.balances(["usdc"])) ?? null,
    enabled: !!wallet && !isErc4337,
    refetchInterval: 30_000, // Auto-refresh every 30s (P2-4 fix)
    staleTime: 15_000,
  });

  const balances = isErc4337 ? erc4337Balance.data : standardBalance.data;
  const isLoading = isErc4337 ? erc4337Balance.isLoading : standardBalance.isLoading;
  const error = isErc4337 ? erc4337Balance.error : standardBalance.error;
  const refetch = isErc4337 ? erc4337Balance.refetch : standardBalance.refetch;

  return {
    balances: balances ?? null,
    displayableBalance: parseFloat(balances?.usdc?.amount ?? "0").toFixed(2),
    error: error ? (error instanceof Error ? error.message : String(error)) : null,
    isLoading,
    refetch,
    /** The address whose balance is being displayed */
    balanceAddress,
  };
}
