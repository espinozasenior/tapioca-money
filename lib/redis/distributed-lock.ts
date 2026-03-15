/**
 * Redis-Based Distributed Lock
 *
 * Prevents concurrent processing of the same user in the cron job.
 * Uses Redis SET with TTL for automatic expiry (prevents deadlocks on crash).
 *
 * For the in-memory fallback (no Redis), the check-then-set pattern is
 * acceptable since the fallback runs in a single process anyway.
 */

import { getCacheInterface } from "./client";
import { randomUUID } from "crypto";

const LOCK_PREFIX = "lock:rebalance";
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
 * Uses atomic SET NX EX to prevent race conditions where two workers
 * both check, see no lock, and both set (P2-3 fix).
 * Lock auto-expires after ttlSeconds to prevent deadlocks.
 */
export async function acquireUserLock(
  userAddress: string,
  ttlSeconds: number = DEFAULT_LOCK_TTL
): Promise<LockResult> {
  const cache = await getCacheInterface();
  const key = `${LOCK_PREFIX}:${userAddress.toLowerCase()}`;
  const lockId = randomUUID();

  // Atomic set-if-not-exists with TTL -- single operation, no race condition
  const acquired = await cache.setNX(key, lockId, ttlSeconds);
  if (!acquired) {
    return { acquired: false };
  }

  return { acquired: true, lockId };
}

/**
 * Release a previously acquired lock.
 * Only releases if the lockId matches (prevents releasing another process's lock).
 */
export async function releaseUserLock(userAddress: string, lockId: string): Promise<void> {
  const cache = await getCacheInterface();
  const key = `${LOCK_PREFIX}:${userAddress.toLowerCase()}`;

  // Only release if we own the lock
  const current = await cache.get(key);
  if (current === lockId) {
    await cache.del(key);
  }
}
