/**
 * ENS + Basename recipient resolver (client-side only).
 *
 * Resolves `0x…` hex (identity passthrough), `*.eth`, and `*.base.eth` names
 * to a checksummed 0x address. Basenames resolve through the same ENS
 * machinery via CCIP-read on a mainnet provider.
 *
 * The resolved label is cosmetic only — the server re-validates the 0x hex
 * on every write. See tasks/architecture-usdc-send.md §11.
 */

import { createPublicClient, getAddress, http, isAddress } from "viem";
import { normalize } from "viem/ens";
import { mainnet } from "viem/chains";
import { LRU } from "./cache";

export type ResolveSuccess = {
  resolved: `0x${string}`;
  label?: string;
};

export type ResolveFailure = {
  error: "ENS_RESOLUTION_FAILED" | "INVALID_INPUT";
};

export type ResolveResult = ResolveSuccess | ResolveFailure;

const cache = new LRU<ResolveSuccess>();

const MAINNET_CHAIN_ID = 1;

/**
 * Resolve the mainnet RPC URL with eRPC-aware suffixing.
 * - If NEXT_PUBLIC_ERPC_URL is set, append `/main/evm/1` unless it's already
 *   a direct provider URL (Alchemy/Infura/etc.) or already has the suffix.
 * - Pattern mirrors `sentinel/signals/onchain.ts:getClient()`.
 * - Returns `undefined` to let viem fall back to its public endpoint.
 */
function mainnetRpcUrl(): string | undefined {
  const base = process.env.NEXT_PUBLIC_ERPC_URL;
  if (!base) return undefined;
  const isDirect =
    base.includes("/main/evm/") ||
    /alchemy|infura|quicknode|ankr|publicnode|cloudflare-eth|llamarpc/i.test(base);
  return isDirect ? base : `${base}/main/evm/${MAINNET_CHAIN_ID}`;
}

function mainnetClient() {
  return createPublicClient({
    chain: mainnet,
    transport: http(mainnetRpcUrl()),
  });
}

function looksLikeEnsName(input: string): boolean {
  // Accept a.b[.c…] with at least one dot and no 0x prefix.
  return /^[^\s]+\.[^\s]+$/.test(input) && !input.startsWith("0x");
}

export async function resolveRecipient(rawInput: string): Promise<ResolveResult> {
  const input = rawInput.trim();
  if (!input) return { error: "INVALID_INPUT" };

  if (isAddress(input)) {
    return { resolved: getAddress(input) };
  }

  if (!looksLikeEnsName(input)) {
    return { error: "INVALID_INPUT" };
  }

  const normalized = (() => {
    try {
      return normalize(input);
    } catch {
      return null;
    }
  })();
  if (!normalized) return { error: "INVALID_INPUT" };

  const cached = cache.get(normalized);
  if (cached) return cached;

  try {
    const client = mainnetClient();
    const addr = await client.getEnsAddress({ name: normalized });
    if (!addr) return { error: "ENS_RESOLUTION_FAILED" };
    const result: ResolveSuccess = { resolved: getAddress(addr), label: input };
    cache.set(normalized, result);
    return result;
  } catch (err) {
    console.warn("[ENS] resolution error:", err);
    return { error: "ENS_RESOLUTION_FAILED" };
  }
}

export function clearResolutionCache() {
  cache.clear();
}
