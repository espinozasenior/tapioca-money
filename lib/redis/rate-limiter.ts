/**
 * Redis-Based Sliding Window Rate Limiter
 *
 * Uses Redis sorted sets for efficient sliding window rate limiting.
 * Benefits over in-memory:
 * - Survives restarts
 * - Cluster-safe (works across multiple instances)
 * - Built-in TTL expiry
 *
 * Algorithm: Sliding window log using sorted sets
 * - Score = timestamp (ms)
 * - Member = unique request ID
 * - Count members in window to check limit
 */

import { getCacheInterface, type CacheInterface } from './client';
import { randomUUID } from 'crypto';

export interface RateLimitConfig {
  maxRequests: number; // Maximum requests in window
  windowMs: number; // Window size in milliseconds
  keyPrefix?: string; // Redis key prefix
  failClosed?: boolean; // If true, deny requests when Redis is unavailable (default: false)
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number; // Unix timestamp when window resets
  retryAfter?: number; // Seconds until next request allowed
  reason?: string;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 20,
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  keyPrefix: 'ratelimit',
};

/**
 * Check rate limit using sliding window algorithm
 *
 * @param identifier - Unique identifier (e.g., user address)
 * @param config - Rate limit configuration
 * @returns Rate limit result
 */
export async function checkRateLimit(
  identifier: string,
  config: Partial<RateLimitConfig> = {}
): Promise<RateLimitResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const cache = await getCacheInterface();

  const now = Date.now();
  const windowStart = now - cfg.windowMs;
  const key = `${cfg.keyPrefix}:${identifier.toLowerCase()}`;

  try {
    // 1. Remove expired entries (before window start)
    await cache.zremrangebyscore(key, 0, windowStart);

    // 2. Count requests in current window
    const requests = await cache.zrangebyscore(key, windowStart, now);
    const count = requests.length;

    // 3. Check if limit exceeded
    if (count >= cfg.maxRequests) {
      // Find oldest request to calculate reset time
      const oldestTimestamp = requests.length > 0
        ? parseInt(requests[0].split(':')[0], 10)
        : now;
      const resetTime = oldestTimestamp + cfg.windowMs;
      const retryAfter = Math.ceil((resetTime - now) / 1000);

      return {
        allowed: false,
        remaining: 0,
        resetTime,
        retryAfter,
        reason: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
      };
    }

    // 4. Calculate remaining
    const remaining = cfg.maxRequests - count;

    return {
      allowed: true,
      remaining,
      resetTime: now + cfg.windowMs,
    };
  } catch (error: any) {
    console.error('[RateLimit] Error checking rate limit:', error.message);

    if (cfg.failClosed) {
      // Fail closed: deny request when Redis is unavailable
      return {
        allowed: false,
        remaining: 0,
        resetTime: now + 60_000, // Retry in 1 minute
        reason: 'Rate limiter unavailable. Request denied for safety.',
      };
    }

    // Fail open on Redis errors (allow request — default for backward compatibility)
    return {
      allowed: true,
      remaining: cfg.maxRequests,
      resetTime: now + cfg.windowMs,
    };
  }
}

/**
 * Record a request for rate limiting
 *
 * @param identifier - Unique identifier (e.g., user address)
 * @param config - Rate limit configuration
 */
export async function recordRequest(
  identifier: string,
  config: Partial<RateLimitConfig> = {}
): Promise<void> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const cache = await getCacheInterface();

  const now = Date.now();
  const key = `${cfg.keyPrefix}:${identifier.toLowerCase()}`;

  // Member format: timestamp:uuid (ensures uniqueness)
  const member = `${now}:${randomUUID()}`;

  try {
    // Add to sorted set with timestamp as score
    await cache.zadd(key, now, member);

    // Set TTL on the key (window duration + buffer)
    const ttlSeconds = Math.ceil(cfg.windowMs / 1000) + 60;
    await cache.expire(key, ttlSeconds);
  } catch (error: any) {
    console.error('[RateLimit] Error recording request:', error.message);
  }
}

/**
 * Combined check and record for rate limiting
 *
 * @param identifier - Unique identifier
 * @param config - Rate limit configuration
 * @returns Rate limit result (records if allowed)
 */
