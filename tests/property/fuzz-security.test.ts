/**
 * Property-Based / Fuzz Tests for Security-Critical Functions
 *
 * Uses fast-check to exercise delegation parsing, encryption,
 * auth serialization, and session revocation with random inputs.
 */

import { describe, test, expect, vi, beforeAll } from 'vitest';
import fc from 'fast-check';

// fast-check v4 removed hexaString — build a hex arbitrary from stringMatching
const arbHex40 = fc.stringMatching(/^[0-9a-f]{40}$/);
const arbHex64 = fc.stringMatching(/^[0-9a-f]{64}$/);

// ─── A. EIP-7702 Delegation Designator Parsing ─────────────────────────────

// Extracted from client-secure.ts:326-331 (pure logic, no network calls)
function parseDelegationBytecode(code: string | undefined) {
  if (!code || code === '0x') {
    return { active: false, isDelegation: false };
  }
  if (code.startsWith('0xef0100') && code.length === 48) {
    const implementationAddress = ('0x' + code.slice(8)) as `0x${string}`;
    return { active: true, isDelegation: true, implementationAddress };
  }
  return { active: true, isDelegation: false };
}

describe('Fuzz: EIP-7702 Delegation Designator', () => {
  test('valid designator always parses correctly', () => {
    fc.assert(
      fc.property(arbHex40, (addr) => {
        const code = `0xef0100${addr}`;
        const result = parseDelegationBytecode(code);
        expect(result.active).toBe(true);
        expect(result.isDelegation).toBe(true);
        expect(result.implementationAddress?.toLowerCase()).toBe(`0x${addr.toLowerCase()}`);
      }),
      { numRuns: 500 },
    );
  });

  test('arbitrary strings never cause exceptions', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const result = parseDelegationBytecode(s);
        expect(result).toBeDefined();
        expect(typeof result.active).toBe('boolean');
        expect(typeof result.isDelegation).toBe('boolean');
      }),
      { numRuns: 1000 },
    );
  });

  test('wrong-length designator is never classified as delegation', () => {
    const arbWrongLen = fc.stringMatching(/^[0-9a-f]+$/)
      .filter(h => h.length !== 40 && h.length > 0);
    fc.assert(
      fc.property(arbWrongLen, (hex) => {
        const result = parseDelegationBytecode(`0xef0100${hex}`);
        expect(result.isDelegation).toBe(false);
      }),
      { numRuns: 500 },
    );
  });

  test('empty and null bytecodes return inactive', () => {
    fc.assert(
      fc.property(fc.constantFrom(undefined, '', '0x'), (code) => {
        const result = parseDelegationBytecode(code);
        expect(result.active).toBe(false);
        expect(result.isDelegation).toBe(false);
      }),
    );
  });
});

// ─── B. SignedAuth Serialize/Deserialize Roundtrip ──────────────────────────

// Mirrors client-secure.ts:48-58
function serializeSignedAuth(auth: any) {
  const yParity = auth.yParity ?? auth.v;
  return {
    ...auth,
    v: yParity != null ? yParity.toString() : undefined,
    yParity: yParity != null ? Number(yParity) : undefined,
    chainId: Number(auth.chainId),
    nonce: Number(auth.nonce),
  };
}

// Mirrors kernel-client.ts:91-98
function deserializeSignedAuth(auth: any) {
  const v = auth.v != null ? BigInt(auth.v) : undefined;
  return {
    ...auth,
    v,
    yParity: v != null ? Number(v) : undefined,
  };
}

describe('Fuzz: SignedAuth serialize/deserialize roundtrip', () => {
  test('roundtrip preserves v/yParity for all valid values', () => {
    const arbAuth = fc.record({
      v: fc.constantFrom(0n, 1n, 27n, 28n),
      chainId: fc.integer({ min: 1, max: 100000 }),
      nonce: fc.integer({ min: 0, max: 1000000 }),
      contractAddress: arbHex40.map(h => `0x${h}`),
      r: arbHex64.map(h => `0x${h}`),
      s: arbHex64.map(h => `0x${h}`),
    });

    fc.assert(
      fc.property(arbAuth, (auth) => {
        const serialized = serializeSignedAuth(auth);
        expect(typeof serialized.v).toBe('string');
        expect(typeof serialized.chainId).toBe('number');
        expect(typeof serialized.nonce).toBe('number');

        const deserialized = deserializeSignedAuth(serialized);
        expect(deserialized.v).toBe(auth.v);
        expect(typeof deserialized.v).toBe('bigint');
      }),
      { numRuns: 500 },
    );
  });

  test('chainId and nonce survive roundtrip', () => {
    const arbAuth = fc.record({
      v: fc.constantFrom(0n, 1n),
      chainId: fc.integer({ min: 1, max: 100000 }),
      nonce: fc.integer({ min: 0, max: 1000000 }),
    });

    fc.assert(
      fc.property(arbAuth, (auth) => {
        const serialized = serializeSignedAuth(auth);
        expect(serialized.chainId).toBe(auth.chainId);
        expect(serialized.nonce).toBe(auth.nonce);
      }),
      { numRuns: 500 },
    );
  });
});

// ─── C. AES-256-GCM Encrypt/Decrypt Roundtrip ──────────────────────────────

