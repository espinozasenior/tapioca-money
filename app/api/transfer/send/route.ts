/**
 * Gasless Transfer Execution API
 *
 * POST /api/transfer/send - Execute gasless USDC transfer
 */

import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import {
  executeGaslessTransfer,
  validateTransferParams,
  type GaslessTransferParams,
} from "@/lib/zerodev/transfer-executor";
import {
  validateTransferSession,
  type TransferSessionAuthorization,
} from "@/lib/zerodev/transfer-session";
import {
  checkTransferRateLimitRedis,
  recordTransferAttemptRedis,
  checkAndRecordRateLimit,
} from "@/lib/redis/rate-limiter";
import { decryptAuthorization } from "@/lib/security/session-encryption";
import {
  requireAuthForAddress,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth/middleware";
import { validateTransferRecipient } from "@/lib/zerodev/transfer-recipient-validator";

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
        { error: "Missing required fields: address, recipient, amount" },
        { status: 400 }
      );
    }

    // SECURITY: Verify authenticated user owns the sender address
    const authResult = await requireAuthForAddress(request, address);
    if (!authResult.authenticated) {
      if (authResult.error === "Address does not belong to authenticated user") {
        return forbiddenResponse(authResult.error);
      }
      return unauthorizedResponse(authResult.error);
    }

    console.log("[API] Processing gasless transfer...");
    console.log("[API] From:", address);
    console.log("[API] To:", recipient);
    console.log("[API] Amount:", amount, "USDC");

    // 1. Get user and transfer authorization from database
    const users = await sql`
      SELECT id, transfer_authorization
      FROM users
      WHERE LOWER(wallet_address) = LOWER(${address})
    `;

    if (users.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const encryptedAuth = users[0].transfer_authorization as TransferSessionAuthorization | null;

    if (!encryptedAuth) {
      return NextResponse.json(
        { error: "Gasless transfers not enabled. Please enable in settings." },
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
          error: "Transfer session invalid or expired",
          reason: sessionValidation.reason,
        },
        { status: 403 }
      );
    }

    // 2b. SECURITY: Validate recipient address (H-3 defense-in-depth)
    // The on-chain CallPolicy cannot constrain transfer recipients, so we
    // enforce server-side validation: no zero address, no self-transfers,
    // no known contract addresses (which would lose funds or enable drains).
    const recipientValidation = validateTransferRecipient(recipient, address);
    if (!recipientValidation.valid) {
      // Log blocked attempt for monitoring
      await sql`
        INSERT INTO agent_actions (
          user_id, action_type, status, amount_usdc, error_message, metadata
        ) VALUES (
          ${users[0].id}, 'transfer', 'blocked',
          ${amount}, ${recipientValidation.reason || "Recipient validation failed"},
          ${JSON.stringify({ recipient, reason: recipientValidation.reason })}
        )
      `;
      console.warn(
        "[API] Transfer blocked — invalid recipient:",
        recipient,
        recipientValidation.reason
      );
      return NextResponse.json(
        { error: recipientValidation.reason || "Invalid recipient" },
        { status: 400 }
      );
    }

    // 2c. SECURITY: Stricter per-hour rate limit (H-3 defense-in-depth)
    // The daily rate limit (20/day) is too coarse to prevent rapid draining.
    // This adds a 3-transfers-per-hour limit as a tighter window.
    const hourlyRateLimit = await checkAndRecordRateLimit(address, {
      maxRequests: 3,
      windowMs: 60 * 60 * 1000, // 1 hour
      keyPrefix: "transfer_hourly",
      failClosed: true,
    });
    if (!hourlyRateLimit.allowed) {
      console.warn("[API] Transfer blocked — hourly rate limit exceeded for:", address);
      return NextResponse.json(
        {
          error: "Hourly transfer limit exceeded (max 3 per hour)",
          reason: hourlyRateLimit.reason,
          retryAfter: hourlyRateLimit.retryAfter,
        },
        { status: 429 }
      );
    }

    // 3. Check rate limits (daily)
    const amountNum = parseFloat(amount);
    const rateLimitCheck = await checkTransferRateLimitRedis(address, amountNum);

    if (!rateLimitCheck.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          reason: rateLimitCheck.reason,
          attemptsRemaining: rateLimitCheck.remaining,
          resetTime: rateLimitCheck.resetTime,
        },
        { status: 429 }
      );
    }

    // 4. Validate transfer parameters
    // Prefer serializedAccount (new pattern), fall back to sessionPrivateKey (legacy)
    const paramsValidation = validateTransferParams({
      userAddress: address as `0x${string}`,
      smartAccountAddress: transferAuth.smartAccountAddress,
      recipient: recipient as `0x${string}`,
      amount,
      serializedAccount: transferAuth.serializedAccount,
      sessionPrivateKey: transferAuth.sessionPrivateKey as `0x${string}` | undefined,
    });

    if (!paramsValidation.valid) {
      return NextResponse.json({ error: paramsValidation.error }, { status: 400 });
    }

    // 5. Execute gasless transfer
    // Prefer serializedAccount (new pattern) — uses createDeserializedKernelClient
    // which properly restores the on-chain permission validator.
    // Falls back to sessionPrivateKey for legacy sessions (will warn user to re-register).
    const transferParams: GaslessTransferParams = {
      userAddress: address as `0x${string}`,
      smartAccountAddress: transferAuth.smartAccountAddress,
      recipient: recipient as `0x${string}`,
      amount,
      serializedAccount: transferAuth.serializedAccount,
      sessionPrivateKey: transferAuth.sessionPrivateKey as `0x${string}` | undefined,
    };

    const result = await executeGaslessTransfer(transferParams);

    // 6. Record attempt (for rate limiting)
    await recordTransferAttemptRedis(address, amountNum, result.success);

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

      console.log("[API] ✓ Transfer successful:", result.hash);

      return NextResponse.json({
        success: true,
        hash: result.hash,
        userOpHash: result.userOpHash,
        attemptsRemaining: rateLimitCheck.remaining,
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
          ${result.error || "Unknown error"},
          ${JSON.stringify({
            recipient,
            smartAccountAddress: transferAuth.smartAccountAddress,
          })}
        )
      `;

      console.error("[API] ✗ Transfer failed:", result.error);

      return NextResponse.json(
        {
          success: false,
          error: result.error || "Transfer failed",
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("[API] Gasless transfer error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        ...(process.env.NODE_ENV === "development" && { details: error.message }),
      },
      { status: 500 }
    );
  }
}
