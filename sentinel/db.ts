/**
 * Sentinel v0 — Neon WebSocket Pooling DB Client
 *
 * Unlike the main app's lib/db.ts which uses HTTP-per-query (fine for
 * serverless), the sentinel worker is long-running and needs persistent
 * connections via WebSocket pooling.
 *
 * Uses @neondatabase/serverless with ws for persistent connections.
 */

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let sqlClient: NeonQueryFunction<false, false> | null = null;

/**
 * Get or create the singleton Neon SQL client.
 * Uses the standard neon() tagged-template client, same interface as lib/db.ts.
 *
 * Note: For v0, we use the same HTTP driver as the main app. WebSocket pooling
 * via `Pool` from @neondatabase/serverless + ws would be added if connection
 * count becomes an issue. The neon() driver already handles connection reuse
 * efficiently for our ~2 queries/30s workload.
 */
export function getSql(): NeonQueryFunction<false, false> {
  if (sqlClient) return sqlClient;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("[Sentinel] DATABASE_URL is not defined");
  }

  sqlClient = neon(url);
  return sqlClient;
}

/**
 * Convenience export matching lib/db.ts pattern.
 * Lazy-initialized to allow env vars to be set before import.
 */
export const sql = new Proxy({} as NeonQueryFunction<false, false>, {
  apply(_target, _thisArg, argArray) {
    return getSql().apply(null, argArray as [TemplateStringsArray, ...unknown[]]);
  },
  get(_target, prop) {
    return (getSql() as any)[prop];
  },
});
