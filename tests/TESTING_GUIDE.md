# Testing Guide

## Overview

Tapioca Finance uses **Vitest** with 163 automated tests across 14 test files, covering integration tests, security edge cases, and property-based fuzz tests. All external services (ZeroDev, Morpho, Privy, Redis) are mocked — no real blockchain transactions occur during testing.

## Quick Start

```bash
# Run all tests
pnpm test:run

# Run in watch mode during development
pnpm test

# Run specific test file
pnpm test:run tests/integration/eip7702-delegation.test.ts

# Run with coverage report
pnpm test:coverage
```

## Test Environment

`tests/setup.ts` configures all required environment variables automatically:

- `AGENT_SIMULATION_MODE=true` — prevents real blockchain transactions
- `DATABASE_ENCRYPTION_KEY` — test encryption key (auto-generated if not in `.env`)
- `ZERODEV_PROJECT_ID`, `ZERODEV_BUNDLER_URL` — mock bundler endpoints
- `CRON_SECRET` — test cron authentication secret

No manual `.env.test` setup is needed. Tests load `.env` via dotenv and override with test values.

## Writing Tests

### Integration Tests

Place in `tests/integration/`. Use the database helpers for setup/teardown:

```typescript
import { describe, test, expect, afterEach } from "vitest";
import { seedTestUser, cleanupTestData } from "../helpers/test-setup";

describe("My Feature", () => {
  const testAddress = "0xTEST_UNIQUE_ADDRESS";

  afterEach(async () => {
    await cleanupTestData([testAddress]);
  });

  test("should work", async () => {
    await seedTestUser(testAddress, true);
    // ... test logic
  });
});
```

### Property-Based / Fuzz Tests

Place in `tests/property/`. Use `fast-check` for random input generation:

```typescript
import fc from "fast-check";

test("function handles arbitrary input", () => {
  fc.assert(
    fc.property(fc.string(), (input) => {
      const result = myFunction(input);
      expect(result).toBeDefined();
    }),
    { numRuns: 500 }
  );
});
```

For tests needing Redis mocks with async operations, use `fc.sample()` instead of `fc.assert()`:

```typescript
const samples = fc.sample(fc.integer({ min: 1, max: 100 }), 20);
for (const value of samples) {
  const result = await asyncFunction(value);
  expect(result).toBeDefined();
}
```

### Mocking External Services

Mocks live in `tests/mocks/`:

```typescript
import { createMockPrivyWallet } from "../mocks/privy-wallet";
import { resetBundlerMocks } from "../mocks/zerodev-bundler";

// Mock Privy wallet for signing tests
const wallet = createMockPrivyWallet("0xADDRESS");

// Reset bundler state between tests
resetBundlerMocks();
```

For Redis-dependent code, use `vi.doMock` with an in-memory Map:

```typescript
const store = new Map<string, string>();
vi.doMock("@/lib/redis/client", () => ({
  getCacheInterface: async () => ({
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => {
      store.set(key, value);
    },
    del: async (key: string) => {
      store.delete(key);
    },
  }),
}));
```

## Manual Testing

### Trigger Cron Locally

```bash
curl -X POST http://localhost:3000/api/agent/cron \
  -H "x-cron-secret: $CRON_SECRET"
```

### Check Agent Health

```bash
curl http://localhost:3000/api/agent/health
```

### Verify Database Actions

```sql
SELECT u.wallet_address, a.action_type, a.status,
       a.metadata->>'apyImprovement' as apy_gain
FROM agent_actions a
JOIN users u ON a.user_id = u.id
ORDER BY a.created_at DESC LIMIT 10;
```

## CI Pipeline

GitHub Actions (`.github/workflows/ci.yml`) runs on every PR:

1. **Type check** — `tsc --noEmit`
2. **Tests** — `pnpm test:run` (all 163 tests)
3. **Build** — `pnpm build`

No secrets needed — all services are mocked and `DATABASE_ENCRYPTION_KEY` uses a test value.

## Troubleshooting

**Tests fail with "DATABASE_ENCRYPTION_KEY not set"**

- The key is auto-set in `tests/setup.ts`. If running a single file outside Vitest, set it manually: `DATABASE_ENCRYPTION_KEY=aaaa...aaaa pnpm test:run`

**Rate limiter tests are slow**

- The in-memory sorted set implementation is slower than Redis. Rate limiter fuzz tests use small sample sizes to stay within the 30s timeout.

**Module mock not working**

- Use `vi.doMock()` (not `vi.mock()`) when importing after mock setup. Call `vi.doUnmock()` in cleanup.
