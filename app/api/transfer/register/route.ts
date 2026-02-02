/**
 * Transfer Session Registration API
 *
 * Endpoints:
 * - POST /api/transfer/register - Create transfer session key
 * - GET /api/transfer/register?address=0x... - Check transfer session status
 * - DELETE /api/transfer/register - Revoke transfer session
 */

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import {
  createTransferSessionKey,
  validateTransferSession,
  type TransferSessionAuthorization,
  type PrivyWalletProvider,
} from '@/lib/zerodev/transfer-session';
import { encryptAuthorization } from '@/lib/security/session-encryption';

const sql = neon(process.env.DATABASE_URL!);

/**
 * GET /api/transfer/register?address=0x...
 * Check if user has active transfer session
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json(
        { error: 'Address required' },
        { status: 400 }
      );
    }

    // Query user from database
    const users = await sql`
      SELECT transfer_authorization
      FROM users
      WHERE LOWER(wallet_address) = LOWER(${address})
    `;

    if (users.length === 0) {
      return NextResponse.json({
        isEnabled: false,
        message: 'User not found',
      });
    }

    const transferAuth = users[0].transfer_authorization as TransferSessionAuthorization | null;

    if (!transferAuth) {
      return NextResponse.json({
        isEnabled: false,
      });
    }

    // Validate session
    const validation = validateTransferSession(transferAuth);

    if (!validation.valid) {
      return NextResponse.json({
        isEnabled: false,
        reason: validation.reason,
      });
    }

    return NextResponse.json({
      isEnabled: true,
      smartAccountAddress: transferAuth.smartAccountAddress,
      sessionKeyAddress: transferAuth.sessionKeyAddress,
      expiry: transferAuth.expiry,
      createdAt: transferAuth.createdAt,
    });

  } catch (error: any) {
    console.error('[API] Transfer status check failed:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/transfer/register
 * Create transfer session key for gasless transfers
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, privyWallet } = body;

    if (!address) {
      return NextResponse.json(
        { error: 'Address required' },
        { status: 400 }
      );
    }

    // Note: In production, privyWallet would be obtained from the authenticated session
    // For now, we accept it in the request body
    if (!privyWallet) {
      return NextResponse.json(
        { error: 'Privy wallet required' },
        { status: 400 }
      );
    }

    console.log('[API] Creating transfer session for:', address);

    // Check if user exists
    const users = await sql`
      SELECT id, transfer_authorization
      FROM users
      WHERE LOWER(wallet_address) = LOWER(${address})
    `;

    if (users.length === 0) {
      return NextResponse.json(
        { error: 'User not found. Please login first.' },
        { status: 404 }
      );
    }

    const existingAuth = users[0].transfer_authorization as TransferSessionAuthorization | null;

    // Check if valid session already exists
    if (existingAuth) {
      const validation = validateTransferSession(existingAuth);
      if (validation.valid) {
        console.log('[API] Valid transfer session already exists');
        return NextResponse.json({
          success: true,
          smartAccountAddress: existingAuth.smartAccountAddress,
          expiry: existingAuth.expiry,
          message: 'Transfer session already active',
        });
      }
    }

    // Create new transfer session key
    const authorization = await createTransferSessionKey(
      privyWallet as PrivyWalletProvider,
      address as `0x${string}`
    );

    // Encrypt authorization before storing
    const encryptedAuth = encryptAuthorization(authorization);

    // Store in database
    await sql`
      UPDATE users
      SET transfer_authorization = ${JSON.stringify(encryptedAuth)},
          updated_at = NOW()
      WHERE LOWER(wallet_address) = LOWER(${address})
    `;

    console.log('[API] ✓ Transfer session created:', authorization.smartAccountAddress);

    return NextResponse.json({
      success: true,
      smartAccountAddress: authorization.smartAccountAddress,
      sessionKeyAddress: authorization.sessionKeyAddress,
      expiry: authorization.expiry,
    });

  } catch (error: any) {
    console.error('[API] Transfer session creation failed:', error);
    return NextResponse.json(
      { error: 'Failed to create transfer session', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/transfer/register
 * Revoke transfer session
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { address } = body;

    if (!address) {
      return NextResponse.json(
        { error: 'Address required' },
        { status: 400 }
      );
    }

    console.log('[API] Revoking transfer session for:', address);

    // Remove transfer authorization from database
    const result = await sql`
      UPDATE users
      SET transfer_authorization = NULL,
          updated_at = NOW()
      WHERE LOWER(wallet_address) = LOWER(${address})
      RETURNING id
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    console.log('[API] ✓ Transfer session revoked');

    return NextResponse.json({
      success: true,
      message: 'Transfer session revoked successfully',
    });

  } catch (error: any) {
    console.error('[API] Transfer session revocation failed:', error);
    return NextResponse.json(
      { error: 'Failed to revoke transfer session', details: error.message },
      { status: 500 }
    );
  }
}
