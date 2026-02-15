/**
 * Server-Side Session Key Storage API
 *
 * POST /api/agent/generate-session-key
 *
 * Accepts a serialized kernel account from the client (created using
 * ZeroDev's serializePermissionAccount pattern). The serialized data
 * includes the session key, enable signature, policies, and EIP-7702 auth.
 *
 * The server encrypts and stores the serialized account for later
 * deserialization during execution.
 */

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { encryptAuthorization } from '@/lib/security/session-encryption';
import {
  requireAuthForAddress,
  unauthorizedResponse,
  forbiddenResponse,
} from '@/lib/auth/middleware';

const sql = neon(process.env.DATABASE_URL!);

interface StoreSessionRequest {
  address: string;
  smartAccountAddress: string;
  sessionKeyAddress: string;
  serializedAccount: string; // Base64 serialized kernel account from client
  approvedVaults: string[];
  expiry: number;
}

/**
 * POST /api/agent/generate-session-key
 * Store serialized kernel account from client-side registration
 */
export async function POST(request: NextRequest) {
  try {
    const body: StoreSessionRequest = await request.json();
    const { address, sessionKeyAddress, serializedAccount, approvedVaults, expiry } = body;

    // Validate required fields
    if (!address) {
      return NextResponse.json(
        { error: 'Missing wallet address' },
        { status: 400 }
      );
    }

    if (!serializedAccount) {
      return NextResponse.json(
        { error: 'Missing serialized account data' },
        { status: 400 }
      );
    }

    if (!sessionKeyAddress) {
      return NextResponse.json(
        { error: 'Missing session key address' },
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

    console.log('[Session Key] Storing serialized account for:', address);

    // Create authorization object and encrypt
    const authorization = {
      type: 'zerodev-7702-session' as const,
      eoaAddress: address as `0x${string}`,
      sessionKeyAddress: sessionKeyAddress as `0x${string}`,
      serializedAccount, // Will be encrypted
      approvedVaults: approvedVaults as `0x${string}`[],
      expiry,
      timestamp: Date.now(),
    };

    const encryptedAuth = encryptAuthorization(authorization);
    const authJson = JSON.stringify(encryptedAuth);

    // Store encrypted session data in database
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

    console.log('[Session Key] Serialized account stored successfully');

    // Return ONLY the public session key address
    return NextResponse.json({
      success: true,
      sessionKeyAddress,
      expiry,
    });
  } catch (error: any) {
    console.error('[Session Key] Storage error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Failed to store session data',
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

    console.log('[Session Key] Session key revoked');

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