describe('Fuzz: AES-256-GCM encrypt/decrypt', () => {
  beforeAll(() => {
    process.env.DATABASE_ENCRYPTION_KEY = 'a'.repeat(64);
  });

  test('encrypt then decrypt returns original plaintext', async () => {
    const { encrypt, decrypt } = await import('@/lib/security/encryption');

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 5000 })
          .filter(s => !s.startsWith('encrypted:v1:')),
        (plaintext) => {
          const encrypted = encrypt(plaintext);
          const decrypted = decrypt(encrypted);
          expect(decrypted).toBe(plaintext);
        },
      ),
      { numRuns: 300 },
    );
  });

  test('each encryption produces unique ciphertext', async () => {
    const { encrypt } = await import('@/lib/security/encryption');

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 1000 })
          .filter(s => !s.startsWith('encrypted:v1:')),
        (plaintext) => {
          const e1 = encrypt(plaintext);
          const e2 = encrypt(plaintext);
          expect(e1).not.toBe(e2); // Random IV ensures different output
        },
      ),
      { numRuns: 200 },
    );
  });

  test('tampered ciphertext throws', async () => {
    const { encrypt, decrypt } = await import('@/lib/security/encryption');

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 500 })
          .filter(s => !s.startsWith('encrypted:v1:')),
        fc.integer({ min: 0, max: 100 }),
        (plaintext, tamperOffset) => {
          const encrypted = encrypt(plaintext);
          const parts = encrypted.split(':');
          // Tamper with the ciphertext part (index 3)
          const ct = Buffer.from(parts[3], 'base64');
          if (ct.length > 0) {
            ct[tamperOffset % ct.length] ^= 0xff;
            parts[3] = ct.toString('base64');
            const tampered = parts.join(':');
            expect(() => decrypt(tampered)).toThrow();
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ─── D. isEncrypted Format Detection ────────────────────────────────────────

describe('Fuzz: isEncrypted format detection', () => {
  test('detects encrypted format', async () => {
    const { isEncrypted } = await import('@/lib/security/encryption');

    const arbEncrypted = fc.tuple(
      fc.base64String({ minLength: 1 }),
      fc.base64String({ minLength: 1 }),
      fc.base64String({ minLength: 1 }),
    ).map(([iv, ct, tag]) => `encrypted:v1:${iv}:${ct}:${tag}`);

    fc.assert(
      fc.property(arbEncrypted, (s) => {
        expect(isEncrypted(s)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  test('rejects arbitrary strings without prefix', async () => {
    const { isEncrypted } = await import('@/lib/security/encryption');

    fc.assert(
      fc.property(
        fc.string().filter(s => !s.startsWith('encrypted:v1:')),
        (s) => {
          expect(isEncrypted(s)).toBe(false);
        },
      ),
      { numRuns: 500 },
    );
  });
});

// ─── E. Session Revocation Case-Insensitivity ──────────────────────────────

describe('Fuzz: Session revocation case-insensitivity', () => {
  test('revoke + check is case-insensitive for any hex address', async () => {
    const store = new Map<string, string>();
    vi.doMock('@/lib/redis/client', () => ({
      getCacheInterface: async () => ({
        get: async (key: string) => store.get(key) ?? null,
        set: async (key: string, value: string) => { store.set(key, value); },
        del: async (key: string) => { store.delete(key); },
      }),
    }));

    const { revokeSession, isSessionRevoked } = await import('@/lib/security/session-revocation');
    const samples = fc.sample(arbHex40.map(h => `0x${h}`), 100);

    for (const addr of samples) {
      store.clear();
      await revokeSession(addr);

      // All case variants should return true
      expect(await isSessionRevoked(addr.toUpperCase())).toBe(true);
      expect(await isSessionRevoked(addr.toLowerCase())).toBe(true);

      // Mixed case
      const mixed = addr.slice(0, 10).toUpperCase() + addr.slice(10).toLowerCase();
      expect(await isSessionRevoked(mixed)).toBe(true);
    }

    vi.doUnmock('@/lib/redis/client');
  });
});

// ─── F. Rate Limiter Boundary Conditions ────────────────────────────────────

describe('Fuzz: Rate limiter boundaries', () => {
  test('allows exactly maxRequests, then denies', async () => {
    const { checkAndRecordRateLimit, resetRateLimit } = await import('@/lib/redis/rate-limiter');

    const arbMax = fc.integer({ min: 1, max: 5 });
    const samples = fc.sample(arbMax, 5);

    for (const maxReq of samples) {
      const id = `fuzz-${maxReq}-${Date.now()}-${Math.random()}`;
      const config = { maxRequests: maxReq, windowMs: 60000, keyPrefix: 'fuzztest' };

      // Use checkAndRecordRateLimit which atomically checks + records
      for (let i = 0; i < maxReq; i++) {
        const result = await checkAndRecordRateLimit(id, config);
        expect(result.allowed).toBe(true);
      }

      // The next request should be denied
      const denied = await checkAndRecordRateLimit(id, config);
      expect(denied.allowed).toBe(false);
      expect(denied.remaining).toBe(0);

      // Clean up
      await resetRateLimit(id, 'fuzztest');
    }
  });

  test('fresh identifier always has full remaining', async () => {
    const { checkRateLimit } = await import('@/lib/redis/rate-limiter');

    const arbMax = fc.integer({ min: 1, max: 50 });
    const samples = fc.sample(arbMax, 20);

    for (const maxReq of samples) {
      const id = `fuzz-fresh-${maxReq}-${Date.now()}-${Math.random()}`;
      const config = { maxRequests: maxReq, windowMs: 60000, keyPrefix: 'fuzzfresh' };

      const result = await checkRateLimit(id, config);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(maxReq);
    }
  });
});
