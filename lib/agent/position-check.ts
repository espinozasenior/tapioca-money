import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { CHAIN_CONFIG } from "@/lib/config";

const erc4626BalanceAbi = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

const publicClient = createPublicClient({
  chain: base,
  transport: http(CHAIN_CONFIG.rpcUrl),
});

/**
 * Quick check: does this address have shares in ANY monitored vault?
 * Uses a single multicall to batch all balanceOf checks.
 * Returns true on error (fail-open — don't skip evaluation if RPC fails).
 */
export async function hasActivePositions(
  agentAddress: `0x${string}`,
  vaultAddresses: `0x${string}`[]
): Promise<boolean> {
  if (vaultAddresses.length === 0) {
    return false;
  }

  try {
    const results = await publicClient.multicall({
      contracts: vaultAddresses.map((vault) => ({
        address: vault,
        abi: erc4626BalanceAbi,
        functionName: "balanceOf" as const,
        args: [agentAddress] as const,
      })),
      allowFailure: true,
    });

    // Check each result — fail-open per vault (if a single call fails, assume position exists)
    for (const result of results) {
      if (result.status === "failure") {
        return true; // fail-open: assume position exists
      }
      if ((result.result as bigint) > 0n) {
        return true;
      }
    }

    return false;
  } catch {
    // Fail-open: if multicall itself fails, assume positions exist
    return true;
  }
}
