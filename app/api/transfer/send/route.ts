/**
 * Customer-Paid Transfer Execution API
 *
 * POST /api/transfer/send — Execute USDC transfer via the ERC-20 paymaster.
 * Gas is paid by the user in USDC; Tapioca does not subsidise.
 * See tasks/spec-usdc-send.md and tasks/architecture-usdc-send.md.
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { executeUserPaidTransfer, validateTransferParams } from "@/lib/zerodev/transfer-executor";
import {
  TRANSFER_PERMISSIONS_VERSION,
  validateTransferSession,
  type TransferSessionAuthorization,
} from "@/lib/zerodev/transfer-session";
import {
  checkTransferRateLimitRedis,
  recordTransferAttemptRedis,
  checkAndRecordRateLimit,
} from "@/lib/redis/rate-limiter";
import { IdempotencyBusyError, withIdempotencyKey } from "@/lib/redis/idempotency";
import { decryptAuthorization } from "@/lib/security/session-encryption";
import {
  requireAuthForAddress,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth/middleware";
import { validateTransferRecipient } from "@/lib/zerodev/transfer-recipient-validator";
import { isUsdcPaymasterEnabledServer } from "@/lib/config";

interface SendResponseBody {
  success: boolean;
  hash?: string;
  userOpHash?: string;
  feePaid?: string;
  attemptsRemaining?: number;
  error?: string;
  code?: string;
}

/**
 * POST /api/transfer/send
 * Execute customer-paid USDC transfer via ZeroDev bundler + ERC-20 paymaster.
 * Requires the session row to have `permissionsVersion >= 2`.
 */
