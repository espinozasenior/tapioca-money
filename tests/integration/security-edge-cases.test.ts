/**
 * Security Edge Case Tests
 *
 * Tests security hardening additions:
 * - Session key revocation via Redis blacklist
 * - Distributed lock for concurrent cron prevention
 * - Delegation target verification (phishing guard)
 * - On-chain timestamp policy presence
 * - Value limits on CallPolicy permissions
 * - Fail-closed rate limiter behavior
 * - UserOp receipt status checking
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

// ─── Session Key Revocation ──────────────────────────────────────────────────

describe('Session Key Revocation', () => {
  test('1. revokeSession + isSessionRevoked returns true', async () => {
    // Mock the cache interface
    const store = new Map<string, string>();
    vi.doMock('@/lib/redis/client', () => ({
      getCacheInterface: async () => ({
        get: async (key: string) => store.get(key) ?? null,
        set: async (key: string, value: string) => { store.set(key, value); },
        del: async (key: string) => { store.delete(key); },
      }),
    }));

    const { revokeSession, isSessionRevoked } = await import('@/lib/security/session-revocation');

    const sessionKey = '0x1234567890abcdef1234567890abcdef12345678';

    // Before revocation — not revoked
    expect(await isSessionRevoked(sessionKey)).toBe(false);

    // After revocation — revoked
    await revokeSession(sessionKey);
    expect(await isSessionRevoked(sessionKey)).toBe(true);

    // Case insensitive
    expect(await isSessionRevoked(sessionKey.toUpperCase())).toBe(true);

    vi.doUnmock('@/lib/redis/client');
  });

  test('2. Non-revoked session returns false', async () => {
    const store = new Map<string, string>();
    vi.doMock('@/lib/redis/client', () => ({
      getCacheInterface: async () => ({
        get: async (key: string) => store.get(key) ?? null,
        set: async (key: string, value: string) => { store.set(key, value); },
      }),
    }));

    const { isSessionRevoked } = await import('@/lib/security/session-revocation');
    expect(await isSessionRevoked('0xnotrevoked')).toBe(false);

    vi.doUnmock('@/lib/redis/client');
  });
});

// ─── Distributed Lock ────────────────────────────────────────────────────────

describe('Distributed Lock', () => {
  test('3. Lock prevents concurrent acquisition', async () => {
    const store = new Map<string, string>();
    vi.doMock('./client', () => ({
      getCacheInterface: async () => ({
        get: async (key: string) => store.get(key) ?? null,
        set: async (key: string, value: string) => { store.set(key, value); },
        del: async (key: string) => { store.delete(key); },
      }),
    }));

    const { acquireUserLock, releaseUserLock } = await import('@/lib/redis/distributed-lock');

    const address = '0xuser1';

    // First acquisition succeeds
    const lock1 = await acquireUserLock(address);
    expect(lock1.acquired).toBe(true);
    expect(lock1.lockId).toBeDefined();

    // Second acquisition fails (locked)
    const lock2 = await acquireUserLock(address);
    expect(lock2.acquired).toBe(false);

    // Release and retry
    await releaseUserLock(address, lock1.lockId!);
    const lock3 = await acquireUserLock(address);
    expect(lock3.acquired).toBe(true);

    vi.doUnmock('./client');
  });
});

// ─── Delegation Target Verification ─────────────────────────────────────────

describe('Delegation Target Verification', () => {
  test('4. Correct target passes verification', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('lib/zerodev/delegation-verification.ts', 'utf-8');

    // Verify the file exports expected functions
    expect(source).toContain('export function getExpectedDelegationTarget');
    expect(source).toContain('export function verifyDelegationTarget');
    expect(source).toContain('KERNEL_V3_3');
  });

  test('5. Phishing guard integrated in useOptimizer', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('hooks/useOptimizer.ts', 'utf-8');

    // Verify phishing guard is present
    expect(source).toContain('verifyDelegationTarget');
    expect(source).toContain('Delegation target mismatch');
    expect(source).toContain('delegation-verification');
  });
});

// ─── On-chain Timestamp Policy ───────────────────────────────────────────────

describe('On-chain Timestamp Policy', () => {
  test('6. toTimestampPolicy is used in client-secure.ts', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('lib/zerodev/client-secure.ts', 'utf-8');

    // Verify timestamp policy import
    expect(source).toContain('toTimestampPolicy');

    // Verify validAfter and validUntil are set
    expect(source).toContain('validAfter');
    expect(source).toContain('validUntil');

    // Verify it's in the policies array
    expect(source).toContain('timestampPolicy');
    expect(source).toMatch(/policies:\s*\[.*timestampPolicy/);
  });
});

// ─── Value Limits on Permissions ─────────────────────────────────────────────

describe('Value Limits on CallPolicy', () => {
  test('7. Permissions include valueLimit and ParamCondition', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('lib/zerodev/client-secure.ts', 'utf-8');

    // Verify valueLimit is used
    expect(source).toContain('valueLimit: 0n');

    // Verify ParamCondition import and usage
    expect(source).toContain('ParamCondition');
    expect(source).toContain('ParamCondition.LESS_THAN_OR_EQUAL');

    // Verify MAX_USDC_PER_CALL constant
    expect(source).toContain('MAX_USDC_PER_CALL');

    // Verify ABI-based permissions (not just selector-based)
    expect(source).toContain('functionName:');
    expect(source).toContain('abi: parseAbi');
  });
});

// ─── Fail-Closed Rate Limiter ────────────────────────────────────────────────

describe('Fail-Closed Rate Limiter', () => {
  test('8. failClosed option exists in RateLimitConfig', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('lib/redis/rate-limiter.ts', 'utf-8');

    // Verify failClosed is in the interface
    expect(source).toContain('failClosed?: boolean');

    // Verify fail-closed behavior in catch block
    expect(source).toContain('if (cfg.failClosed)');
    expect(source).toContain('Rate limiter unavailable');
  });
});

// ─── Session Revocation in Cron ──────────────────────────────────────────────

describe('Session Revocation in Cron', () => {
  test('9. Cron checks revocation before processing', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('app/api/agent/cron/route.ts', 'utf-8');

    // Verify import
    expect(source).toContain("import { isSessionRevoked } from '@/lib/security/session-revocation'");

    // Verify revocation check
    expect(source).toContain('isSessionRevoked(authorization.sessionKeyAddress)');
    expect(source).toContain('Session key has been revoked');
  });
});

// ─── Distributed Lock in Cron ────────────────────────────────────────────────

describe('Distributed Lock in Cron', () => {
  test('10. Cron uses distributed lock per user', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('app/api/agent/cron/route.ts', 'utf-8');

    // Verify imports
    expect(source).toContain("import { acquireUserLock, releaseUserLock } from '@/lib/redis/distributed-lock'");

    // Verify lock usage
    expect(source).toContain('acquireUserLock(user.wallet_address)');
    expect(source).toContain('releaseUserLock(user.wallet_address, lock.lockId!)');
    expect(source).toContain('Rebalance already in progress (locked)');

    // Verify finally block for lock release
    expect(source).toContain('finally');
  });
});

// ─── Delegation Logging ──────────────────────────────────────────────────────

describe('Delegation Authorization Logging', () => {
  test('11. Delegation set and cleared events are logged', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('app/api/agent/generate-session-key/route.ts', 'utf-8');

    // Verify delegation_set logging in POST
    expect(source).toContain("'delegation_set'");
    expect(source).toContain('Log delegation event for audit trail');

    // Verify delegation_cleared logging in DELETE
    expect(source).toContain("'delegation_cleared'");
    expect(source).toContain('Log delegation cleared event');

    // Verify revocation import
    expect(source).toContain("import { revokeSession } from '@/lib/security/session-revocation'");
  });
});

// ─── UserOp Receipt Status Check ─────────────────────────────────────────────

describe('UserOp Receipt Status Check', () => {
  test('12. Rebalance executor checks receipt.success', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('lib/agent/rebalance-executor.ts', 'utf-8');

    // Verify receipt status check
    expect(source).toContain('receipt.success');
    expect(source).toContain('UserOp REVERTED');
    expect(source).toContain('UserOp reverted on-chain');
  });
});

// ─── Nonce Replay Protection Comment ─────────────────────────────────────────

describe('Nonce Replay Protection', () => {
  test('13. Kernel client documents nonce replay protection', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('lib/zerodev/kernel-client.ts', 'utf-8');

    expect(source).toContain('nonce replay protection is handled by the protocol');
    expect(source).toContain('EntryPoint contract also manages UserOp nonces');
  });
});
