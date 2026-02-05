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
import { createPublicKey, verify } from 'crypto';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;

// Privy JWKS endpoint for token verification
const PRIVY_JWKS_URL = 'https://auth.privy.io/api/v1/apps/{appId}/jwks.json';

// Cache for JWKS keys (refresh every hour)
let jwksCache: { keys: JsonWebKey[]; fetchedAt: number } | null = null;
const JWKS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

export interface AuthResult {
  authenticated: boolean;
  userId?: string;
  walletAddress?: string;
  error?: string;
}

export interface PrivyTokenClaims {
  aud: string; // Audience (app ID)
  exp: number; // Expiration timestamp
  iat: number; // Issued at timestamp
  iss: string; // Issuer (privy.io)
  sub: string; // Subject (Privy user ID: did:privy:...)
  sid?: string; // Session ID
  linked_accounts?: Array<{
    type: string;
    address?: string;
    verified_at?: number;
    chain_type?: string;
  }>;
}

/**
 * Fetch JWKS from Privy (with caching)
 */
async function getJwks(): Promise<JsonWebKey[]> {
  const now = Date.now();

  if (jwksCache && now - jwksCache.fetchedAt < JWKS_CACHE_TTL) {
    return jwksCache.keys;
  }

  if (!PRIVY_APP_ID) {
    throw new Error('PRIVY_APP_ID not configured');
  }

  const url = PRIVY_JWKS_URL.replace('{appId}', PRIVY_APP_ID);
  const response = await fetch(url, {
    headers: {
      'privy-app-id': PRIVY_APP_ID,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.status}`);
  }

  const { keys } = await response.json();
  jwksCache = { keys, fetchedAt: now };

  return keys;
}

/**
 * Verify Privy JWT token using JWKS
 */
async function verifyPrivyToken(token: string): Promise<PrivyTokenClaims> {
  // Decode header to get key ID
  const [headerB64, payloadB64, signatureB64] = token.split('.');

  if (!headerB64 || !payloadB64 || !signatureB64) {
    throw new Error('Invalid token format');
  }

  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
  const payload = JSON.parse(
    Buffer.from(payloadB64, 'base64url').toString()
  ) as PrivyTokenClaims;

  // Validate claims
  const now = Math.floor(Date.now() / 1000);

  if (payload.exp && payload.exp < now) {
    throw new Error('Token expired');
  }

  if (payload.iss !== 'privy.io') {
    throw new Error('Invalid token issuer');
  }

  if (payload.aud !== PRIVY_APP_ID) {
    throw new Error('Invalid token audience');
  }

  // Verify signature using JWKS
  const jwks = await getJwks();
  const key = jwks.find((k: any) => k.kid === header.kid);

  if (!key) {
    // Refresh cache and try again
    jwksCache = null;
    const refreshedJwks = await getJwks();
    const refreshedKey = refreshedJwks.find((k: any) => k.kid === header.kid);

    if (!refreshedKey) {
      throw new Error('Signing key not found');
    }

    await verifyJwtSignature(token, refreshedKey);
  } else {
    await verifyJwtSignature(token, key);
  }

  return payload;
}

/**
 * Verify JWT signature using public key
 */
async function verifyJwtSignature(
  token: string,
  jwk: JsonWebKey
): Promise<void> {
  const [headerB64, payloadB64, signatureB64] = token.split('.');
  const signedData = `${headerB64}.${payloadB64}`;
  const signature = Buffer.from(signatureB64, 'base64url');

  // Import JWK as public key
  const publicKey = createPublicKey({
    key: jwk as any,
    format: 'jwk',
  });

  // Verify signature
  const isValid = verify(
    'RS256',
    Buffer.from(signedData),
    publicKey,
    signature
  );

  if (!isValid) {
    throw new Error('Invalid token signature');
  }
}

/**
 * Extract wallet address from Privy token claims
 */
function extractWalletAddress(claims: PrivyTokenClaims): string | null {
  if (!claims.linked_accounts) {
    return null;
  }

  // Find embedded wallet (prioritize over external wallets)
  const embeddedWallet = claims.linked_accounts.find(
    (account) => account.type === 'wallet' && account.chain_type === 'ethereum'
  );

  if (embeddedWallet?.address) {
    return embeddedWallet.address.toLowerCase();
  }

  // Fallback to any wallet
  const anyWallet = claims.linked_accounts.find(
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

    // Verify token
    const claims = await verifyPrivyToken(token);

    // Extract wallet address
    const walletAddress = extractWalletAddress(claims);

    return {
      authenticated: true,
      userId: claims.sub,
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