export async function checkAndRecordRateLimit(
  identifier: string,
  config: Partial<RateLimitConfig> = {}
): Promise<RateLimitResult> {
  const result = await checkRateLimit(identifier, config);

  if (result.allowed) {
    await recordRequest(identifier, config);
    result.remaining--;
  }

  return result;
}

/**
 * Reset rate limit for an identifier (admin function)
 *
 * @param identifier - Unique identifier to reset
 * @param keyPrefix - Key prefix (default: 'ratelimit')
 */
export async function resetRateLimit(
  identifier: string,
  keyPrefix: string = 'ratelimit'
): Promise<void> {
  const cache = await getCacheInterface();
  const key = `${keyPrefix}:${identifier.toLowerCase()}`;

  try {
    await cache.del(key);
  } catch (error: any) {
    console.error('[RateLimit] Error resetting rate limit:', error.message);
  }
}

/**
 * Get current usage for an identifier
 *
 * @param identifier - Unique identifier
 * @param config - Rate limit configuration
 * @returns Current count and max allowed
 */
export async function getRateLimitUsage(
  identifier: string,
  config: Partial<RateLimitConfig> = {}
): Promise<{ count: number; max: number }> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const cache = await getCacheInterface();

  const now = Date.now();
  const windowStart = now - cfg.windowMs;
  const key = `${cfg.keyPrefix}:${identifier.toLowerCase()}`;

  try {
    // Remove expired entries first
    await cache.zremrangebyscore(key, 0, windowStart);

    // Count current entries
    const count = await cache.zcard(key);

    return {
      count,
      max: cfg.maxRequests,
    };
  } catch (error: any) {
    console.error('[RateLimit] Error getting usage:', error.message);
    return { count: 0, max: cfg.maxRequests };
  }
}

// ============================================
// Transfer-specific rate limiting
// ============================================

export interface TransferRateLimitConfig {
  maxTransfersPerDay: number;
  maxAmountPerTransfer: number;
  windowMs: number;
}

const DEFAULT_TRANSFER_CONFIG: TransferRateLimitConfig = {
  maxTransfersPerDay: 20,
  maxAmountPerTransfer: 500,
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
};

/**
 * Check transfer rate limit (includes amount validation)
 *
 * @param userAddress - User's wallet address
 * @param amount - Transfer amount in USDC
 * @param config - Optional rate limit configuration
 * @returns Rate limit result with transfer-specific info
 */
export async function checkTransferRateLimitRedis(
  userAddress: string,
  amount: number,
  config: Partial<TransferRateLimitConfig> = {}
): Promise<RateLimitResult> {
  const cfg = { ...DEFAULT_TRANSFER_CONFIG, ...config };

  // Check amount limit first
  if (amount > cfg.maxAmountPerTransfer) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: Date.now(),
      reason: `Amount exceeds maximum of $${cfg.maxAmountPerTransfer} per transfer`,
    };
  }

  // Check request rate limit
  return checkRateLimit(userAddress, {
    maxRequests: cfg.maxTransfersPerDay,
    windowMs: cfg.windowMs,
    keyPrefix: 'transfer',
  });
}

/**
 * Record a transfer attempt
 *
 * @param userAddress - User's wallet address
 * @param amount - Transfer amount
 * @param success - Whether transfer succeeded
 */
export async function recordTransferAttemptRedis(
  userAddress: string,
  amount: number,
  success: boolean
): Promise<void> {
  // Only record successful transfers for rate limiting
  if (success) {
    await recordRequest(userAddress, {
      keyPrefix: 'transfer',
    });
  }

  // Also record in general transfer log (for analytics)
  const cache = await getCacheInterface();
  const logKey = `transfer:log:${userAddress.toLowerCase()}`;
  const entry = JSON.stringify({
    amount,
    success,
    timestamp: Date.now(),
  });

  try {
    await cache.zadd(logKey, Date.now(), entry);
    await cache.expire(logKey, 30 * 24 * 60 * 60); // 30 days
  } catch (error: any) {
    console.error('[RateLimit] Error logging transfer:', error.message);
  }
}
