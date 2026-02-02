/**
 * Migration Script: Encrypt Session Private Keys
 *
 * Encrypts all plaintext sessionPrivateKey fields in:
 * - authorization_7702 (agent session keys)
 * - transfer_authorization (transfer session keys)
 *
 * Usage:
 *   pnpm tsx scripts/migrate-encrypt-keys.ts --dry-run    # Preview changes
 *   pnpm tsx scripts/migrate-encrypt-keys.ts --execute    # Run migration
 *   pnpm tsx scripts/migrate-encrypt-keys.ts --rollback   # Decrypt all keys
 */

import { neon } from '@neondatabase/serverless';
import {
  encryptAuthorization,
  decryptAuthorization,
  isAuthorizationEncrypted,
  type Authorization,
} from '../lib/security/session-encryption';

const sql = neon(process.env.DATABASE_URL!);

interface MigrationStats {
  totalUsers: number;
  agentKeysEncrypted: number;
  transferKeysEncrypted: number;
  alreadyEncrypted: number;
  errors: number;
  errorDetails: Array<{ address: string; error: string }>;
}

interface User {
  id: string;
  wallet_address: string;
  authorization_7702: Authorization | null;
  transfer_authorization: Authorization | null;
}

const BATCH_SIZE = 100;

/**
 * Main migration function
 */
async function migrate(mode: 'dry-run' | 'execute' | 'rollback') {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Session Key Encryption Migration - ${mode.toUpperCase()}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  if (mode === 'dry-run') {
    console.log('⚠️  DRY RUN MODE - No database changes will be made\n');
  } else if (mode === 'rollback') {
    console.log('⚠️  ROLLBACK MODE - Will decrypt all encrypted keys\n');
    const confirm = process.env.CONFIRM_ROLLBACK;
    if (confirm !== 'yes') {
      console.error('❌ Rollback requires CONFIRM_ROLLBACK=yes environment variable');
      process.exit(1);
    }
  } else {
    console.log('🚀 EXECUTE MODE - Database will be modified\n');
  }

  const stats: MigrationStats = {
    totalUsers: 0,
    agentKeysEncrypted: 0,
    transferKeysEncrypted: 0,
    alreadyEncrypted: 0,
    errors: 0,
    errorDetails: [],
  };

  try {
    // 1. Query all users with session keys
    console.log('📊 Querying users with session keys...');
    const users = await sql`
      SELECT
        id,
        wallet_address,
        authorization_7702,
        transfer_authorization
      FROM users
      WHERE authorization_7702 IS NOT NULL
         OR transfer_authorization IS NOT NULL
      ORDER BY id
    ` as User[];

    console.log(`✓ Found ${users.length} users with session keys\n`);
    stats.totalUsers = users.length;

    if (users.length === 0) {
      console.log('No users to process. Exiting.');
      return;
    }

    // 2. Process users in batches
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(users.length / BATCH_SIZE);

      console.log(`\n📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} users)`);
      console.log(`─────────────────────────────────────────────────`);

      for (const user of batch) {
        try {
          await processUser(user, mode, stats);
        } catch (error: any) {
          stats.errors++;
          stats.errorDetails.push({
            address: user.wallet_address,
            error: error.message || 'Unknown error',
          });
          console.error(`  ✗ ${user.wallet_address}: ${error.message}`);
        }
      }
    }

    // 3. Print summary
    printSummary(stats, mode);

  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Process a single user
 */
async function processUser(
  user: User,
  mode: 'dry-run' | 'execute' | 'rollback',
  stats: MigrationStats
): Promise<void> {
  let updated = false;
  let agentAuth = user.authorization_7702;
  let transferAuth = user.transfer_authorization;

  // Process agent authorization
  if (agentAuth) {
    if (mode === 'rollback') {
      // Decrypt if encrypted
      if (isAuthorizationEncrypted(agentAuth)) {
        agentAuth = decryptAuthorization(agentAuth);
        stats.agentKeysEncrypted++;
        updated = true;
        console.log(`  ↓ ${user.wallet_address}: Decrypted agent key`);
      }
    } else {
      // Encrypt if not already encrypted
      if (!isAuthorizationEncrypted(agentAuth)) {
        agentAuth = encryptAuthorization(agentAuth);
        stats.agentKeysEncrypted++;
        updated = true;
        console.log(`  ↑ ${user.wallet_address}: Encrypted agent key`);
      } else {
        stats.alreadyEncrypted++;
      }
    }
  }

  // Process transfer authorization
  if (transferAuth) {
    if (mode === 'rollback') {
      // Decrypt if encrypted
      if (isAuthorizationEncrypted(transferAuth)) {
        transferAuth = decryptAuthorization(transferAuth);
        stats.transferKeysEncrypted++;
        updated = true;
        console.log(`  ↓ ${user.wallet_address}: Decrypted transfer key`);
      }
    } else {
      // Encrypt if not already encrypted
      if (!isAuthorizationEncrypted(transferAuth)) {
        transferAuth = encryptAuthorization(transferAuth);
        stats.transferKeysEncrypted++;
        updated = true;
        console.log(`  ↑ ${user.wallet_address}: Encrypted transfer key`);
      } else {
        stats.alreadyEncrypted++;
      }
    }
  }

  // Update database if needed (and not dry-run)
  if (updated && mode === 'execute') {
    await sql`
      UPDATE users
      SET
        authorization_7702 = ${agentAuth ? JSON.stringify(agentAuth) : null},
        transfer_authorization = ${transferAuth ? JSON.stringify(transferAuth) : null},
        updated_at = NOW()
      WHERE id = ${user.id}
    `;
  } else if (updated && mode === 'rollback') {
    await sql`
      UPDATE users
      SET
        authorization_7702 = ${agentAuth ? JSON.stringify(agentAuth) : null},
        transfer_authorization = ${transferAuth ? JSON.stringify(transferAuth) : null},
        updated_at = NOW()
      WHERE id = ${user.id}
    `;
  }
}

/**
 * Print migration summary
 */
function printSummary(stats: MigrationStats, mode: 'dry-run' | 'execute' | 'rollback') {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Migration Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`Total users processed:     ${stats.totalUsers}`);
  console.log(`Agent keys processed:      ${stats.agentKeysEncrypted}`);
  console.log(`Transfer keys processed:   ${stats.transferKeysEncrypted}`);
  console.log(`Already encrypted:         ${stats.alreadyEncrypted}`);
  console.log(`Errors:                    ${stats.errors}`);

  if (stats.errorDetails.length > 0) {
    console.log('\n❌ Errors:');
    stats.errorDetails.forEach(({ address, error }) => {
      console.log(`  - ${address}: ${error}`);
    });
  }

  if (mode === 'dry-run') {
    console.log('\n⚠️  Dry run complete - no changes made');
    console.log('   Run with --execute to apply changes');
  } else if (mode === 'rollback') {
    console.log('\n✓ Rollback complete - keys decrypted');
  } else {
    console.log('\n✓ Migration complete - keys encrypted');
  }
}

