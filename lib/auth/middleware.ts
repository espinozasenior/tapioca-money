/**
 * Privy JWT Authentication Middleware
 *
 * Verifies Privy access tokens and validates wallet address ownership.
 * Use this middleware to protect API routes that modify user data.
 *
 * SECURITY: Prevents attackers from impersonating other users by
 * verifying the JWT claims match the requested wallet address.
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/node';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;

// Initialize Privy client (singleton)
let privyClient: PrivyClient | null = null;

function getPrivyClient(): PrivyClient {
  if (!privyClient) {
    if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
      throw new Error('PRIVY_APP_ID and PRIVY_APP_SECRET must be configured');
    }
    privyClient = new PrivyClient({ appId: PRIVY_APP_ID, appSecret: PRIVY_APP_SECRET });
  }
  return privyClient;
}

export interface AuthResult {
  authenticated: boolean;
  userId?: string;
  walletAddress?: string;
  error?: string;
}

/**
 * Extract wallet address from Privy user's linked accounts
 */
function extractWalletAddress(linkedAccounts: any[]): string | null {
  if (!linkedAccounts || linkedAccounts.length === 0) {
    return null;
  }

  // Find embedded wallet (prioritize over external wallets)
  const embeddedWallet = linkedAccounts.find(
    (account) => account.type === 'wallet' && account.chainType === 'ethereum'
  );

  if (embeddedWallet?.address) {
    return embeddedWallet.address.toLowerCase();
  }

  // Fallback to any wallet
  const anyWallet = linkedAccounts.find(
    (account) => account.type === 'wallet' && account.address
  );

  return anyWallet?.address?.toLowerCase() || null;
}

/**
 * Authenticate request and return user info
 *
 * @param request - NextRequest object
 * @returns AuthResult with user info or error
 */
export async function authenticateRequest(
  request: NextRequest
): Promise<AuthResult> {
  try {
    // Extract token from Authorization header
    const authHeader = request.headers.get('authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return {
        authenticated: false,
        error: 'Missing or invalid Authorization header',
      };
    }

    const token = authHeader.slice(7);

    if (!token) {
      return {
        authenticated: false,
        error: 'Missing access token',
      };
    }

    // Verify token using Privy SDK
    const privy = getPrivyClient();
    const verifiedClaims = await privy.utils().auth().verifyAccessToken(token);

    // Get user details to access linked accounts
    const user = await privy.users()._get(verifiedClaims.user_id);
    const walletAddress = extractWalletAddress(user.linked_accounts);

    return {
      authenticated: true,
      userId: verifiedClaims.user_id,
      walletAddress: walletAddress || undefined,
    };
  } catch (error: any) {
    console.error('[Auth] Token verification failed:', error.message);

    return {
      authenticated: false,
      error: error.message || 'Authentication failed',
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

  if (!authResult.walletAddress) {
    return {
      authenticated: false,
      error: 'No wallet linked to account',
    };
  }

  // Compare wallet addresses (case-insensitive)
  const normalizedRequested = requestedAddress.toLowerCase();
  const normalizedOwned = authResult.walletAddress.toLowerCase();

  if (normalizedRequested !== normalizedOwned) {
    console.warn(
      `[Auth] Address mismatch: requested ${normalizedRequested}, owned ${normalizedOwned}`
    );

    return {
      authenticated: false,
      error: 'Address does not belong to authenticated user',
    };
  }

  return authResult;
}

/**
 * Create unauthorized response
 */
export function unauthorizedResponse(message: string = 'Unauthorized'): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

/**
 * Create forbidden response (authenticated but not authorized for resource)
 */
export function forbiddenResponse(message: string = 'Forbidden'): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}
