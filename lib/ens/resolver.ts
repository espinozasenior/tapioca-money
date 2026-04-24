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
 * Mainnet RPC URL resolution, in priority order:
 * 1. NEXT_PUBLIC_ETH_MAINNET_RPC_URL — dedicated, preferred (Alchemy/Infura/etc).
 * 2. NEXT_PUBLIC_ERPC_URL — eRPC proxy, auto-suffixed with `/main/evm/1`.
 *    Only useful if the proxy actually has mainnet configured; many are Base-only.
 * 3. `undefined` — viem uses the chain default (cloudflare-eth.com) as a fallback.
 * Pattern mirrors `sentinel/signals/onchain.ts:getClient()`.
 */
function mainnetRpcUrl(): string | undefined {
  const dedicated = process.env.NEXT_PUBLIC_ETH_MAINNET_RPC_URL;
  if (dedicated) return dedicated;

  const erpc = process.env.NEXT_PUBLIC_ERPC_URL;
  if (!erpc) return undefined;

  const isDirect =
    erpc.includes("/main/evm/") ||
    /alchemy|infura|quicknode|ankr|publicnode|cloudflare-eth|llamarpc/i.test(erpc);
  return isDirect ? erpc : `${erpc}/main/evm/${MAINNET_CHAIN_ID}`;
}

function buildClient(url: string | undefined) {
  return createPublicClient({
    chain: mainnet,
    transport: http(url),
  });
}

/**
 * ENS lookup with automatic fallback.
 * - Tries the configured mainnet RPC first.
 * - On error (404, 502, chain not found, etc.) falls back to viem's
 *   public chain default so the user doesn't get a blanket ENS_RESOLUTION_FAILED
 *   just because a project-specific eRPC isn't serving mainnet.
 */
async function resolveEnsWithFallback(name: string): Promise<`0x${string}` | null> {
  const primary = mainnetRpcUrl();

  try {
    const addr = await buildClient(primary).getEnsAddress({ name });
    if (addr) return addr;
    // null from primary = name not registered. Don't retry; that'd be wrong.
    if (!primary) return null;
  } catch (err) {
    console.warn("[ENS] primary RPC failed, retrying via viem default:", err);
  }

  // Fallback to viem default only if primary threw or was configured but didn't answer.
  if (primary) {
    try {
      return await buildClient(undefined).getEnsAddress({ name });
    } catch (err) {
      console.warn("[ENS] viem default RPC also failed:", err);
      return null;
    }
  }
  return null;
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
    const addr = await resolveEnsWithFallback(normalized);
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
