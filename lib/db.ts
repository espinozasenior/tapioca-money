/**
 * Singleton Neon SQL client with startup validation.
 *
 * Centralizes DATABASE_URL validation and prevents each route from
 * creating its own `neon()` instance with an unchecked `!` assertion.
 */

import { neon } from "@neondatabase/serverless";

function createSqlClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not defined. Set it in your environment variables.");
  }
  return neon(url);
}

/**
 * Shared neon SQL tagged-template client.
 * Usage: `await sql\`SELECT * FROM users WHERE id = ${id}\``
 */
export const sql = createSqlClient();
