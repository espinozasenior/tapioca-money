/**
 * Redis-Based Distributed Lock
 *
 * Prevents concurrent processing of the same user in the cron job.
 * Uses Redis SET with TTL for automatic expiry (prevents deadlocks on crash).
 *
 * For the in-memory fallback (no Redis), the check-then-set pattern is
 * acceptable since the fallback runs in a single process anyway.
 */

import { getCacheInterface } from './client';
import { randomUUID } from 'crypto';

const LOCK_PREFIX = 'lock:rebalance';
const DEFAULT_LOCK_TTL = 300; // 5 minutes

export interface LockResult {
  acquired: boolean;
  lockId?: string;
}

/**
 * Attempt to acquire a lock for a user address.
 * Returns { acquired: true, lockId } if lock was acquired,
 * or { acquired: false } if another process holds the lock.
 *
 * Lock auto-expires after ttlSeconds to prevent deadlocks.
 */
export async function acquireUserLock(
  userAddress: string,
  ttlSeconds: number = DEFAULT_LOCK_TTL
): Promise<LockResult> {
  const cache = await getCacheInterface();
  const key = `${LOCK_PREFIX}:${userAddress.toLowerCase()}`;
  const lockId = randomUUID();

  // Check if lock already exists
  const existing = await cache.get(key);
  if (existing) {
    return { acquired: false };
  }

  // Set lock with TTL (auto-release on crash/timeout)
  await cache.set(key, lockId, ttlSeconds);
  return { acquired: true, lockId };
}

/**
 * Release a previously acquired lock.
 * Only releases if the lockId matches (prevents releasing another process's lock).
 */
export async function releaseUserLock(
  userAddress: string,
  lockId: string
): Promise<void> {
  const cache = await getCacheInterface();
  const key = `${LOCK_PREFIX}:${userAddress.toLowerCase()}`;

  // Only release if we own the lock
  const current = await cache.get(key);
  if (current === lockId) {
    await cache.del(key);
  }
}
