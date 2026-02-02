# Test Suite Documentation

This directory contains comprehensive integration tests for the gasless transfer and autonomous rebalancing features.

## Setup

The test framework uses:
- **Vitest** - Fast, modern test runner
- **Happy DOM** - Lightweight DOM implementation for React testing
- **MSW** - API mocking for HTTP/GraphQL requests
- **Custom mocks** - ZeroDev bundler, Morpho API, Privy wallet

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests once (CI mode)
pnpm test:run

# Run with coverage report
pnpm test:coverage

# Run only integration tests
pnpm test:integration

# Run with UI
pnpm test:ui
```

## Test Structure

```
tests/
├── setup.ts                      # Global test setup
├── helpers/
│   └── test-setup.ts            # Database helpers, test utilities
├── mocks/
│   ├── zerodev-bundler.ts       # Mock ZeroDev bundler/paymaster
│   ├── morpho-api.ts            # Mock Morpho GraphQL API
│   └── privy-wallet.ts          # Mock Privy wallet provider
└── integration/
    ├── transfer-session.test.ts  # Transfer session key tests
    ├── gasless-transfer.test.ts  # Gasless transfer execution tests
    └── rate-limiting.test.ts     # Rate limiting tests
```

## Test Categories

### Transfer Session Management (`transfer-session.test.ts`)
- ✅ Session key creation with restricted permissions
- ✅ Session validation (expiry, type, data)
- ✅ Session cleanup
- ✅ 30-day expiry period

### Gasless Transfer Execution (`gasless-transfer.test.ts`)
- ✅ Execute gasless USDC transfers
- ✅ Parameter validation (recipient, amount, session)
- ✅ Amount conversion to USDC decimals (6 decimals)
- ✅ Simulation mode (no real transactions)
- ✅ Error handling

### Rate Limiting (`rate-limiting.test.ts`)
- ✅ Daily transfer limit (20 transfers/day)
- ✅ Amount limit ($500 per transfer)
- ✅ Per-user rate limiting
- ✅ Failed attempts don't count
- ✅ Transfer history tracking
- ✅ Reset time calculation

## Test Helpers

### Database Helpers (`helpers/test-setup.ts`)

```typescript
// Create test user
const user = await seedTestUser('0xADDRESS', autoOptimize);

// Create transfer session
const session = await createTestTransferSession('0xADDRESS');

// Create agent session
const agentAuth = await createTestAgentSession('0xADDRESS');

// Cleanup
await cleanupTestData(['0xADDRESS']);
```

### Mock Helpers

```typescript
// Mock Privy wallet
const wallet = createMockPrivyWallet('0xADDRESS');

// Mock bundler calls
resetBundlerMocks();
const callCount = getBundlerCallCount();
const lastCall = getLastBundlerCall();

// Mock Morpho API
const api = mockMorphoAPI();
const vaults = await api.fetchVaults();
```

## Environment Variables

Tests use the following env vars (set in `setup.ts`):

```bash
AGENT_SIMULATION_MODE=true           # Prevents real blockchain transactions
DATABASE_URL=postgresql://...         # Test database
ZERODEV_PROJECT_ID=test_project_id
ZERODEV_BUNDLER_URL=https://test.bundler.url
NEXT_PUBLIC_PRIVY_APP_ID=test_privy_app_id
CRON_SECRET=test_secret_12345678901234567890
```

## Coverage Goals

The test suite aims for:
- **Lines**: >80%
- **Functions**: >80%
- **Branches**: >75%
- **Statements**: >80%

Coverage report is generated in `coverage/` directory.

## Simulation Mode

All tests run in **simulation mode** to prevent:
- Real blockchain transactions
- Actual bundler/paymaster calls
- Production database modifications

This is enforced by `AGENT_SIMULATION_MODE=true`.

## Adding New Tests

1. Create test file in `tests/integration/`
2. Import helpers from `../helpers/test-setup`
3. Import mocks from `../mocks/`
4. Use `beforeEach` for setup and `afterEach` for cleanup
5. Run `pnpm test` to verify

Example:

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { seedTestUser, cleanupTestData } from '../helpers/test-setup';

describe('My Feature', () => {
  const testAddress = '0xTEST_UNIQUE_ADDRESS';

  beforeEach(async () => {
    await seedTestUser(testAddress);
  });

  afterEach(async () => {
    await cleanupTestData([testAddress]);
  });

  test('should work correctly', () => {
    expect(true).toBe(true);
  });
});
```

## Debugging Tests

```bash
# Run specific test file
pnpm test transfer-session

# Run tests matching pattern
pnpm test -- --grep "gasless"

# Run with verbose output
pnpm test -- --reporter=verbose

# Open UI for debugging
pnpm test:ui
```

## Next Steps

Additional test files to be implemented:
- `agent-session.test.ts` - Agent session key tests
- `decision-engine.test.ts` - Yield decision logic tests
- `cron-job.test.ts` - Autonomous rebalancing cron tests
- `e2e-flow.test.ts` - End-to-end workflow tests
- `performance.test.ts` - Performance and stress tests
- `edge-cases.test.ts` - Edge case and error handling tests

See the implementation plan for detailed test scenarios.
