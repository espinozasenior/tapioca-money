# Changelog

All notable changes to Tapioca Finance will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to a four-digit `MAJOR.MINOR.PATCH.MICRO` version scheme
(`MAJOR.MINOR.PATCH` tracks the npm package version in `package.json`; `MICRO` is
reserved for post-release hotfixes).

## [Unreleased]

### Added

- Send money to another wallet now works without native ETH: customer pays the gas in USDC through the ZeroDev ERC-20 paymaster. One unified send flow for Privy embedded users and external wallets, replacing the broken sponsored path.
- Inline first-send: new users and anyone on a legacy session go through a single continuous "setting up... sending..." experience — no extra modal, one signature prompt.
- Recipient input resolves ENS names (`vitalik.eth`) and Basenames (`luis.base.eth`) via mainnet CCIP-read with a race-safe 5-minute LRU cache; `NEXT_PUBLIC_ERPC_URL` auto-gets the `/main/evm/1` suffix.
- Recent recipients strip on the Send screen, clipboard paste chip on focus, and a Sent! card with the actual USDC fee + BaseScan link.
- Static "Max $500 per transfer" helper with a live "N sends remaining today" counter pulled from the new `rateLimitInfo` block on the register endpoint.
- Redis-backed idempotency wrapper (`lib/redis/idempotency.ts`) for `/api/transfer/send`; fail-closed in production, DID-scoped keys, 60-second TTL.
- Feature flag `NEXT_PUBLIC_ENABLE_USDC_PAYMASTER` (client) and `ENABLE_USDC_PAYMASTER` (server) for instant rollback without redeploy.
- Migrations `0005_paymaster_version` (backfills legacy session rows with `permissionsVersion=1`) and `0006_transfer_history` (new table powering the Sent! card and recent-recipients strip).
- **CI runs Drizzle migrations automatically on push to `main`**, gated behind typecheck/test/security. Uses the new `production` GitHub environment with a scoped `PRODUCTION_DATABASE_URL` secret. Safety rail skips the job when only `drizzle/meta/**` churns without a new SQL file.
- **Vercel production deploy is now chained behind migrate via a Deploy Hook.** `vercel.json` disables main auto-deploy (`deploymentEnabled.main: false`); CI's `deploy` job POSTs to `VERCEL_DEPLOY_HOOK_URL` only after migrate succeeds. Production never ships against an un-migrated schema.
- Regression-guard tests for the send feature's load-bearing invariants: `sendUsdc` phase emission (inline session setup, idempotency-key plumbing, error-code propagation) and CallPolicy v2 shape (paymaster-approve spender pinned via `ParamCondition.EQUAL`). 513 unit tests pass, up from 500.
- Sentinel v0 circuit breaker with vault-flow signals, PagerDuty alerting, and CI/CD auto-deploy to VPS.
- Harder Morpho vault filtering: $10M TVL floor, whitelisted-only, 50% APY cap to screen out speculative pools.
- Paused-vault visibility on the dashboard when a user has funds in a paused vault.
- Vault quality gates and automated review remediation.

### Changed

- `hooks/useWallet.ts` collapses `send` / `sendSponsored` / `enableGaslessTransfers` / `revokeGaslessTransfers` into a single phase-emitting `sendUsdc()`. Old `sendSponsored` kept as a thin shim for the test suite's migration window.
- Transfer session CallPolicy bumped to v2: adds `USDC.approve(paymaster, ≤FEE_CAP)` with a pinned spender, so a leaked session key can never approve an arbitrary contract.
- `createDeserializedKernelClient` accepts an optional `paymaster` option and threads it through the duplicate-permissionHash retry path — send is customer-paid, agent rebalances stay sponsored.

### Fixed

- Send-to-another-wallet was effectively useless for Privy embedded users (zero native ETH → gas estimation always failed); the new paymaster flow makes the feature usable for the majority of the user base.
- Sentinel share price normalization now uses the underlying token's `decimals()` rather than the share token's.
- Sentinel VAULT_FLOW signal no longer pages on zero-user exits.
- CI deploy workflow force-cleans the VPS working tree so feature-branch leftovers can't block releases.
- CI deploy uses the locally installed `tsup` binary instead of `npx` to avoid cold-start flakiness.

## [0.2.0] - 2026-03-20

### Added

- Multi-asset yield opportunities across Morpho and other Base protocols.
- Redesigned deposit flow with clearer asset selection and sweetness-level APY presentation.
- DDD Phase 3-5 refactor: `VaultExecutor` service, extracted domain services, and elimination of `any` types.
- Playful Pearl design system (bubble-tea metaphor: Milktea / Pearl / Matcha / Creamy palette, Quicksand type, pill buttons, squircle icons, pearl-motif backgrounds).
- Split CI `validate` job into independent `typecheck`, `test`, and `security` jobs for faster feedback.

### Changed

- Client-secure module split into focused files (selectors consolidation, registration deduplication).
- Security hardening: rate limiter reinforcement, vault approval guards, Redis failover, and auth guards on every previously-unprotected API endpoint.

### Removed

- `@crossmint/client-sdk-react-ui` and transitive dependencies.
- Stale root-level documentation; cleaned outdated `docs/`, `tasks/`, `.swarm/`, and `.claude-flow/` directories from history.

### Fixed

- Accessibility and code-quality cleanup across the UI.
- Audit remediations C-2 through L-4 (shared DB singleton, `agentAddress` data query correctness).

[Unreleased]: https://github.com/espinozasenior/tapioca-money/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/espinozasenior/tapioca-money/releases/tag/v0.2.0
