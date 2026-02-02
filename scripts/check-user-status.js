/**
 * Diagnostic script to check user status in the database
 * Usage: node --env-file=.env scripts/check-user-status.js <wallet_address>
 */

const { neon } = require('@neondatabase/serverless');

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set");
  console.error("Run with: node --env-file=.env scripts/check-user-status.js <wallet_address>");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function checkUserStatus(walletAddress) {
  console.log(`\nChecking status for wallet: ${walletAddress}\n`);

  try {
    // Check if user exists
    const users = await sql`
      SELECT
        id,
        wallet_address,
        auto_optimize_enabled,
        agent_registered,
        authorization_7702,
        created_at,
        updated_at
      FROM users
      WHERE wallet_address = ${walletAddress}
    `;

    if (users.length === 0) {
      console.log("❌ User not found in database");
      console.log("\n💡 Tip: Make sure you're using the correct wallet address (including 0x prefix and correct case)");
      return;
    }

    const user = users[0];
    console.log("✅ User found!");
    console.log("\nUser Details:");
    console.log("  ID:", user.id);
    console.log("  Wallet Address:", user.wallet_address);
    console.log("  Auto Optimize Enabled:", user.auto_optimize_enabled);
    console.log("  Agent Registered:", user.agent_registered);
    console.log("  Has Authorization:", user.authorization_7702 !== null);
    console.log("  Authorization Type:", typeof user.authorization_7702);
    console.log("  Created At:", user.created_at);
    console.log("  Updated At:", user.updated_at);

    if (user.authorization_7702) {
      console.log("\n  Authorization Data Preview:");
      console.log("  ", JSON.stringify(user.authorization_7702).substring(0, 200) + "...");
    } else {
      console.log("\n  ⚠️  Authorization is NULL - This is the problem!");
      console.log("  The user needs to complete the EIP-7702 authorization flow.");
    }

    // Check user strategies
    const strategies = await sql`
      SELECT *
      FROM user_strategies
      WHERE user_id = ${user.id}
    `;

    console.log("\n  User Strategies:", strategies.length > 0 ? "✅ Configured" : "⚠️  Not configured");

    // Check agent actions
    const actions = await sql`
      SELECT COUNT(*) as count
      FROM agent_actions
      WHERE user_id = ${user.id}
    `;

    console.log("  Agent Actions Count:", actions[0].count);

    // Compute expected status
    console.log("\n📊 Computed Status:");
    const hasAuthorization = user.authorization_7702 !== null;
    const autoOptimizeEnabled = user.auto_optimize_enabled;
    const isRegistered = hasAuthorization && autoOptimizeEnabled;

    console.log("  hasAuthorization:", hasAuthorization);
    console.log("  autoOptimizeEnabled:", autoOptimizeEnabled);
    console.log("  isRegistered:", isRegistered);
    console.log("  status:", isRegistered ? "active" : "inactive");

    console.log("\n🔍 Diagnosis:");
    if (!hasAuthorization) {
      console.log("  ❌ Missing EIP-7702 authorization");
      console.log("  → The toggle will trigger the registration flow");
      console.log("  → You need a wallet provider that supports EIP-7702");
    } else if (!autoOptimizeEnabled) {
      console.log("  ✅ Authorized but auto-optimize is disabled");
      console.log("  → The toggle should enable/disable auto-optimize");
    } else {
      console.log("  ✅ Fully registered and active");
      console.log("  → The toggle should enable/disable auto-optimize");
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
    if (error.message.includes('relation "users" does not exist')) {
      console.error("\n💡 The users table doesn't exist. Run the schema.sql file first:");
      console.error("   psql $DATABASE_URL -f lib/yield-optimizer/db/schema.sql");
    } else if (error.message.includes('column "authorization_7702" does not exist')) {
      console.error("\n💡 The authorization_7702 column is missing. Run the migration:");
      console.error("   psql $DATABASE_URL -f lib/yield-optimizer/db/migrate-add-authorization.sql");
    }
    console.error(error);
  }
}

// Get wallet address from command line
const walletAddress = process.argv[2];

if (!walletAddress) {
  console.error("Usage: node scripts/check-user-status.js <wallet_address>");
  console.error("Example: node scripts/check-user-status.js 0x1234...5678");
  process.exit(1);
}

checkUserStatus(walletAddress).then(() => process.exit(0));
