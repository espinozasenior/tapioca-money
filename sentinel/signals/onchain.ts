/**
 * Sentinel v0 — On-chain Signal Sources
 *
 * Direct RPC reads via eRPC for maxRedeem, vault paused status,
 * and share price. These are always-on signals that don't depend
 * on Ponder indexer freshness.
 */

import { createPublicClient, http, type PublicClient, parseAbi } from "viem";
import { base } from "viem/chains";

// Minimal ABIs for vault reads
const ERC4626_ABI = parseAbi([
  "function maxRedeem(address owner) view returns (uint256)",
  "function previewRedeem(uint256 shares) view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

const PAUSABLE_ABI = parseAbi(["function paused() view returns (bool)"]);

let client: PublicClient | null = null;

/**
 * Get or create viem public client for Base via eRPC.
 */
export function getClient(erpcUrl?: string): PublicClient {
  if (client) return client;

  // eRPC proxies expose chains under /main/evm/<chainId>. Direct RPC providers
  // (Alchemy, Infura, mainnet.base.org) already include the full path and must
  // not have the suffix appended. Detect by checking for eRPC's path convention.
  const withErpcSuffix = (base: string) =>
    base.includes("/main/evm/") || base.match(/alchemy|infura|quicknode|ankr|publicnode|base\.org/i)
      ? base
      : `${base}/main/evm/8453`;

  const rawUrl = erpcUrl ?? process.env.ERPC_URL ?? "https://mainnet.base.org";
  const rpcUrl = withErpcSuffix(rawUrl);

  client = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  return client;
}

/**
 * Reset client (for testing).
 */
export function resetClient(): void {
  client = null;
}

/**
 * Read maxRedeem for a given owner address on a vault.
 * Returns 0n on failure (fail-open).
 */
export async function queryMaxRedeem(
  vaultAddress: `0x${string}`,
  ownerAddress: `0x${string}`,
  erpcUrl?: string
): Promise<bigint> {
  try {
    const c = getClient(erpcUrl);
    const result = await c.readContract({
      address: vaultAddress,
      abi: ERC4626_ABI,
      functionName: "maxRedeem",
      args: [ownerAddress],
    });
    return result;
  } catch (error) {
    console.error(
      `[Sentinel] maxRedeem call failed for ${vaultAddress}:`,
      (error as Error).message
    );
    // Fail-open: return max value so we don't falsely trigger exit
    return BigInt(Number.MAX_SAFE_INTEGER);
  }
}

/**
 * Read vault paused() status.
 * Returns false on failure (fail-open: assume not paused).
 */
export async function queryVaultPaused(
  vaultAddress: `0x${string}`,
  erpcUrl?: string
): Promise<boolean> {
  try {
    const c = getClient(erpcUrl);
    const result = await c.readContract({
      address: vaultAddress,
      abi: PAUSABLE_ABI,
      functionName: "paused",
    });
    return result;
  } catch {
    // Many vaults don't have paused() — fail-open
    return false;
  }
}

/**
 * Read vault total assets (TVL proxy).
 * Returns null on failure.
 */
export async function queryTotalAssets(
  vaultAddress: `0x${string}`,
  erpcUrl?: string
): Promise<bigint | null> {
  try {
    const c = getClient(erpcUrl);
    return await c.readContract({
      address: vaultAddress,
      abi: ERC4626_ABI,
      functionName: "totalAssets",
    });
  } catch (error) {
    console.error(
      `[Sentinel] totalAssets call failed for ${vaultAddress}:`,
      (error as Error).message
    );
    return null;
  }
}

/**
 * Read vault share price as a normalized ratio (≈1.0 for healthy vaults).
 *
 * Queries on-chain decimals() to determine the correct share unit — USDC
 * vaults use 6 decimals (10^6 = 1 share), not 18. Using the wrong exponent
 * produces nonsense like 0.000000000001086 instead of ~1.086.
 */
export async function querySharePrice(
  vaultAddress: `0x${string}`,
  _unused?: bigint,
  erpcUrl?: string
): Promise<number | null> {
  try {
    const c = getClient(erpcUrl);

    const decimals = await c.readContract({
      address: vaultAddress,
      abi: ERC4626_ABI,
      functionName: "decimals",
    });

    const oneShare = 10n ** BigInt(decimals);

    const assets = await c.readContract({
      address: vaultAddress,
      abi: ERC4626_ABI,
      functionName: "convertToAssets",
      args: [oneShare],
    });

    // assets / oneShare ≈ 1.0 for a healthy vault (1 share → ~1 underlying)
    return Number(assets) / Number(oneShare);
  } catch (error) {
    console.error(
      `[Sentinel] share price query failed for ${vaultAddress}:`,
      (error as Error).message
    );
    return null;
  }
}
