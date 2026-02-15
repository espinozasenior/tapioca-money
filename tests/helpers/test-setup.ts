/**
 * Test Setup Helpers for Agent Integration Tests
 */

import { neon } from '@neondatabase/serverless';

// Use test database URL or fallback to a mock connection string
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test_db';
const sql = neon(DATABASE_URL);

export interface TestUser {
  id: string;
  walletAddress: string;
  authorization: any;
}

/**
 * Create a test user with authorization
 */
export async function seedTestUser(
  walletAddress: string = '0xTEST1234567890123456789012345678901234',
  autoOptimizeEnabled: boolean = true,
  minApyThreshold: string = '0.005'
): Promise<TestUser> {
  // Sample EIP-7702 authorization
  const authorization = {
    chainId: 8453, // Base
    address: walletAddress,
    nonce: 1,
    signature: '0xtest_signature',
    expiry: Math.floor(Date.now() / 1000) + 86400, // 24 hours
  };

  // Insert user
  const users = await sql`
    INSERT INTO users (
      wallet_address,
      auto_optimize_enabled,
      agent_registered,
      authorization_7702
    ) VALUES (
      ${walletAddress},
      ${autoOptimizeEnabled},
      true,
      ${JSON.stringify(authorization)}::jsonb
    )
    RETURNING id, wallet_address
  `;

  const userId = users[0].id;

  // Insert user strategy
  await sql`
    INSERT INTO user_strategies (
      user_id,
      min_apy_gain_threshold,
      risk_level
    ) VALUES (
      ${userId},
      ${minApyThreshold},
      'medium'
    )
  `;

  return {
    id: userId,
    walletAddress,
    authorization,
  };
}

/**
 * Create test user with expired authorization
 */
export async function seedTestUserWithExpiredAuth(
  walletAddress: string = '0xEXPIRED1234567890123456789012345678901'
): Promise<TestUser> {
  const authorization = {
    chainId: 8453,
    address: walletAddress,
    nonce: 1,
    signature: '0xtest_signature',
    expiry: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
  };

  const users = await sql`
    INSERT INTO users (
      wallet_address,
      auto_optimize_enabled,
      agent_registered,
      authorization_7702
    ) VALUES (
      ${walletAddress},
      true,
      true,
      ${JSON.stringify(authorization)}::jsonb
    )
    RETURNING id, wallet_address
  `;

  await sql`
    INSERT INTO user_strategies (user_id)
    VALUES (${users[0].id})
  `;

  return {
    id: users[0].id,
    walletAddress,
    authorization,
  };
}

/**
 * Clean up test data by wallet addresses
 */
export async function cleanupTestData(walletAddresses: string[]): Promise<void> {
  if (walletAddresses.length === 0) return;

  // Delete users (cascades to user_strategies and agent_actions)
  await sql`
    DELETE FROM users
    WHERE wallet_address = ANY(${walletAddresses})
  `;

  console.log(`Cleaned up ${walletAddresses.length} test users`);
}

/**
 * Clean up all test data (use carefully!)
 */
export async function cleanupAllTestData(): Promise<void> {
  await sql`
    DELETE FROM users
    WHERE wallet_address LIKE '0xTEST%'
      OR wallet_address LIKE '0xEXPIRED%'
  `;

  console.log('Cleaned up all test data');
}

/**
 * Create test database client
 */
export function createTestClient() {
  return sql;
}

/**
 * Mock transaction API response
 */
export function mockTransactionResponse(
  success: boolean = true,
  txHash?: string
): any {
  if (success) {
    return {
      id: 'task_test_123',
      taskId: 'task_test_123',
      status: 'completed',
      transactionHash: txHash || '0xtest_tx_hash_1234567890',
      gasUsed: '200000',
    };
  } else {
    return {
      id: 'task_test_456',
      taskId: 'task_test_456',
      status: 'failed',
      error: 'Test error: Simulation failed',
    };
  }
}

/**
 * Mock yield opportunities for testing
 */
