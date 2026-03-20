/**
 * @deprecated Use lib/redis/rate-limiter.ts instead.
 * This file is a compatibility shim that preserves the old synchronous API
 * for existing tests. New code should use the Redis-based rate limiter directly.
 *
 * TODO: Migrate tests to use the async Redis-based rate limiter.
 */

// In-memory store (legacy, for backward compatibility only)
interface TransferAttempt {
  timestamp: number;
  amount: number;
  success: boolean;
}

const transferAttempts = new Map<string, TransferAttempt[]>();

export interface RateLimitConfig {
  maxTransfersPerDay: number;
  maxAmountPerTransfer: number;
  windowMs: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxTransfersPerDay: 20,
  maxAmountPerTransfer: 500,
  windowMs: 24 * 60 * 60 * 1000,
};

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  attemptsRemaining?: number;
  resetTime?: number;
}

export function checkTransferRateLimit(
  userAddress: string,
  amount: number,
  config: RateLimitConfig = DEFAULT_CONFIG
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - config.windowMs;
  const attempts = transferAttempts.get(userAddress.toLowerCase()) || [];
  const recentAttempts = attempts.filter((a) => a.timestamp > windowStart);
  transferAttempts.set(userAddress.toLowerCase(), recentAttempts);

  if (amount > config.maxAmountPerTransfer) {
    return {
      allowed: false,
      reason: `Amount exceeds maximum of $${config.maxAmountPerTransfer} per transfer`,
    };
  }

  const successfulTransfers = recentAttempts.filter((a) => a.success).length;
  if (successfulTransfers >= config.maxTransfersPerDay) {
    const oldestAttempt = recentAttempts[0];
    const resetTime = oldestAttempt.timestamp + config.windowMs;
    return {
      allowed: false,
      reason: `Daily transfer limit of ${config.maxTransfersPerDay} reached. Resets at ${new Date(resetTime).toLocaleString()}`,
      attemptsRemaining: 0,
      resetTime,
    };
  }

  return {
    allowed: true,
    attemptsRemaining: config.maxTransfersPerDay - successfulTransfers,
  };
}

export function recordTransferAttempt(userAddress: string, amount: number, success: boolean): void {
  const attempts = transferAttempts.get(userAddress.toLowerCase()) || [];
  attempts.push({ timestamp: Date.now(), amount, success });
  transferAttempts.set(userAddress.toLowerCase(), attempts);
}

export function resetUserRateLimit(userAddress: string): void {
  transferAttempts.delete(userAddress.toLowerCase());
}

export function getUserTransferHistory(
  userAddress: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): TransferAttempt[] {
  const now = Date.now();
  const windowStart = now - config.windowMs;
  const attempts = transferAttempts.get(userAddress.toLowerCase()) || [];
  return attempts.filter((a) => a.timestamp > windowStart);
}

export function cleanupExpiredRateLimits(): void {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const [address, attempts] of transferAttempts.entries()) {
    const cleaned = attempts.filter((a) => a.timestamp > thirtyDaysAgo);
    if (cleaned.length === 0) {
      transferAttempts.delete(address);
    } else {
      transferAttempts.set(address, cleaned);
    }
  }
}
