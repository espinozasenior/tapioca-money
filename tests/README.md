# Test Suite

## Setup

- **Vitest 4.x** — test runner with 30s timeout
- **fast-check** — property-based / fuzz testing
- **Custom mocks** — ZeroDev bundler, Morpho API, Privy wallet (`tests/mocks/`)

## Running Tests

```bash
pnpm test              # Watch mode
pnpm test:run          # Single run (CI)
pnpm test:coverage     # With coverage report
pnpm test:integration  # Integration tests only
pnpm test:ui           # Browser UI
```

## Structure

```
tests/
├── setup.ts                              # Global env setup
├── helpers/
│   └── test-setup.ts                     # DB seeding, cleanup utilities
├── mocks/
│   ├── zerodev-bundler.ts                # Mock ZeroDev bundler/paymaster
│   ├── morpho-api.ts                     # Mock Morpho GraphQL API
│   └── privy-wallet.ts                   # Mock Privy wallet provider
├── integration/
│   ├── agent-session.test.ts             # Agent session key lifecycle
│   ├── chainlink-oracle.test.ts          # Chainlink L2 sequencer safety checks
│   ├── cron-job.test.ts                  # Autonomous rebalancing cron
│   ├── decision-engine.test.ts           # Yield decision logic
│   ├── e2e-flow.test.ts                  # End-to-end workflow
│   ├── edge-cases.test.ts               # Error handling edge cases
│   ├── eip7702-delegation.test.ts        # EIP-7702 delegation lifecycle (25 tests)
│   ├── gasless-transfer.test.ts          # Gasless USDC transfer execution
│   ├── morpho-api.test.ts               # Morpho API response parsing
│   ├── performance.test.ts              # Batch processing & stress tests
│   ├── rate-limiting.test.ts            # Transfer rate limiting
│   ├── security-edge-cases.test.ts      # Security hardening (revocation, locks, phishing guard)
│   └── transfer-session.test.ts         # Transfer session key management
└── property/
    └── fuzz-security.test.ts            # Property-based fuzz tests (6 targets)
```

## Test Categories

### EIP-7702 Delegation (`eip7702-delegation.test.ts`)
- Delegation designator parsing (`0xef0100` + 20-byte address)
- Permission validator slot verification
- Rebalance call building (redeem + approve + deposit)
- Undelegation via `address(0)`
- Serialize/deserialize kernel account pattern

### Security Hardening (`security-edge-cases.test.ts`)
- Session key revocation via Redis blacklist
- Distributed lock for concurrent cron prevention
- Delegation target verification (phishing guard)
- On-chain timestamp policy presence
- Value limits on CallPolicy permissions
- Fail-closed rate limiter behavior
- UserOp receipt status checking

### Property-Based Fuzz Tests (`fuzz-security.test.ts`)
- Delegation designator parsing (500 random inputs)
- Auth serialization roundtrip (bigint preservation)
- AES-256-GCM encrypt/decrypt roundtrip + tamper detection
- `isEncrypted` format detection
- Session revocation case-insensitivity
- Rate limiter boundary conditions

### Cron & Agent (`cron-job.test.ts`, `agent-session.test.ts`)
- Parallel batch processing with distributed locks
- Session key expiry and revocation checks
- Simulation mode
- CRON_SECRET authentication
- Error isolation (one user failure doesn't cascade)

### Yield Logic (`decision-engine.test.ts`, `morpho-api.test.ts`)
- APY threshold evaluation
- Break-even calculation
- Morpho GraphQL response parsing

### Transfers (`transfer-session.test.ts`, `gasless-transfer.test.ts`, `rate-limiting.test.ts`)
- Session key creation with restricted permissions
- Gasless USDC transfer execution
- Daily limits (20/day), amount limits ($500/transfer)

### End-to-End & Performance (`e2e-flow.test.ts`, `performance.test.ts`, `edge-cases.test.ts`)
- Full registration → rebalance → verification flow
- 100-user batch processing benchmarks
- Network failures, concurrent access, malformed data

## Environment Variables

Set automatically in `tests/setup.ts`:

```
AGENT_SIMULATION_MODE=true
DATABASE_ENCRYPTION_KEY=<test key>
ZERODEV_PROJECT_ID=test_project_id
ZERODEV_BUNDLER_URL=https://test.bundler.url
NEXT_PUBLIC_PRIVY_APP_ID=test_privy_app_id
CRON_SECRET=test_secret_12345678901234567890
```

## Coverage Thresholds

Configured in `vitest.config.ts`:
- Lines: 80%
- Functions: 80%
- Branches: 75%
- Statements: 80%

## CI

GitHub Actions runs on every PR to `main` (`.github/workflows/ci.yml`):
1. Type check (`tsc --noEmit`)
2. Tests (`pnpm test:run`)
3. Build (`pnpm build`)
