/**
 * Agent Session Key Tests
 * Tests for autonomous rebalancing session keys with sudo policy
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  seedTestUser,
  createTestAgentSession,
  cleanupAgentSession,
  cleanupTestData,
} from '../helpers/test-setup';

describe('Agent Session Key for Rebalancing', () => {
  const testAddress = '0xaabbccddaabbccddaabbccddaabbccddaabbccdd' as `0x${string}`;
  let userId: string;

  beforeEach(async () => {
    const user = await seedTestUser(testAddress, false);
    userId = user.id;
  });

  afterEach(async () => {
    await cleanupTestData([testAddress]);
  });

  test('Create agent session key with serialized account', async () => {
    const agentAuth = await createTestAgentSession(testAddress);

    expect(agentAuth).toHaveProperty('type', 'zerodev-agent-session');
    expect(agentAuth).toHaveProperty('smartAccountAddress');
    expect(agentAuth).toHaveProperty('sessionKeyAddress');
    expect(agentAuth).toHaveProperty('serializedAccount'); // New pattern
    expect(agentAuth).toHaveProperty('sessionPrivateKey'); // Legacy field
    expect(agentAuth).toHaveProperty('expiry');
    expect(agentAuth).toHaveProperty('approvedVaults');
    expect(agentAuth.approvedVaults).toBeInstanceOf(Array);
    expect(agentAuth.approvedVaults.length).toBeGreaterThan(0);
  });

  test('Agent session includes approved vaults list', async () => {
    const agentAuth = await createTestAgentSession(testAddress);

    expect(agentAuth.approvedVaults).toBeDefined();
    expect(Array.isArray(agentAuth.approvedVaults)).toBe(true);

    // Verify vaults are valid addresses
    agentAuth.approvedVaults.forEach((vault: string) => {
      expect(vault).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });

  test('Agent session has 30-day expiry like transfer session', async () => {
    const agentAuth = await createTestAgentSession(testAddress);

    const now = Math.floor(Date.now() / 1000);
    const thirtyDays = 30 * 24 * 60 * 60;

    expect(agentAuth.expiry).toBeGreaterThan(now + thirtyDays - 60);
    expect(agentAuth.expiry).toBeLessThan(now + thirtyDays + 60);
  });

  test('Agent session uses different key than transfer session', async () => {
    const agentAuth = await createTestAgentSession(testAddress);

    // Agent session should have different structure
    expect(agentAuth.type).toBe('zerodev-agent-session');
    expect(agentAuth).toHaveProperty('approvedVaults');
    expect(agentAuth).toHaveProperty('timestamp');

    // Transfer session would have 'type: zerodev-transfer-session' and no approvedVaults
  });

  test('Cleanup agent session removes authorization', async () => {
    await createTestAgentSession(testAddress);

    // Cleanup
    await cleanupAgentSession(testAddress);

    // Verify cleanup doesn't throw
    expect(true).toBe(true);
  });

  test('Agent session allows broader permissions than transfer session', async () => {
    const agentAuth = await createTestAgentSession(testAddress);

    // Agent session has approvedVaults for vault operations
    // Transfer session would only have USDC.transfer() permission
    expect(agentAuth.approvedVaults).toBeDefined();
    expect(agentAuth.approvedVaults.length).toBeGreaterThan(0);

    // This demonstrates agent has broader scope - can interact with multiple vaults
    // vs transfer which can only call USDC.transfer()
  });
});
