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
]);

const PAUSABLE_ABI = parseAbi(["function paused() view returns (bool)"]);

let client: PublicClient | null = null;

/**
 * Get or create viem public client for Base via eRPC.
 */
export function getClient(erpcUrl?: string): PublicClient {
  if (client) return client;

  const rpcUrl = erpcUrl
    ? `${erpcUrl}/main/evm/8453`
    : process.env.ERPC_URL
      ? `${process.env.ERPC_URL}/main/evm/8453`
      : "https://mainnet.base.org";

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
 * Read vault share price via convertToAssets(1e18).
 * Returns normalized price as a number.
 */
export async function querySharePrice(
  vaultAddress: `0x${string}`,
  sharesUnit: bigint = BigInt(1e18),
  erpcUrl?: string
): Promise<number | null> {
  try {
    const c = getClient(erpcUrl);
    const assets = await c.readContract({
      address: vaultAddress,
      abi: ERC4626_ABI,
      functionName: "convertToAssets",
      args: [sharesUnit],
    });
    // Normalize: assets per share unit
    return Number(assets) / Number(sharesUnit);
  } catch (error) {
    console.error(
      `[Sentinel] share price query failed for ${vaultAddress}:`,
      (error as Error).message
    );
    return null;
  }
}
