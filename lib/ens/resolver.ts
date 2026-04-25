/**
 * ENS + Basename recipient resolver (client-side only).
 *
 * Resolves `0x…` hex (identity passthrough), `*.eth`, and `*.base.eth` to
 * a checksummed 0x address.
 *
 * Chain model: Tapioca is Base-native. The app's default chain is Base (8453).
 * But ENS contracts (including Basenames via CCIP-read) live on Ethereum
 * mainnet (1), so this one lookup necessarily hits mainnet. That's an
 * implementation detail of ENS, not the app's topology.
 *
 * RPC strategy: zero-config by default. viem's `http()` with no URL uses
 * the chain's public default (https://cloudflare-eth.com for mainnet),
 * which is rate-limited but free and reliable enough for name resolution.
 * If you want a dedicated endpoint, set `NEXT_PUBLIC_ETH_MAINNET_RPC_URL`
 * in Vercel — it's an opt-in override, not a requirement.
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

/** Optional opt-in override. Undefined ⇒ viem falls back to chain default. */
function ensRpcUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_ETH_MAINNET_RPC_URL;
}

function buildEnsClient() {
  return createPublicClient({
    chain: mainnet,
    transport: http(ensRpcUrl()),
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
    const addr = await buildEnsClient().getEnsAddress({ name: normalized });
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