export function mockYieldOpportunities() {
  return [
    {
      id: 'morpho-vault-1',
      protocol: 'morpho' as const,
      name: 'Morpho USDC Vault',
      asset: 'USDC',
      apy: 0.08, // 8%
      tvl: BigInt('10000000000000'), // 10M USDC
      address: '0xMORPHO_VAULT_TEST' as `0x${string}`,
      riskScore: 0.2,
      liquidityDepth: BigInt('1000000000000'),
      metadata: {
        vaultAddress: '0xMORPHO_VAULT_TEST' as `0x${string}`,
        curator: 'Test Curator',
        isVault: true,
      },
    },
    {
      id: 'aave-pool-1',
      protocol: 'aave' as const,
      name: 'Aave V3 USDC',
      asset: 'USDC',
      apy: 0.05, // 5%
      tvl: BigInt('50000000000000'),
      address: '0xAAVE_POOL_TEST' as `0x${string}`,
      riskScore: 0.1,
      liquidityDepth: BigInt('5000000000000'),
    },
  ];
}

/**
 * Mock position for testing
 */
export function mockPosition(
  protocol: 'morpho' | 'aave' | 'moonwell' = 'aave',
  assets: bigint = BigInt('1000000000'), // 1000 USDC
  apy: number = 0.04 // 4%
) {
  return {
    protocol,
    vaultAddress: `0x${protocol.toUpperCase()}_VAULT` as `0x${string}`,
    shares: assets, // Simplified 1:1
    assets,
    apy,
    enteredAt: Date.now() - 86400000, // 1 day ago
  };
}

/**
 * Wait for async operations
 */
export async function waitFor(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Verify agent action was logged
 */
export async function verifyAgentActionLogged(
  userId: string,
  actionType: string = 'rebalance',
  expectedStatus?: string
): Promise<boolean> {
  const actions = await sql`
    SELECT * FROM agent_actions
    WHERE user_id = ${userId}
      AND action_type = ${actionType}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (actions.length === 0) return false;
  if (expectedStatus && actions[0].status !== expectedStatus) return false;

  return true;
}

/**
 * Get agent actions for user
 */
export async function getAgentActions(
  userId: string,
  limit: number = 10
) {
  return await sql`
    SELECT * FROM agent_actions
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}

/**
 * Create test transfer session key
 */
export async function createTestTransferSession(
  walletAddress: string
): Promise<any> {
  // Generate proper hex addresses for testing
  const smartAccount = `0x${'a'.repeat(40)}` as `0x${string}`;
  const sessionKey = `0x${'b'.repeat(40)}` as `0x${string}`;

  const transferAuth = {
    type: 'zerodev-transfer-session',
    smartAccountAddress: smartAccount,
    sessionKeyAddress: sessionKey,
    sessionPrivateKey: `0x${'1234567890abcdef'.repeat(4)}` as `0x${string}`,
    expiry: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
    createdAt: Date.now(),
  };

  await sql`
    UPDATE users
    SET transfer_authorization = ${JSON.stringify(transferAuth)}::jsonb
    WHERE wallet_address = ${walletAddress}
  `;

  return transferAuth;
}

/**
 * Create test agent session key with full permissions
 */
export async function createTestAgentSession(
  walletAddress: string
): Promise<any> {
  // Generate proper hex addresses for vaults
  const vault1 = `0x${'c'.repeat(40)}` as `0x${string}`;
  const vault2 = `0x${'d'.repeat(40)}` as `0x${string}`;

  const agentAuth = {
    type: 'zerodev-agent-session',
    smartAccountAddress: `0x${'e'.repeat(40)}` as `0x${string}`,
    sessionKeyAddress: `0x${'f'.repeat(40)}` as `0x${string}`,
    serializedAccount: `base64_test_serialized_${'a'.repeat(100)}`, // Serialized kernel account (new pattern)
    sessionPrivateKey: `0x${'fedcba0987654321'.repeat(4)}` as `0x${string}`, // Legacy field
    expiry: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
    approvedVaults: [vault1, vault2],
    timestamp: Date.now(),
  };

  await sql`
    UPDATE users
    SET authorization_7702 = ${JSON.stringify(agentAuth)}::jsonb,
        agent_registered = true
    WHERE wallet_address = ${walletAddress}
  `;

  return agentAuth;
}

/**
 * Cleanup transfer session for testing
 */
export async function cleanupTransferSession(walletAddress: string): Promise<void> {
  await sql`
    UPDATE users
    SET transfer_authorization = NULL
    WHERE wallet_address = ${walletAddress}
  `;
}

/**
 * Cleanup agent session for testing
 */
export async function cleanupAgentSession(walletAddress: string): Promise<void> {
  await sql`
    UPDATE users
    SET authorization_7702 = NULL,
        agent_registered = false
    WHERE wallet_address = ${walletAddress}
  `;
}
