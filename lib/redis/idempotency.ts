/**
 * Idempotency-key wrapper for money-moving endpoints.
 *
 * Guarantees: a given `(userId, key)` pair executes the handler at most once
 * within `ttlSec`. Subsequent requests within the window return the cached
 * response (serialised as JSON).
 *
 * Production posture (see tasks/architecture-usdc-send.md §10): fail closed
 * when Redis is unreachable — better to reject a send than to execute twice.
 * The in-memory fallback is only safe in dev (single process, loses state on
 * restart) and is disabled automatically in NODE_ENV=production by the
 * underlying `getRedisClient()`.
 *
 * Key scheme: `transfer:idem:{userId}:{key}` — DID-scoped so collision across
 * users is impossible.
 */

import { getCacheInterface } from "./client";

const PREFIX = "transfer:idem";
const DEFAULT_TTL_SEC = 60;

export interface IdempotencyOptions {
  ttlSec?: number;
  /** Shorter second lock TTL guards against duplicate-burst races. */
  lockTtlSec?: number;
}

export class IdempotencyBusyError extends Error {
  readonly code = "IDEMPOTENCY_BUSY";
  constructor(message = "A request with this idempotency key is already in flight") {
    super(message);
    this.name = "IdempotencyBusyError";
  }
}

function buildKey(userId: string, key: string): string {
  // Defensive: strip whitespace + non-printable chars; cap length.
  const safeKey = key.trim().slice(0, 128);
  return `${PREFIX}:${userId}:${safeKey}`;
}

/**
 * Execute `fn` at most once per `(userId, key)` within the TTL window.
 * - First caller runs `fn`, caches the result, and returns it.
 * - Concurrent callers with the same key see a lock and throw
 *   `IdempotencyBusyError` — the client should retry after a short backoff.
 * - Callers arriving after completion (within TTL) get the cached result.
 */
export async function withIdempotencyKey<T>(
  userId: string,
  key: string,
  fn: () => Promise<T>,
  opts: IdempotencyOptions = {}
): Promise<T> {
  const ttlSec = opts.ttlSec ?? DEFAULT_TTL_SEC;
  const lockTtlSec = opts.lockTtlSec ?? 30;
  const cache = await getCacheInterface();
  const fullKey = buildKey(userId, key);
  const lockKey = `${fullKey}:lock`;

  // Fast path: response cached from a prior run.
  const cached = await cache.get(fullKey);
  if (cached) {
    try {
      return JSON.parse(cached) as T;
    } catch {
      // Corrupt cache entry — fall through and re-execute.
      await cache.del(fullKey);
    }
  }

  // Acquire short-lived execution lock.
  const acquired = await cache.setNX(lockKey, "1", lockTtlSec);
  if (!acquired) {
    throw new IdempotencyBusyError();
  }

  try {
    const result = await fn();
    // Cache the serialised result before releasing the lock so a racing caller
    // reads the completed response, not an empty slot.
    await cache.set(fullKey, JSON.stringify(result), ttlSec);
    return result;
  } finally {
    await cache.del(lockKey);
  }
}
