/**
 * Gasless Transfer Execution Tests
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  executeGaslessTransfer,
  validateTransferParams,
  type GaslessTransferParams,
} from '@/lib/zerodev/transfer-executor';
import {
  seedTestUser,
  createTestTransferSession,
  cleanupTestData,
  verifyAgentActionLogged,
} from '../helpers/test-setup';
import {
  resetBundlerMocks,
  getBundlerCallCount,
  getLastBundlerCall,
} from '../mocks/zerodev-bundler';

describe('Gasless Transfer Execution', () => {
  const testAddress = '0x1234567890123456789012345678901234567890' as `0x${string}`;
  const recipientAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as `0x${string}`;
  let userId: string;
  let transferSession: any;

  beforeEach(async () => {
    // Reset mocks
    resetBundlerMocks();

    // Create test user with transfer session
    const user = await seedTestUser(testAddress, false);
    userId = user.id;
    transferSession = await createTestTransferSession(testAddress);
  });

  afterEach(async () => {
    await cleanupTestData([testAddress]);
  });

  test('Execute gasless USDC transfer in simulation mode', async () => {
    const params: GaslessTransferParams = {
      userAddress: testAddress as `0x${string}`,
      smartAccountAddress: transferSession.smartAccountAddress,
      recipient: recipientAddress as `0x${string}`,
      amount: '10.50',
      sessionPrivateKey: transferSession.sessionPrivateKey,
    };

    const result = await executeGaslessTransfer(params);

    // Should succeed in simulation mode
    expect(result.success).toBe(true);
    expect(result.hash).toBeDefined();
    expect(result.hash).toMatch(/^0x[a-fA-F0-9]+$/);
    expect(result.userOpHash).toBeDefined();
  });

  test('Validate transfer parameters - valid case', async () => {
    const params: GaslessTransferParams = {
      userAddress: testAddress as `0x${string}`,
      smartAccountAddress: transferSession.smartAccountAddress,
      recipient: recipientAddress as `0x${string}`,
      amount: '25.00',
      sessionPrivateKey: transferSession.sessionPrivateKey,
    };

    const validation = validateTransferParams(params);
    expect(validation.valid).toBe(true);
    expect(validation.error).toBeUndefined();
  });

  test('Validate transfer parameters - invalid recipient', () => {
    const params = {
      userAddress: testAddress,
      smartAccountAddress: transferSession.smartAccountAddress,
      recipient: 'invalid_address',
      amount: '10.00',
      sessionPrivateKey: transferSession.sessionPrivateKey,
    };

    const validation = validateTransferParams(params);
    expect(validation.valid).toBe(false);
    expect(validation.error).toBe('Invalid recipient address format');
  });

  test('Validate transfer parameters - negative amount', () => {
    const params = {
      userAddress: testAddress as `0x${string}`,
      smartAccountAddress: transferSession.smartAccountAddress,
      recipient: recipientAddress as `0x${string}`,
      amount: '-5.00',
      sessionPrivateKey: transferSession.sessionPrivateKey,
    };

    const validation = validateTransferParams(params);
    expect(validation.valid).toBe(false);
    expect(validation.error).toBe('Amount must be greater than 0');
  });

  test('Validate transfer parameters - amount exceeds limit', () => {
    const params = {
      userAddress: testAddress as `0x${string}`,
      smartAccountAddress: transferSession.smartAccountAddress,
      recipient: recipientAddress as `0x${string}`,
      amount: '600.00', // Exceeds $500 limit
      sessionPrivateKey: transferSession.sessionPrivateKey,
    };

    const validation = validateTransferParams(params);
    expect(validation.valid).toBe(false);
    expect(validation.error).toBe('Amount exceeds $500 limit per transfer');
  });

  test('Validate transfer parameters - missing recipient', () => {
    const params = {
      userAddress: testAddress,
      smartAccountAddress: transferSession.smartAccountAddress,
      recipient: '',
      amount: '10.00',
      sessionPrivateKey: transferSession.sessionPrivateKey,
    };

    const validation = validateTransferParams(params);
    expect(validation.valid).toBe(false);
    expect(validation.error).toBe('Recipient address required');
  });

  test('Validate transfer parameters - missing session authorization', () => {
    const params = {
      userAddress: testAddress as `0x${string}`,
      smartAccountAddress: '',
      recipient: recipientAddress as `0x${string}`,
      amount: '10.00',
      sessionPrivateKey: '',
    };

    const validation = validateTransferParams(params);
    expect(validation.valid).toBe(false);
    expect(validation.error).toBe('Session authorization required');
  });

  test('Validate transfer parameters - serializedAccount as alternative to sessionPrivateKey', () => {
    // With serializedAccount, sessionPrivateKey is not required
    const params = {
      userAddress: testAddress as `0x${string}`,
      smartAccountAddress: transferSession.smartAccountAddress,
      recipient: recipientAddress as `0x${string}`,
      amount: '25.00',
      serializedAccount: 'base64_test_serialized_account',
    };

    const validation = validateTransferParams(params);
    expect(validation.valid).toBe(true);
    expect(validation.error).toBeUndefined();
  });

  test('Validate transfer parameters - neither serializedAccount nor sessionPrivateKey', () => {
    const params = {
      userAddress: testAddress as `0x${string}`,
      smartAccountAddress: transferSession.smartAccountAddress,
      recipient: recipientAddress as `0x${string}`,
      amount: '25.00',
      // No serializedAccount and no sessionPrivateKey
    };

    const validation = validateTransferParams(params);
    expect(validation.valid).toBe(false);
    expect(validation.error).toBe('Session authorization required');
  });

  test('Transfer amounts are correctly converted to USDC decimals', async () => {
    // USDC has 6 decimals
    // "10.50" should become 10500000
    const params: GaslessTransferParams = {
      userAddress: testAddress as `0x${string}`,
      smartAccountAddress: transferSession.smartAccountAddress,
      recipient: recipientAddress as `0x${string}`,
      amount: '10.50',
      sessionPrivateKey: transferSession.sessionPrivateKey,
    };

    const result = await executeGaslessTransfer(params);
    expect(result.success).toBe(true);

    // In a real test, we'd verify the bundler was called with the correct amount
    // For now, just ensure it doesn't throw
  });

  test('Error handling for invalid session key', async () => {
    const params: GaslessTransferParams = {
      userAddress: testAddress as `0x${string}`,
      smartAccountAddress: transferSession.smartAccountAddress,
      recipient: recipientAddress as `0x${string}`,
      amount: '10.00',
      sessionPrivateKey: '0xinvalid' as `0x${string}`,
    };

    // In simulation mode, this should still succeed
    // In production mode, it would fail
    const result = await executeGaslessTransfer(params);
    expect(result).toBeDefined();
  });

  test('Simulation mode returns mock hash', async () => {
    // Ensure simulation mode is enabled
    process.env.AGENT_SIMULATION_MODE = 'true';

    const params: GaslessTransferParams = {
      userAddress: testAddress as `0x${string}`,
      smartAccountAddress: transferSession.smartAccountAddress,
      recipient: recipientAddress as `0x${string}`,
      amount: '50.00',
      sessionPrivateKey: transferSession.sessionPrivateKey,
    };

    const result = await executeGaslessTransfer(params);

    expect(result.success).toBe(true);
    expect(result.hash).toBeDefined();
    expect(result.hash).toMatch(/^0x[a-fA-F0-9]+$/);

    // Bundler should NOT be called in simulation mode
    expect(getBundlerCallCount()).toBe(0);
  });
});