export async function POST(request: NextRequest) {
  try {
    if (!isUsdcPaymasterEnabledServer()) {
      return NextResponse.json<SendResponseBody>(
        { success: false, error: "Sends are temporarily disabled", code: "FEATURE_DISABLED" },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { address, recipient, amount, label } = body as {
      address?: string;
      recipient?: string;
      amount?: string;
      label?: string;
    };

    if (!address || !recipient || !amount) {
      return NextResponse.json<SendResponseBody>(
        { success: false, error: "Missing required fields: address, recipient, amount" },
        { status: 400 }
      );
    }

    // SECURITY: verify the authenticated user owns the sender address.
    const authResult = await requireAuthForAddress(request, address);
    if (!authResult.authenticated) {
      if (authResult.error === "Address does not belong to authenticated user") {
        return forbiddenResponse(authResult.error);
      }
      return unauthorizedResponse(authResult.error);
    }

    const idempotencyKey = request.headers.get("idempotency-key") ?? undefined;

    const runHandler = async (): Promise<{ status: number; body: SendResponseBody }> => {
      console.log("[API] Processing user-paid transfer...");

      // 1. Load user + decrypt session row.
      const users = await sql`
        SELECT id, transfer_authorization
        FROM users
        WHERE LOWER(wallet_address) = LOWER(${address})
      `;
      if (users.length === 0) {
        return { status: 404, body: { success: false, error: "User not found" } };
      }

      const encryptedAuth = users[0].transfer_authorization as TransferSessionAuthorization | null;
      if (!encryptedAuth) {
        return {
          status: 409,
          body: {
            success: false,
            error: "Session required — please complete send setup.",
            code: "SESSION_UPGRADE_REQUIRED",
          },
        };
      }

      const transferAuth = decryptAuthorization(encryptedAuth);

      // 2. Version gate BEFORE any expensive work — missing field defaults to v1.
      const storedVersion = transferAuth.permissionsVersion ?? 1;
      if (storedVersion < TRANSFER_PERMISSIONS_VERSION) {
        return {
          status: 409,
          body: {
            success: false,
            error: "Session out of date — please re-enable send.",
            code: "SESSION_UPGRADE_REQUIRED",
          },
        };
      }

      // 3. Session validity (expiry, shape).
      const sessionValidation = validateTransferSession(transferAuth);
      if (!sessionValidation.valid) {
        return {
          status: 401,
          body: {
            success: false,
            error: sessionValidation.reason ?? "Session invalid",
            code: "SESSION_EXPIRED",
          },
        };
      }

      if (!transferAuth.serializedAccount) {
        return {
          status: 409,
          body: {
            success: false,
            error: "Session storage missing — please re-enable send.",
            code: "SESSION_UPGRADE_REQUIRED",
          },
        };
      }

      // 4. Recipient validation (H-3 defense-in-depth).
      const recipientValidation = validateTransferRecipient(recipient, address);
      if (!recipientValidation.valid) {
        await sql`
          INSERT INTO agent_actions (
            user_id, action_type, status, amount_usdc, error_message, metadata
          ) VALUES (
            ${users[0].id}, 'transfer', 'blocked',
            ${amount}, ${recipientValidation.reason || "Recipient validation failed"},
            ${JSON.stringify({ recipient, reason: recipientValidation.reason })}
          )
        `;
        return {
          status: 400,
          body: {
            success: false,
            error: recipientValidation.reason || "Invalid recipient",
            code: "INVALID_RECIPIENT",
          },
        };
      }

      // 5. Hourly rate-limit (tighter than daily).
      const hourlyRateLimit = await checkAndRecordRateLimit(address, {
        maxRequests: 3,
        windowMs: 60 * 60 * 1000,
        keyPrefix: "transfer_hourly",
        failClosed: true,
      });
      if (!hourlyRateLimit.allowed) {
        return {
          status: 429,
          body: {
            success: false,
            error: "Hourly transfer limit exceeded (max 3 per hour)",
            code: "RATE_LIMIT_EXCEEDED",
          },
        };
      }

      // 6. Daily rate-limit.
      const amountNum = parseFloat(amount);
      const rateLimitCheck = await checkTransferRateLimitRedis(address, amountNum);
      if (!rateLimitCheck.allowed) {
        return {
          status: 429,
          body: {
            success: false,
            error: "Daily transfer limit exceeded",
            code: "RATE_LIMIT_EXCEEDED",
          },
        };
      }

      // 7. Parameter shape validation.
      const paramsValidation = validateTransferParams({
        userAddress: address as `0x${string}`,
        smartAccountAddress: transferAuth.smartAccountAddress,
        recipient: recipient as `0x${string}`,
        amount,
        serializedAccount: transferAuth.serializedAccount,
      });
      if (!paramsValidation.valid) {
        return {
          status: 400,
          body: {
            success: false,
            error: paramsValidation.error ?? "Invalid transfer parameters",
            code: "INVALID_PARAMS",
          },
        };
      }

      // 8. Execute the customer-paid transfer.
      const result = await executeUserPaidTransfer({
        userAddress: address as `0x${string}`,
        smartAccountAddress: transferAuth.smartAccountAddress,
        recipient: recipient as `0x${string}`,
        amount,
        serializedAccount: transferAuth.serializedAccount,
      });

      await recordTransferAttemptRedis(address, amountNum, result.success);

      if (!result.success) {
        await sql`
          INSERT INTO agent_actions (
            user_id, action_type, status, amount_usdc, error_message, metadata
          ) VALUES (
            ${users[0].id}, 'transfer', 'failed',
            ${amount}, ${result.error || "Unknown error"},
            ${JSON.stringify({ recipient, smartAccountAddress: transferAuth.smartAccountAddress })}
          )
        `;

        const code = classifyBundlerError(result.error);
        return {
          status: code === "PAYMASTER_UNAVAILABLE" ? 503 : 500,
          body: {
            success: false,
            error: result.error || "Transfer failed",
            code,
          },
        };
      }

      // 9. Log to agent_actions (existing) AND fire-and-forget transfer_history insert.
      await sql`
        INSERT INTO agent_actions (
          user_id, action_type, status, amount_usdc, tx_hash, metadata
        ) VALUES (
          ${users[0].id}, 'transfer', 'success',
          ${amount}, ${result.hash},
          ${JSON.stringify({
            recipient,
            userOpHash: result.userOpHash,
            feePaid: result.feePaid,
            smartAccountAddress: transferAuth.smartAccountAddress,
          })}
        )
      `;

      sql`
        INSERT INTO transfer_history (
          user_id, tx_hash, user_op_hash, recipient_addr, recipient_label, amount, fee_paid
        ) VALUES (
          ${users[0].id}, ${result.hash}, ${result.userOpHash ?? null},
          ${recipient}, ${label ?? null}, ${amount}, ${result.feePaid ?? null}
        )
      `.catch((err) => console.error("[TransferHistory] insert failed (non-fatal)", err));

      return {
        status: 200,
        body: {
          success: true,
          hash: result.hash,
          userOpHash: result.userOpHash,
          feePaid: result.feePaid,
          attemptsRemaining: rateLimitCheck.remaining,
        },
      };
    };

    // Wrap in idempotency if the client supplied a key.
    let outcome: { status: number; body: SendResponseBody };
    if (idempotencyKey) {
      const userScope = authResult.userId ?? address.toLowerCase();
      try {
        outcome = await withIdempotencyKey(userScope, idempotencyKey, runHandler);
      } catch (err) {
        if (err instanceof IdempotencyBusyError) {
          return NextResponse.json<SendResponseBody>(
            { success: false, error: err.message, code: "IDEMPOTENCY_BUSY" },
            { status: 409 }
          );
        }
        throw err;
      }
    } else {
      outcome = await runHandler();
    }

    return NextResponse.json<SendResponseBody>(outcome.body, { status: outcome.status });
  } catch (error: any) {
    console.error("[API] User-paid transfer error:", error);
    return NextResponse.json<SendResponseBody>(
      {
        success: false,
        error: "Internal server error",
        ...(process.env.NODE_ENV === "development" && { error: error.message }),
      },
      { status: 500 }
    );
  }
}

/** Map raw bundler/paymaster error strings to user-facing error codes. */
function classifyBundlerError(raw: string | undefined): string {
  if (!raw) return "TRANSFER_FAILED";
  const msg = raw.toLowerCase();
  if (msg.includes("aa31") || msg.includes("paymaster deposit")) return "PAYMASTER_UNAVAILABLE";
  if (msg.includes("aa23") || msg.includes("aa24")) return "SESSION_UPGRADE_REQUIRED";
  if (msg.includes("session_upgrade_required")) return "SESSION_UPGRADE_REQUIRED";
  return "TRANSFER_FAILED";
}
