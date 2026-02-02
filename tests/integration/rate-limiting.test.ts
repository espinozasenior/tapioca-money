/**
 * Rate Limiting Tests
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  checkTransferRateLimit,
  recordTransferAttempt,
  resetUserRateLimit,
  getUserTransferHistory,
} from '@/lib/rate-limiter';

describe('Transfer Rate Limiting', () => {
  const testAddress = '0xRATELIMIT_TEST_1234567890123456';

  beforeEach(() => {
    // Reset rate limits before each test
    resetUserRateLimit(testAddress);
  });

  afterEach(() => {
    resetUserRateLimit(testAddress);
  });

  test('Allow transfer when under rate limit', () => {
    const result = checkTransferRateLimit(testAddress, 10);

    expect(result.allowed).toBe(true);
    expect(result.attemptsRemaining).toBe(20); // Default max is 20
    expect(result.reason).toBeUndefined();
  });

  test('Reject transfer exceeding amount limit', () => {
    const result = checkTransferRateLimit(testAddress, 600); // Exceeds $500 limit

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Amount exceeds maximum');
    expect(result.reason).toContain('$500');
  });

  test('Track successful transfer attempts', () => {
    // Record a successful transfer
    recordTransferAttempt(testAddress, 50, true);

    const result = checkTransferRateLimit(testAddress, 10);

    expect(result.allowed).toBe(true);
    expect(result.attemptsRemaining).toBe(19); // 20 - 1 = 19
  });

  test('Failed attempts do not count against limit', () => {
    // Record failed transfers
    recordTransferAttempt(testAddress, 50, false);
    recordTransferAttempt(testAddress, 30, false);

    const result = checkTransferRateLimit(testAddress, 10);

    expect(result.allowed).toBe(true);
    expect(result.attemptsRemaining).toBe(20); // Failed attempts don't count
  });

  test('Reject transfer after reaching daily limit', () => {
    // Record 20 successful transfers (the daily limit)
    for (let i = 0; i < 20; i++) {
      recordTransferAttempt(testAddress, 10, true);
    }

    const result = checkTransferRateLimit(testAddress, 10);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Daily transfer limit');
    expect(result.reason).toContain('20');
    expect(result.attemptsRemaining).toBe(0);
    expect(result.resetTime).toBeDefined();
  });

  test('Allow transfer just under the limit', () => {
    // Record 19 successful transfers
    for (let i = 0; i < 19; i++) {
      recordTransferAttempt(testAddress, 10, true);
    }

    const result = checkTransferRateLimit(testAddress, 10);

    expect(result.allowed).toBe(true);
    expect(result.attemptsRemaining).toBe(1);
  });

  test('Get transfer history returns recent attempts', () => {
    // Record some transfers
    recordTransferAttempt(testAddress, 50, true);
    recordTransferAttempt(testAddress, 30, true);
    recordTransferAttempt(testAddress, 20, false);

    const history = getUserTransferHistory(testAddress);

    expect(history).toHaveLength(3);
    expect(history[0].amount).toBe(50);
    expect(history[0].success).toBe(true);
    expect(history[1].amount).toBe(30);
    expect(history[2].amount).toBe(20);
    expect(history[2].success).toBe(false);
  });

  test('Reset user rate limit clears history', () => {
    // Record some transfers
    recordTransferAttempt(testAddress, 100, true);
    recordTransferAttempt(testAddress, 100, true);

    // Reset
    resetUserRateLimit(testAddress);

    const result = checkTransferRateLimit(testAddress, 10);

    expect(result.allowed).toBe(true);
    expect(result.attemptsRemaining).toBe(20);
  });

  test('Rate limit applies per user address', () => {
    const user1 = '0xUSER1_234567890123456789012345678';
    const user2 = '0xUSER2_345678901234567890123456789';

    // User 1 hits limit
    for (let i = 0; i < 20; i++) {
      recordTransferAttempt(user1, 10, true);
    }

    // User 2 should still be allowed
    const result = checkTransferRateLimit(user2, 10);

    expect(result.allowed).toBe(true);
    expect(result.attemptsRemaining).toBe(20);

    // User 1 should be blocked
    const user1Result = checkTransferRateLimit(user1, 10);
    expect(user1Result.allowed).toBe(false);
  });

  test('Reset time is calculated correctly', () => {
    // Record 20 transfers to hit the limit
    for (let i = 0; i < 20; i++) {
      recordTransferAttempt(testAddress, 10, true);
    }

    const result = checkTransferRateLimit(testAddress, 10);

    expect(result.resetTime).toBeDefined();

    if (result.resetTime) {
      const resetDate = new Date(result.resetTime);
      const now = new Date();

      // Reset should be within 24 hours from now
      const hoursDiff = (resetDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      expect(hoursDiff).toBeGreaterThan(23);
      expect(hoursDiff).toBeLessThan(25);
    }
  });
});
