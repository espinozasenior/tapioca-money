/**
 * Session Key Revocation via Redis Blacklist
 *
 * Provides immediate revocation of session keys before their on-chain expiry.
 * When a user revokes their session key, we add it to a Redis blacklist.
 * The cron job checks this blacklist before executing any UserOps.
 *
 * TTL matches SESSION_KEY_EXPIRY_DAYS (7 days) — entries auto-expire
 * once the session key would have expired anyway.
 */

import { getCacheInterface } from '@/lib/redis/client';

const REVOCATION_PREFIX = 'session:revoked';
const REVOCATION_TTL = 7 * 24 * 60 * 60; // 7 days (matches session key lifetime)

/**
 * Add a session key address to the revocation blacklist.
 * Called when a user explicitly revokes their session key.
 */
export async function revokeSession(sessionKeyAddress: string): Promise<void> {
  const cache = await getCacheInterface();
  const key = `${REVOCATION_PREFIX}:${sessionKeyAddress.toLowerCase()}`;
  await cache.set(key, Date.now().toString(), REVOCATION_TTL);
  console.log('[SessionRevocation] Session key revoked:', sessionKeyAddress);
}

/**
 * Check if a session key has been revoked.
 * Returns true if the key is in the blacklist.
 */
export async function isSessionRevoked(sessionKeyAddress: string): Promise<boolean> {
  const cache = await getCacheInterface();
  const key = `${REVOCATION_PREFIX}:${sessionKeyAddress.toLowerCase()}`;
  const value = await cache.get(key);
  return value !== null;
}
