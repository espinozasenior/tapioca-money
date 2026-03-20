/**
 * Resolve the agent address (where funds live) from a user's Privy wallet addresses.
 *
 * - Path A (Email → embedded wallet): returns eoaAddress (same as wallet)
 * - Path B (External wallet → ERC-4337): returns smartWalletAddress (Privy Kernel)
 * - No registration: returns first wallet address
 *
 * Results are cached in Redis for 60s to avoid DB hits on polling endpoints.
 */

import { sql } from "@/lib/db";
import { getCacheInterface } from "@/lib/redis/client";

const CACHE_TTL = 60; // seconds
const CACHE_PREFIX = "agent_addr:";

/**
 * Resolve the agent address for a set of Privy-linked wallet addresses.
 * Returns the address where the user's funds/positions actually live.
 */
export async function resolveAgentAddress(walletAddresses: string[]): Promise<string | null> {
  if (walletAddresses.length === 0) return null;

  const normalized = walletAddresses.map((a) => a.toLowerCase());

  // 1. Check Redis cache for any of the wallet addresses
  try {
    const cache = await getCacheInterface();
    for (const addr of normalized) {
      const cached = await cache.get(`${CACHE_PREFIX}${addr}`);
      if (cached) return cached;
    }
  } catch {
    // Redis unavailable — fall through to DB
  }

  // 2. Query DB for a registered wallet
  let rows;
  try {
    rows = await sql`
      SELECT wallet_address, authorization_7702
      FROM users
      WHERE wallet_address = ANY(${normalized})
        AND authorization_7702 IS NOT NULL
      LIMIT 1
    `;
  } catch (error: any) {
    console.warn("[resolveAgentAddress] DB query failed:", error.message);
    return normalized[0]; // Fallback to first wallet on DB error
  }

  // 3. No registration — return first wallet
  if (!rows || rows.length === 0) {
    return normalized[0];
  }

  const auth = rows[0].authorization_7702 as any;
  const registeredWallet = rows[0].wallet_address as string;

  console.log("[resolveAgentAddress] Found registration:", {
    registeredWallet,
    authType: auth?.type,
    smartWalletAddress: auth?.smartWalletAddress,
    eoaAddress: auth?.eoaAddress,
  });

  // 4. Resolve based on session type
  let agentAddr: string;
  if (auth.type === "zerodev-erc4337-session" && auth.smartWalletAddress) {
    agentAddr = auth.smartWalletAddress; // Path B: Privy Kernel smart wallet
  } else if (auth.eoaAddress) {
    agentAddr = auth.eoaAddress; // Path A: EOA (same as wallet)
  } else {
    agentAddr = registeredWallet; // Fallback
  }

  // 5. Cache the resolved address
  try {
    const cache = await getCacheInterface();
    await cache.set(`${CACHE_PREFIX}${registeredWallet}`, agentAddr, CACHE_TTL);
  } catch {
    // Cache write failure is non-critical
  }

  return agentAddr;
}
