/**
 * Gasless Transfer Execution API
 *
 * POST /api/transfer/send - Execute gasless USDC transfer
 */

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import {
  executeGaslessTransfer,
  validateTransferParams,
  type GaslessTransferParams,
} from '@/lib/zerodev/transfer-executor';
import {
  validateTransferSession,
  type TransferSessionAuthorization,
} from '@/lib/zerodev/transfer-session';
import {
  checkTransferRateLimit,
  recordTransferAttempt,
} from '@/lib/rate-limiter';
import { decryptAuthorization } from '@/lib/security/session-encryption';

const sql = neon(process.env.DATABASE_URL!);

/**
 * POST /api/transfer/send
 * Execute gasless USDC transfer via ZeroDev bundler
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, recipient, amount } = body;

    if (!address || !recipient || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields: address, recipient, amount' },
        { status: 400 }
      );
    }

    console.log('[API] Processing gasless transfer...');
    console.log('[API] From:', address);
    console.log('[API] To:', recipient);
    console.log('[API] Amount:', amount, 'USDC');

    // 1. Get user and transfer authorization from database
    const users = await sql`
      SELECT id, transfer_authorization
      FROM users
      WHERE LOWER(wallet_address) = LOWER(${address})
    `;

    if (users.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const encryptedAuth = users[0].transfer_authorization as TransferSessionAuthorization | null;

    if (!encryptedAuth) {
      return NextResponse.json(
        { error: 'Gasless transfers not enabled. Please enable in settings.' },
        { status: 403 }
      );
    }

    // Decrypt authorization
    const transferAuth = decryptAuthorization(encryptedAuth);

    // 2. Validate transfer session
    const sessionValidation = validateTransferSession(transferAuth);

    if (!sessionValidation.valid) {
      return NextResponse.json(
        {
          error: 'Transfer session invalid or expired',
          reason: sessionValidation.reason,
        },
        { status: 403 }
      );
    }

    // 3. Check rate limits
    const amountNum = parseFloat(amount);
    const rateLimitCheck = checkTransferRateLimit(address, amountNum);

    if (!rateLimitCheck.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          reason: rateLimitCheck.reason,
          attemptsRemaining: rateLimitCheck.attemptsRemaining,
          resetTime: rateLimitCheck.resetTime,
        },
        { status: 429 }
      );
    }

    // 4. Validate transfer parameters
    const paramsValidation = validateTransferParams({
      userAddress: address as `0x${string}`,
      smartAccountAddress: transferAuth.smartAccountAddress,
      recipient: recipient as `0x${string}`,
      amount,
      sessionPrivateKey: transferAuth.sessionPrivateKey,
    });

    if (!paramsValidation.valid) {
      return NextResponse.json(
        { error: paramsValidation.error },
        { status: 400 }
      );
    }

    // 5. Execute gasless transfer
    const transferParams: GaslessTransferParams = {
      userAddress: address as `0x${string}`,
      smartAccountAddress: transferAuth.smartAccountAddress,
      recipient: recipient as `0x${string}`,
      amount,
      sessionPrivateKey: transferAuth.sessionPrivateKey,
    };

    const result = await executeGaslessTransfer(transferParams);

    // 6. Record attempt (for rate limiting)
    recordTransferAttempt(address, amountNum, result.success);

    // 7. Log to database
    if (result.success) {
      await sql`
        INSERT INTO agent_actions (
          user_id,
          action_type,
          status,
          amount_usdc,
          tx_hash,
          metadata
        )
        VALUES (
          ${users[0].id},
          'transfer',
          'success',
          ${amount},
          ${result.hash},
          ${JSON.stringify({
            recipient,
            userOpHash: result.userOpHash,
            gasless: true,
            smartAccountAddress: transferAuth.smartAccountAddress,
          })}
        )
      `;

      console.log('[API] ✓ Transfer successful:', result.hash);

      return NextResponse.json({
        success: true,
        hash: result.hash,
        userOpHash: result.userOpHash,
        attemptsRemaining: rateLimitCheck.attemptsRemaining,
      });
    } else {
      // Log failed attempt
      await sql`
        INSERT INTO agent_actions (
          user_id,
          action_type,
          status,
          amount_usdc,
          error_message,
          metadata
        )
        VALUES (
          ${users[0].id},
          'transfer',
          'failed',
          ${amount},
          ${result.error || 'Unknown error'},
          ${JSON.stringify({
            recipient,
            smartAccountAddress: transferAuth.smartAccountAddress,
          })}
        )
      `;

      console.error('[API] ✗ Transfer failed:', result.error);

      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Transfer failed',
        },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('[API] Gasless transfer error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
