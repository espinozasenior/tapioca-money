# Changelog

All notable changes to Tapioca Finance will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to a four-digit `MAJOR.MINOR.PATCH.MICRO` version scheme
(`MAJOR.MINOR.PATCH` tracks the npm package version in `package.json`; `MICRO` is
reserved for post-release hotfixes).

## [Unreleased]

### Added

- Sentinel v0 circuit breaker with vault-flow signals, PagerDuty alerting, and CI/CD auto-deploy to VPS.
- Harder Morpho vault filtering: $10M TVL floor, whitelisted-only, 50% APY cap to screen out speculative pools.
- Paused-vault visibility on the dashboard when a user has funds in a paused vault.
- Vault quality gates and automated review remediation.

### Fixed

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
