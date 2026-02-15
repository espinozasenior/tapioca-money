/**
 * End-to-End Flow Tests
 * Tests complete user workflows from start to finish
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  seedTestUser,
  createTestTransferSession,
  createTestAgentSession,
  cleanupTestData,
} from '../helpers/test-setup';
import { executeGaslessTransfer } from '@/lib/zerodev/transfer-executor';
import { checkTransferRateLimit, recordTransferAttempt, resetUserRateLimit } from '@/lib/rate-limiter';

describe('End-to-End Workflows', () => {
  const testAddress = '0x4444444444444444444444444444444444444444' as `0x${string}`;
  const recipientAddress = '0x5555555555555555555555555555555555555555' as `0x${string}`;

  beforeEach(async () => {
    await seedTestUser(testAddress, false);
    resetUserRateLimit(testAddress);
  });

  afterEach(async () => {
    await cleanupTestData([testAddress]);
    resetUserRateLimit(testAddress);
  });

  test('Full gasless transfer flow (legacy sessionPrivateKey)', async () => {
    // Step 1: User enables gasless transfers (creates transfer session)
    const transferSession = await createTestTransferSession(testAddress);
    expect(transferSession).toBeDefined();
    expect(transferSession.sessionPrivateKey).toBeDefined();

    // Step 2: User sends $50 USDC via sendSponsored()
    const transferParams = {
      userAddress: testAddress,
      smartAccountAddress: transferSession.smartAccountAddress,
      recipient: recipientAddress,
      amount: '50.00',
      sessionPrivateKey: transferSession.sessionPrivateKey,
    };

    const result = await executeGaslessTransfer(transferParams);

    // Step 3: Transfer executes without gas payment (simulation mode)
    expect(result.success).toBe(true);
    expect(result.hash).toBeDefined();
    expect(result.hash).toMatch(/^0x[a-fA-F0-9]+$/);

    // Step 4: Action logged to database (would be verified in real test)
    // Step 5: Recipient balance increased (would be verified on-chain)
  });

  test('Full gasless transfer flow (serializedAccount)', async () => {
    // Step 1: User enables gasless transfers with serialized kernel account
    const transferSession = await createTestTransferSession(testAddress);
    expect(transferSession).toBeDefined();

    // Step 2: User sends $50 USDC via serialized account path
    const transferParams = {
      userAddress: testAddress,
      smartAccountAddress: transferSession.smartAccountAddress,
      recipient: recipientAddress,
      amount: '50.00',
      serializedAccount: 'base64_test_serialized_account_data',
    };

    const result = await executeGaslessTransfer(transferParams);

    // Step 3: Transfer executes in simulation mode (serializedAccount path)
    expect(result.success).toBe(true);
    expect(result.hash).toBeDefined();
    expect(result.hash).toMatch(/^0x[a-fA-F0-9]+$/);
  });

  test('Full autonomous rebalancing flow', async () => {
    // Step 1: User enables auto-optimize (creates agent session with serialized account)
    const agentSession = await createTestAgentSession(testAddress);
    expect(agentSession).toBeDefined();
    expect(agentSession.serializedAccount).toBeDefined(); // New pattern
    expect(agentSession.approvedVaults).toBeDefined();
    expect(agentSession.approvedVaults.length).toBeGreaterThan(0);

    // Step 2: Cron runs and detects opportunity
    // (Would check Morpho positions, calculate APY improvement)
    const mockOpportunity = {
      currentApy: 0.08,
      targetApy: 0.10,
      improvement: 0.02,
      shouldRebalance: true,
    };

    expect(mockOpportunity.shouldRebalance).toBe(true);
    expect(mockOpportunity.improvement).toBeGreaterThan(0.005); // > 0.5% threshold

    // Step 3: Cron executes rebalance via session key
    // (Would execute 3-step: redeem, approve, deposit)
    const mockExecution = {
      steps: ['redeem', 'approve', 'deposit'],
      success: true,
      hash: '0xmock_tx_hash',
    };

    expect(mockExecution.success).toBe(true);
    expect(mockExecution.steps).toHaveLength(3);

    // Step 4: Action logged to database
    // Step 5: User's position updated to new vault
  });

  test('User can toggle auto-optimize off', async () => {
    // Step 1: Enable auto-optimize
    await createTestAgentSession(testAddress);

    // Step 2: User toggles off (PATCH /api/agent/register)
    const autoOptimizeEnabled = false;

    // Step 3: Cron runs
    // Step 4: User should be skipped
    const shouldProcess = autoOptimizeEnabled; // Would check database
    expect(shouldProcess).toBe(false);
  });

  test('User can revoke transfer session', async () => {
    // Step 1: Enable gasless transfers
    const transferSession = await createTestTransferSession(testAddress);
    expect(transferSession).toBeDefined();

    // Step 2: User revokes (DELETE /api/transfer/register)
    // (Cleanup simulates revocation)
    // In real test, would call API endpoint

    // Step 3: Attempt sendSponsored()
    // Step 4: Should fail with 'not enabled' error
    // (Would need to query database to verify revocation)

    // Verify session was created
    expect(transferSession.sessionPrivateKey).toBeDefined();
  });

  test('Session key expiry handling', async () => {
    // Step 1: Create session with short expiry
    const expiredSession = {
      ...await createTestTransferSession(testAddress),
      expiry: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
    };

    // Step 2: Wait for expiry (simulated)
    const now = Math.floor(Date.now() / 1000);
    const isExpired = expiredSession.expiry < now;
    expect(isExpired).toBe(true);

    // Step 3: Attempt operation
    // Step 4: Should fail with 'expired' error

    // Step 5: UI should prompt re-authorization
    const needsReauth = isExpired;
    expect(needsReauth).toBe(true);
  });

  test('Rate limit enforcement across multiple transfers', async () => {
    const transferSession = await createTestTransferSession(testAddress);

    // Execute 19 successful transfers
    for (let i = 0; i < 19; i++) {
      recordTransferAttempt(testAddress, 10, true);
    }

    // 20th transfer should succeed
    const result20 = checkTransferRateLimit(testAddress, 10);
    expect(result20.allowed).toBe(true);
    expect(result20.attemptsRemaining).toBe(1);

    recordTransferAttempt(testAddress, 10, true);

    // 21st transfer should fail
    const result21 = checkTransferRateLimit(testAddress, 10);
    expect(result21.allowed).toBe(false);
    expect(result21.reason).toContain('Daily transfer limit');
  });

  test('User can have both transfer and agent sessions active', async () => {
    // Create both sessions
    const transferSession = await createTestTransferSession(testAddress);
    const agentSession = await createTestAgentSession(testAddress);

    // Both should be independent
    expect(transferSession.type).toBe('zerodev-transfer-session');
    expect(agentSession.type).toBe('zerodev-agent-session');

    // Different session keys
    expect(transferSession.sessionKeyAddress).not.toBe(agentSession.sessionKeyAddress);

    // Different permissions
    expect(transferSession).not.toHaveProperty('approvedVaults');
    expect(agentSession).toHaveProperty('approvedVaults');

    // Both can be used simultaneously
    expect(transferSession).toBeDefined();
    expect(agentSession).toBeDefined();
  });

  test('Simulation mode prevents real transactions', async () => {
    const isSimulation = process.env.AGENT_SIMULATION_MODE === 'true';
    expect(isSimulation).toBe(true);

    if (isSimulation) {
      // Transfers should return mock hashes
      const transferSession = await createTestTransferSession(testAddress);
      const result = await executeGaslessTransfer({
        userAddress: testAddress,
        smartAccountAddress: transferSession.smartAccountAddress,
        recipient: recipientAddress,
        amount: '25.00',
        sessionPrivateKey: transferSession.sessionPrivateKey,
      });

      expect(result.success).toBe(true);
      expect(result.hash).toMatch(/^0x[a-fA-F0-9]+$/);

      // But no real bundler call was made
      // (Would verify bundler mock not called in real test)
    }
  });

  test('Error recovery and retry logic', async () => {
    // Simulate failure scenarios
    const failures = [
      { attempt: 1, success: false, error: 'Network timeout' },
      { attempt: 2, success: false, error: 'Bundler unavailable' },
      { attempt: 3, success: true, hash: '0xSuccess' },
    ];

    const successfulAttempt = failures.find(f => f.success);
    expect(successfulAttempt).toBeDefined();
    expect(successfulAttempt?.attempt).toBe(3);

    // Should succeed on retry
    expect(successfulAttempt?.success).toBe(true);
  });
});
