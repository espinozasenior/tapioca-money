/**
 * Server-Side Session Key Generation API
 *
 * POST /api/agent/generate-session-key
 *
 * SECURITY: Generates session key private key on the server side to prevent
 * XSS attacks from accessing the key. The private key is encrypted before
 * being stored in the database.
 *
 * Flow:
 * 1. Client creates Kernel V3 smart account with Privy signer
 * 2. Client sends smart account address to this endpoint
 * 3. Server generates session key, encrypts, and stores it
 * 4. Server returns session key PUBLIC address for client to configure permissions
 * 5. Client never sees the private key
 */

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { encryptAuthorization } from '@/lib/security/session-encryption';
import {
  requireAuthForAddress,
  unauthorizedResponse,
  forbiddenResponse,
} from '@/lib/auth/middleware';

const sql = neon(process.env.DATABASE_URL!);

// Session key expiry: 7 days (reduced from 30 days for security)
const SESSION_KEY_EXPIRY_DAYS = 7;

// Policy configuration for session keys
const POLICY_CONFIG = {
  gasPolicy: {
    allowed: '50000000000000', // 500k gas * 0.1 gwei (as string for JSON serialization)
  },
  rateLimitPolicy: {
    count: 10,
    interval: 86400, // 24 hours in seconds
  },
};

interface GenerateSessionKeyRequest {
  address: string;
  smartAccountAddress: string;
  approvedVaults: string[];
  eip7702SignedAuth?: any; // Signed EIP-7702 authorization from Privy
}

/**
 * POST /api/agent/generate-session-key
 * Generate session key on server and store encrypted
 */
export async function POST(request: NextRequest) {
  try {
    const body: GenerateSessionKeyRequest = await request.json();
    const { address, smartAccountAddress, approvedVaults, eip7702SignedAuth } = body;

    // Validate required fields
    if (!address) {
      return NextResponse.json(
        { error: 'Missing wallet address' },
        { status: 400 }
      );
    }

    if (!smartAccountAddress) {
      return NextResponse.json(
        { error: 'Missing smart account address' },
        { status: 400 }
      );
    }

    if (!approvedVaults || !Array.isArray(approvedVaults)) {
      return NextResponse.json(
        { error: 'Missing or invalid approved vaults' },
        { status: 400 }
      );
    }

    // SECURITY: Verify authenticated user owns the requested address
    const authResult = await requireAuthForAddress(request, address);
    if (!authResult.authenticated) {
      if (authResult.error === 'Address does not belong to authenticated user') {
        return forbiddenResponse(authResult.error);
      }
      return unauthorizedResponse(authResult.error);
    }

    console.log('[Session Key] Generating server-side session key for:', address);

    // 1. Generate session key on server (NEVER sent to client)
    const sessionPrivateKey = generatePrivateKey();
    const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);
    const sessionKeyAddress = sessionKeyAccount.address;

    console.log('[Session Key] Generated session key address:', sessionKeyAddress);

    // 2. Calculate expiry (7 days from now)
    const expiry = Math.floor(Date.now() / 1000) + SESSION_KEY_EXPIRY_DAYS * 24 * 60 * 60;

    // 3. Create authorization object and encrypt
    // EIP-7702: eoaAddress === smartAccountAddress (single address model)
    const authorization = {
      type: 'zerodev-7702-session' as const,
      eoaAddress: address as `0x${string}`,
      sessionKeyAddress: sessionKeyAddress as `0x${string}`,
      sessionPrivateKey: sessionPrivateKey as `0x${string}`,
      approvedVaults: approvedVaults as `0x${string}`[],
      expiry,
      timestamp: Date.now(),
      policyConfig: POLICY_CONFIG,
      ...(eip7702SignedAuth ? { eip7702SignedAuth } : {}),
    };

    const encryptedAuth = encryptAuthorization(authorization);
    const authJson = JSON.stringify(encryptedAuth);

    // 4. Store encrypted session key in database
    const normalizedAddress = address.toLowerCase();
    await sql`
      INSERT INTO users (wallet_address, agent_registered, authorization_7702)
      VALUES (${normalizedAddress}, true, ${authJson}::jsonb)
      ON CONFLICT (wallet_address)
      DO UPDATE SET
        agent_registered = true,
        authorization_7702 = ${authJson}::jsonb,
        updated_at = NOW()
    `;

    // Ensure user has a strategy entry
    await sql`
      INSERT INTO user_strategies (user_id)
      SELECT id FROM users WHERE wallet_address = ${normalizedAddress}
      ON CONFLICT (user_id) DO NOTHING
    `;

    console.log('[Session Key] ✓ Session key stored successfully');

    // 5. Return ONLY the public session key address
    // CRITICAL: Never return sessionPrivateKey to the client
    return NextResponse.json({
      success: true,
      sessionKeyAddress,
      expiry,
    });
  } catch (error: any) {
    console.error('[Session Key] Generation error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Failed to generate session key',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/agent/generate-session-key
 * Revoke session key (invalidates the stored key)
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { address } = body;

    if (!address) {
      return NextResponse.json(
        { error: 'Missing wallet address' },
        { status: 400 }
      );
    }

    // SECURITY: Verify authenticated user owns the requested address
    const authResult = await requireAuthForAddress(request, address);
    if (!authResult.authenticated) {
      if (authResult.error === 'Address does not belong to authenticated user') {
        return forbiddenResponse(authResult.error);
      }
      return unauthorizedResponse(authResult.error);
    }

    console.log('[Session Key] Revoking session key for:', address);

    // Remove session key from database
    await sql`
      UPDATE users
      SET authorization_7702 = NULL,
          agent_registered = false,
          auto_optimize_enabled = false,
          updated_at = NOW()
      WHERE LOWER(wallet_address) = LOWER(${address})
    `;

    console.log('[Session Key] ✓ Session key revoked');

    return NextResponse.json({
      success: true,
      message: 'Session key revoked successfully',
    });
  } catch (error: any) {
    console.error('[Session Key] Revocation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to revoke session key' },
      { status: 500 }
    );
  }
}
