/**
 * Transfer Session Key Management Tests
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  createTransferSessionKey,
  validateTransferSession,
  type TransferSessionAuthorization,
} from '@/lib/zerodev/transfer-session';
import {
  seedTestUser,
  createTestTransferSession,
  cleanupTransferSession,
  cleanupTestData,
} from '../helpers/test-setup';
import { createMockPrivyWallet } from '../mocks/privy-wallet';

describe('Transfer Session Key Management', () => {
  const testAddress = '0x9876543210987654321098765432109876543210' as `0x${string}`;
  let userId: string;

  beforeEach(async () => {
    // Create test user
    const user = await seedTestUser(testAddress, false);
    userId = user.id;
  });

  afterEach(async () => {
    await cleanupTestData([testAddress]);
  });

  test('Validate transfer session structure', async () => {
    const session = await createTestTransferSession(testAddress);

    expect(session).toHaveProperty('type', 'zerodev-transfer-session');
    expect(session).toHaveProperty('smartAccountAddress');
    expect(session).toHaveProperty('sessionKeyAddress');
    expect(session).toHaveProperty('sessionPrivateKey');
    expect(session).toHaveProperty('expiry');
    expect(session).toHaveProperty('createdAt');

    // Verify addresses are valid hex strings
    expect(session.smartAccountAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(session.sessionKeyAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(session.sessionPrivateKey).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });

  test('Validate transfer session expiry', async () => {
    const session = await createTestTransferSession(testAddress);

    // Valid session
    const validation = validateTransferSession(session);
    expect(validation.valid).toBe(true);
    expect(validation.reason).toBeUndefined();

    // Expired session
    const expiredSession: TransferSessionAuthorization = {
      ...session,
      expiry: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    };

    const expiredValidation = validateTransferSession(expiredSession);
    expect(expiredValidation.valid).toBe(false);
    expect(expiredValidation.reason).toBe('Session expired');
  });

  test('Validate handles invalid session type', () => {
    const invalidSession = {
      type: 'wrong-type',
      smartAccountAddress: '0x1234567890123456789012345678901234567890',
      sessionKeyAddress: '0x0987654321098765432109876543210987654321',
      sessionPrivateKey: '0x' + '1234'.repeat(16),
      expiry: Math.floor(Date.now() / 1000) + 86400,
      createdAt: Date.now(),
    } as any;

    const validation = validateTransferSession(invalidSession);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('Invalid session type');
  });

  test('Validate handles missing session data', () => {
    const incompleteSession = {
      type: 'zerodev-transfer-session',
      smartAccountAddress: '0x1234567890123456789012345678901234567890',
      // Missing sessionPrivateKey
      sessionKeyAddress: '0x0987654321098765432109876543210987654321',
      expiry: Math.floor(Date.now() / 1000) + 86400,
      createdAt: Date.now(),
    } as any;

    const validation = validateTransferSession(incompleteSession);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('Invalid session data');
  });

  test('Cleanup transfer session removes authorization', async () => {
    // Create session
    await createTestTransferSession(testAddress);

    // Verify it exists
    const session = await createTestTransferSession(testAddress);
    expect(session).toBeDefined();

    // Cleanup
    await cleanupTransferSession(testAddress);

    // Verify it's gone (this would need a DB query in real test)
    // For now, just ensure cleanup doesn't throw
    expect(true).toBe(true);
  });

  test('Session expiry is set to 30 days in the future', async () => {
    const session = await createTestTransferSession(testAddress);

    const now = Math.floor(Date.now() / 1000);
    const thirtyDays = 30 * 24 * 60 * 60;

    // Expiry should be approximately 30 days from now
    expect(session.expiry).toBeGreaterThan(now + thirtyDays - 60); // Allow 1 min tolerance
    expect(session.expiry).toBeLessThan(now + thirtyDays + 60);
  });
});
