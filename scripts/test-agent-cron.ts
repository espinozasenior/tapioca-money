#!/usr/bin/env node

/**
 * Manual Test Script for Agent Cron
 * Usage: node scripts/test-agent-cron.ts [--simulation]
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(__dirname, '../.env') });

const SIMULATION_FLAG = process.argv.includes('--simulation');
const API_URL = process.env.API_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  console.error('❌ Error: CRON_SECRET not set in environment');
  process.exit(1);
}

// Set simulation mode if flag provided
if (SIMULATION_FLAG) {
  process.env.AGENT_SIMULATION_MODE = 'true';
  console.log('🧪 Running in SIMULATION mode');
} else {
  console.log('⚠️  Running in LIVE mode - real transactions will be executed!');
}

async function testCron() {
  console.log('\n🚀 Testing Agent Cron Endpoint...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const startTime = Date.now();

  try {
    const response = await fetch(`${API_URL}/api/agent/cron`, {
      method: 'POST',
      headers: {
        'x-cron-secret': CRON_SECRET,
        'Content-Type': 'application/json',
      },
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Cron execution failed:');
      console.error(JSON.stringify(error, null, 2));
      process.exit(1);
    }

    const result = await response.json();

    console.log('\n✅ Cron execution successful!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log('\n📊 Summary:');
    console.log(`   • Processed:  ${result.summary.processed} users`);
    console.log(`   • Rebalanced: ${result.summary.rebalanced} users`);
    console.log(`   • Skipped:    ${result.summary.skipped} users`);
    console.log(`   • Errors:     ${result.summary.errors} users`);

    if (result.summary.details && result.summary.details.length > 0) {
      console.log('\n📝 Details:');
      result.summary.details.forEach((detail: any, idx: number) => {
        const emoji = detail.action === 'rebalanced' ? '✓' :
                     detail.action === 'error' ? '✗' : '⊘';
        console.log(`\n   ${idx + 1}. ${emoji} ${detail.address}`);
        console.log(`      Action: ${detail.action}`);
        console.log(`      Reason: ${detail.reason}`);
        if (detail.apyImprovement) {
          console.log(`      APY Gain: +${(detail.apyImprovement * 100).toFixed(2)}%`);
        }
        if (detail.txHash) {
          console.log(`      Tx: ${detail.txHash}`);
        }
      });
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Test completed successfully!\n');

  } catch (error: any) {
    console.error('\n❌ Test failed with error:');
    console.error(error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run test
testCron().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