/**
 * Verify encryption key is set
 */
function verifyEncryptionKey() {
  if (!process.env.DATABASE_ENCRYPTION_KEY) {
    console.error('❌ DATABASE_ENCRYPTION_KEY environment variable not set');
    console.error('\nGenerate a key with:');
    console.error('  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
  }

  if (process.env.DATABASE_ENCRYPTION_KEY.length !== 64) {
    console.error('❌ DATABASE_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    process.exit(1);
  }
}

/**
 * Main entry point
 */
async function main() {
  // Verify encryption key
  verifyEncryptionKey();

  // Parse command line arguments
  const args = process.argv.slice(2);
  const mode = args[0];

  if (!mode || !['--dry-run', '--execute', '--rollback'].includes(mode)) {
    console.error('Usage:');
    console.error('  pnpm tsx scripts/migrate-encrypt-keys.ts --dry-run    # Preview changes');
    console.error('  pnpm tsx scripts/migrate-encrypt-keys.ts --execute    # Run migration');
    console.error('  CONFIRM_ROLLBACK=yes pnpm tsx scripts/migrate-encrypt-keys.ts --rollback   # Decrypt keys');
    process.exit(1);
  }

  const modeValue = mode.replace('--', '') as 'dry-run' | 'execute' | 'rollback';
  await migrate(modeValue);
}

// Run migration
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
