/**
 * Diagnostic script to check user status in the database
 * Usage: pnpm tsx scripts/check-user-status.ts <wallet_address>
 */

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function checkUserStatus(walletAddress: string) {
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

  } catch (error: any) {
    console.error("❌ Error:", error.message);
    console.error(error);
  }
}

// Get wallet address from command line
const walletAddress = process.argv[2];

if (!walletAddress) {
  console.error("Usage: pnpm tsx scripts/check-user-status.ts <wallet_address>");
  process.exit(1);
}

checkUserStatus(walletAddress).then(() => process.exit(0));
