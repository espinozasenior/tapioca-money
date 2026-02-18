/**
 * Rate Limiting for Gasless Transfers
 * Prevents abuse of gasless transfer feature
 */

interface TransferAttempt {
  timestamp: number;
  amount: number;
  success: boolean;
}

// In-memory store for rate limiting (use Redis in production)
const transferAttempts = new Map<string, TransferAttempt[]>();

export interface RateLimitConfig {
  maxTransfersPerDay: number;
  maxAmountPerTransfer: number;
  windowMs: number; // Time window in milliseconds
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxTransfersPerDay: 20,
  maxAmountPerTransfer: 500,
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
};

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  attemptsRemaining?: number;
  resetTime?: number;
}

/**
 * Check if transfer is allowed under rate limits
 *
 * @param userAddress - User's wallet address
 * @param amount - Transfer amount in USDC
 * @param config - Optional rate limit configuration
 * @returns Rate limit result
 */
export function checkTransferRateLimit(
  userAddress: string,
  amount: number,
  config: RateLimitConfig = DEFAULT_CONFIG
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - config.windowMs;

  // Get user's recent transfer attempts
  const attempts = transferAttempts.get(userAddress.toLowerCase()) || [];

  // Filter to only attempts within the time window
  const recentAttempts = attempts.filter((a) => a.timestamp > windowStart);

  // Update the cache with filtered attempts
  transferAttempts.set(userAddress.toLowerCase(), recentAttempts);

  // Check amount limit
  if (amount > config.maxAmountPerTransfer) {
    return {
      allowed: false,
      reason: `Amount exceeds maximum of $${config.maxAmountPerTransfer} per transfer`,
    };
  }

  // Check daily transfer count
  const successfulTransfers = recentAttempts.filter((a) => a.success).length;

  if (successfulTransfers >= config.maxTransfersPerDay) {
    const oldestAttempt = recentAttempts.reduce(
      (oldest, a) => (a.timestamp < oldest.timestamp ? a : oldest),
      recentAttempts[0]
    );

    const resetTime = oldestAttempt.timestamp + config.windowMs;

    return {
      allowed: false,
      reason: `Daily transfer limit of ${config.maxTransfersPerDay} reached. Resets at ${new Date(resetTime).toLocaleString()}`,
      attemptsRemaining: 0,
      resetTime,
    };
  }

  // Calculate remaining attempts
  const attemptsRemaining = config.maxTransfersPerDay - successfulTransfers;

  return {
    allowed: true,
    attemptsRemaining,
  };
}

/**
 * Record a transfer attempt
 *
 * @param userAddress - User's wallet address
 * @param amount - Transfer amount in USDC
 * @param success - Whether the transfer succeeded
 */
export function recordTransferAttempt(userAddress: string, amount: number, success: boolean): void {
  const attempts = transferAttempts.get(userAddress.toLowerCase()) || [];

  attempts.push({
    timestamp: Date.now(),
    amount,
    success,
  });

  transferAttempts.set(userAddress.toLowerCase(), attempts);

  // Clean up old entries (keep last 30 days)
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const cleaned = attempts.filter((a) => a.timestamp > thirtyDaysAgo);
  transferAttempts.set(userAddress.toLowerCase(), cleaned);
}

/**
 * Reset rate limit for a user (admin function)
 *
 * @param userAddress - User's wallet address
 */
export function resetUserRateLimit(userAddress: string): void {
  transferAttempts.delete(userAddress.toLowerCase());
}

/**
 * Get user's transfer history for the current window
 *
 * @param userAddress - User's wallet address
 * @param config - Optional rate limit configuration
 * @returns Transfer attempts within the current window
 */
export function getUserTransferHistory(
  userAddress: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): TransferAttempt[] {
  const now = Date.now();
  const windowStart = now - config.windowMs;

  const attempts = transferAttempts.get(userAddress.toLowerCase()) || [];
  return attempts.filter((a) => a.timestamp > windowStart);
}

/**
 * Clean up expired rate limit data
 * Should be called periodically (e.g., via cron)
 */
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
