/**
 * One-shot bootstrap for production DB's drizzle migration tracking.
 *
 * Problem: production was initialized with `drizzle-kit push` (no tracking
 * table), so `drizzle-kit migrate` wants to re-apply migrations 0000-0004
 * that are already live. This script creates `drizzle.__drizzle_migrations`
 * and marks the already-applied migrations as tracked, letting CI's
 * `db:migrate` pick up only the new ones (0005, 0006).
 *
 * Usage (run once against prod):
 *   DATABASE_URL="<neon prod url>" pnpm tsx scripts/bootstrap-drizzle-migrations.ts
 *
 * Idempotent: safe to re-run. Only inserts rows not already present (by hash).
 *
 * If a new migration arrives later and you need to extend this list,
 * update ALREADY_APPLIED, rerun. Still idempotent.
 */

import { neon } from "@neondatabase/serverless";
import * as crypto from "node:crypto";
import * as fs from "node:fs";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL env var is required");
  process.exit(1);
}

/**
 * Migrations that have already been applied to the target DB (via push or
 * manual SQL). The script will mark these as tracked, WITHOUT re-executing
 * their SQL. Everything after this list runs normally through migrate.
 */
const ALREADY_APPLIED = [
  "0000_ordinary_goblin_queen",
  "0001_add_transfer_authorization",
  "0002_bitter_dracula",
  "0003_wise_shadow_king",
  "0004_sentinel_tables",
] as const;

async function main() {
  const sql = neon(DATABASE_URL!);

  const journalRaw = fs.readFileSync("drizzle/meta/_journal.json", "utf8");
  const journal = JSON.parse(journalRaw) as {
    entries: Array<{ idx: number; tag: string; when: number }>;
  };

  console.log("Ensuring drizzle schema + migrations table exist...");
  await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await sql`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at bigint
  )`;

  let inserted = 0;
  let skipped = 0;

  for (const tag of ALREADY_APPLIED) {
    const entry = journal.entries.find((e) => e.tag === tag);
    if (!entry) {
      console.error(`  ! ${tag} not in journal — skipping`);
      continue;
    }

    const filePath = `drizzle/${tag}.sql`;
    if (!fs.existsSync(filePath)) {
      console.error(`  ! ${filePath} missing — skipping`);
      continue;
    }

    const content = fs.readFileSync(filePath, "utf8");
    const hash = crypto.createHash("sha256").update(content).digest("hex");

    const existing = await sql`
      SELECT id FROM drizzle.__drizzle_migrations WHERE hash = ${hash} LIMIT 1
    `;

    if (existing.length > 0) {
      console.log(`  ✓ ${tag} already tracked (hash ${hash.slice(0, 12)}...)`);
      skipped++;
      continue;
    }

    await sql`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${hash}, ${entry.when})
    `;
    console.log(`  + ${tag} marked as applied (when=${entry.when})`);
    inserted++;
  }

  console.log(`\nDone. Inserted ${inserted}, already-tracked ${skipped}.`);
  console.log(
    "Now CI's db:migrate will apply anything newer than 0004 — currently 0005 + 0006."
  );
}

main().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});
