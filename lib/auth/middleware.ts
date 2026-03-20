/**
 * Privy JWT Authentication Middleware
 *
 * Verifies Privy access tokens and validates wallet address ownership.
 * Use this middleware to protect API routes that modify user data.
 *
 * SECURITY: Prevents attackers from impersonating other users by
 * verifying the JWT claims match the requested wallet address.
 */

import { NextRequest, NextResponse } from "next/server";
import { PrivyClient } from "@privy-io/node";

// Initialize Privy client (singleton)
let privyClient: PrivyClient | null = null;

// TTL cache with FIFO eviction for Privy user details (P0-3 fix).
// Avoids 100-300ms Privy API call on every request for the same user.
// SECURITY NOTE: Cached entries may be up to 15s stale. If a user unlinks
// a wallet in Privy, the old wallet remains "owned" in this cache until expiry.
const USER_CACHE_TTL_MS = 15_000; // 15 seconds (M-2: reduced from 60s for tighter security)
const USER_CACHE_MAX_SIZE = 1000;
const userDetailsCache = new Map<string, { user: any; expiresAt: number }>();

/**
 * Clear the user details cache (for testing only).
 */
export function _clearUserCacheForTesting(): void {
  userDetailsCache.clear();
}

function getPrivyClient(): PrivyClient {
  if (!privyClient) {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    if (!appId || !appSecret) {
      throw new Error("PRIVY_APP_ID and PRIVY_APP_SECRET must be configured");
    }
    privyClient = new PrivyClient({ appId, appSecret });
  }
  return privyClient;
}

export interface AuthResult {
  authenticated: boolean;
  userId?: string;
  walletAddress?: string;
  /** All ethereum wallet addresses linked to this Privy account */
  allWalletAddresses?: string[];
  error?: string;
}

// Privy server SDK uses snake_case (chain_type, wallet_client_type),
// while client SDK uses camelCase (chainType, walletClientType).
// These helpers handle both to avoid silent filter failures.
function isEvmWallet(account: any): boolean {
  const chainType = account.chainType ?? account.chain_type;
  return account.type === "wallet" && (!chainType || chainType === "ethereum");
}

function isEmbeddedWallet(account: any): boolean {
  const clientType = account.walletClientType ?? account.wallet_client_type;
  return clientType === "privy";
}

/**
 * Extract the primary wallet address from Privy user's linked accounts.
 *
 * Prioritizes external wallets over embedded — the external wallet is the
 * user's "identity" address stored in the DB, while the embedded wallet is
 * auto-created by Privy for signing purposes.
 */
function extractWalletAddress(linkedAccounts: any[]): string | null {
  if (!linkedAccounts || linkedAccounts.length === 0) {
    return null;
  }

  // Prefer external EVM wallets — this is the address stored in the DB
  const externalWallet = linkedAccounts.find(
    (account) => isEvmWallet(account) && !isEmbeddedWallet(account)
  );
  if (externalWallet?.address) {
    return externalWallet.address.toLowerCase();
  }

  // Fallback to embedded wallet (email/social login users)
  const embeddedWallet = linkedAccounts.find(
    (account) => isEvmWallet(account) && isEmbeddedWallet(account)
  );
  if (embeddedWallet?.address) {
    return embeddedWallet.address.toLowerCase();
  }

  // Last resort: any wallet
  const anyWallet = linkedAccounts.find((account) => account.type === "wallet" && account.address);
  return anyWallet?.address?.toLowerCase() || null;
}

/**
 * Extract ALL ethereum wallet addresses from Privy user's linked accounts.
 * Used for ownership checks — a user owns all their linked wallets.
 */
function extractAllWalletAddresses(linkedAccounts: any[]): string[] {
  if (!linkedAccounts || linkedAccounts.length === 0) {
    return [];
  }

  return linkedAccounts
    .filter((account) => isEvmWallet(account) && account.address)
    .map((account) => account.address.toLowerCase());
}

/**
 * Authenticate request and return user info
 *
 * @param request - NextRequest object
 * @returns AuthResult with user info or error
 */
export async function authenticateRequest(request: NextRequest): Promise<AuthResult> {
  try {
    // Extract token from Authorization header
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return {
        authenticated: false,
        error: "Missing or invalid Authorization header",
      };
    }

    const token = authHeader.slice(7);

    if (!token) {
      return {
        authenticated: false,
        error: "Missing access token",
      };
    }

    // Verify token using Privy SDK
    const privy = getPrivyClient();
    const verifiedClaims = await privy.utils().auth().verifyAccessToken(token);

    // Get user details -- check cache first to avoid 100-300ms Privy API call (P0-3 fix)
    const userId = verifiedClaims.user_id;
    let user: any;
    const cached = userDetailsCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      user = cached.user;
    } else {
      user = await privy.users()._get(userId);
      // Evict oldest entries if cache is full
      if (userDetailsCache.size >= USER_CACHE_MAX_SIZE) {
        const firstKey = userDetailsCache.keys().next().value;
        if (firstKey) userDetailsCache.delete(firstKey);
      }
      userDetailsCache.set(userId, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
    }

    const walletAddress = extractWalletAddress(user.linked_accounts);
    const allWalletAddresses = extractAllWalletAddresses(user.linked_accounts);

    return {
      authenticated: true,
      userId: verifiedClaims.user_id,
      walletAddress: walletAddress || undefined,
      allWalletAddresses,
    };
  } catch (error: any) {
    console.error("[Auth] Token verification failed:", error.message);

    return {
      authenticated: false,
      error: error.message || "Authentication failed",
    };
  }
}

/**
 * Verify that authenticated user owns the requested wallet address
 *
 * @param request - NextRequest object
 * @param requestedAddress - Wallet address from request body/params
 * @returns AuthResult with validation status
 */
export async function requireAuthForAddress(
  request: NextRequest,
  requestedAddress: string
): Promise<AuthResult> {
  const authResult = await authenticateRequest(request);

  if (!authResult.authenticated) {
    return authResult;
  }

  const allAddresses = authResult.allWalletAddresses ?? [];

  if (allAddresses.length === 0) {
    return {
      authenticated: false,
      error: "No wallet linked to account",
    };
  }

  // Check if the requested address matches ANY of the user's linked wallets.
  // This is important for ERC-4337 users: the DB key is the external wallet address
  // (e.g. Brave), but the auth middleware might resolve to the embedded wallet.
  const normalizedRequested = requestedAddress.toLowerCase();
  const ownsAddress = allAddresses.includes(normalizedRequested);

  if (!ownsAddress) {
    console.warn(
      `[Auth] Address mismatch: requested ${normalizedRequested}, owned [${allAddresses.join(", ")}]`
    );

    return {
      authenticated: false,
      error: "Address does not belong to authenticated user",
    };
  }

  return authResult;
}

/**
 * Create unauthorized response
 */
export function unauthorizedResponse(message: string = "Unauthorized"): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

/**
 * Create forbidden response (authenticated but not authorized for resource)
 */
export function forbiddenResponse(message: string = "Forbidden"): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}
