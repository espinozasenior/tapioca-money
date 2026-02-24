# Test Coverage Improvement Plan

Current Coverage: ~17.7% (Started at 11%)
Target Coverage: >80%

This plan breaks down the effort into 5 phases, prioritizing core business logic and critical infrastructure.

## Phase 1: Core Business Logic (The "Brain")

**Goal:** Secure the decision-making engines. These are pure functions or isolated services that are easiest to unit test.
**Status:** Completed ✅

- [x] `lib/agent/decision-engine.ts` (Current: ~97%)
  - Test rebalance triggers, APY thresholds, and gas cost analysis.
- [x] `lib/yield-optimizer/apy-calculator.ts` (Current: 100%)
  - Test APY calculations for different protocols.
- [x] `lib/yield-optimizer/rewards-calculator.ts` (Current: 100%)
  - Test reward token estimation and value conversion.
- [x] `lib/yield-optimizer/strategy/evaluator.ts` (Current: ~96%)
  - Test strategy scoring and ranking logic.
- [x] `lib/morpho/risk-scoring.ts` (Current: ~73%)
  - Test risk factor weighting and score normalization.

## Phase 2: Smart Account & Protocol Integration

**Goal:** Verify interactions with external SDKs (ZeroDev, Morpho). Requires extensive mocking.
**Status:** Completed ✅

- [x] `lib/zerodev/client-secure.ts` (Current: ~95%)
  - Test secure client initialization and signer config.
- [x] `lib/zerodev/kernel-client.ts` (Current: ~90%)
  - Test account deployment status checks and user operation signing.
- [x] `lib/zerodev/transfer-executor.ts` (Current: 100%)
  - Improve coverage for edge cases in transfer execution.
- [x] `lib/protocols/*-adapter.ts` (Current: ~100%)
  - Test adapter standardizations for Aave, Moonwell, and Morpho.

## Phase 3: API Endpoints (Integration Tests)

**Goal:** Ensure the HTTP interface works as expected. These will be integration tests using mocks for the service layer.
**Status:** Completed ✅

- [x] `app/api/agent/cron/route.ts` (Current: ~95%)
  - Test the main agent loop, error handling, and timeout logic.
- [x] `app/api/transfer/send/route.ts` (Current: ~95%)
  - Test gasless transfer endpoint validation and execution.
- [x] `app/api/vault/deposit/route.ts` & `redeem/route.ts` (Current: ~95%)
  - Test vault interaction endpoints.
- [x] `app/api/agent/register/route.ts` & `generate-session-key/route.ts` (Current: ~95%)
  - Test session generation and validation.

## Phase 4: Infrastructure & Utilities

**Goal:** Harden the supporting infrastructure code.
**Status:** Completed ✅

- [x] `lib/redis/client.ts` (Current: ~88%)
  - Test connection handling, retries, and fallback logic.
- [x] `lib/redis/morpho-cache.ts` (Current: 100%)
  - Test caching strategies and TTLs.
- [x] `lib/auth/middleware.ts` (Current: 100%)
  - Test route protection and permission checks.
- [x] `lib/monitoring/error-tracker.ts` (Current: 100%)
  - Test error logging and alert dispatching.

## Phase 5: Frontend Hooks & Remaining Gaps

**Goal:** Cover client-side logic and close any remaining gaps to reach 80%.
**Status:** Completed ✅

- [x] `hooks/useWallet.ts` (Current: ~100%)
  - Test wallet connection states and methods.
- [x] `hooks/useOptimizer.ts` (Current: ~100%)
  - Test optimization hooks and state management.
- [x] `lib/utils.ts` (Current: 100%)
  - Test general utility functions.

## Execution Strategy

1. **Mocking:** Use `vi.mock()` heavily for external dependencies (Viem, ZeroDev SDK, Redis).
2. **Fixtures:** Create standard test fixtures for UserOps, Vaults, and Session Keys.
3. **CI Integration:** Ensure `pnpm test:coverage` runs on every PR and enforces the increasing thresholds.
