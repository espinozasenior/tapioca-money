/**
 * Check if the database schema has all required columns
 * Usage: node --env-file=.env scripts/check-schema.js
 */

const { neon } = require('@neondatabase/serverless');

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set");
  console.error("Run with: node --env-file=.env scripts/check-schema.js");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function checkSchema() {
  console.log("\n🔍 Checking database schema...\n");

  try {
    // Check if users table exists and has all required columns
    const columns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `;

    if (columns.length === 0) {
      console.log("❌ Users table does not exist!");
      console.log("\n💡 Create the table by running:");
      console.log("   psql $DATABASE_URL -f lib/yield-optimizer/db/schema.sql");
      return;
    }

    console.log("✅ Users table exists\n");
    console.log("Columns:");
    columns.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}${col.is_nullable === 'YES' ? ' (nullable)' : ''}`);
    });

    // Check for required columns
    const requiredColumns = [
      'id',
      'wallet_address',
      'auto_optimize_enabled',
      'agent_registered',
      'authorization_7702',
      'created_at',
      'updated_at'
    ];

    console.log("\n📋 Required columns check:");
    let allPresent = true;
    requiredColumns.forEach(col => {
      const found = columns.find(c => c.column_name === col);
      if (found) {
        console.log(`  ✅ ${col}`);
      } else {
        console.log(`  ❌ ${col} - MISSING!`);
        allPresent = false;
      }
    });

    if (!allPresent) {
      console.log("\n⚠️  Some columns are missing!");
      console.log("💡 Run the migration to add missing columns:");
      console.log("   psql $DATABASE_URL -f lib/yield-optimizer/db/migrate-add-authorization.sql");
    } else {
      console.log("\n✅ All required columns are present!");
    }

    // Check if there are any users
    const userCount = await sql`SELECT COUNT(*) as count FROM users`;
    console.log(`\n👥 Total users in database: ${userCount[0].count}`);

    if (userCount[0].count > 0) {
      // Check how many have authorization
      const withAuth = await sql`
        SELECT COUNT(*) as count
        FROM users
        WHERE authorization_7702 IS NOT NULL
      `;
      console.log(`   - With authorization: ${withAuth[0].count}`);
      console.log(`   - Without authorization: ${userCount[0].count - withAuth[0].count}`);
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error);
  }
}

checkSchema().then(() => process.exit(0));
