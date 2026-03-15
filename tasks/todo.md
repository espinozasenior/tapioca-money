# EIP-7702 Yield Automation Agent Upgrade

## Dual-Path Registration (EIP-7702 + ERC-4337 Fallback) — March 2026

- [x] Phase 1: `app/providers.tsx` — SmartWalletsProvider, `createOnLogin: "all-users"`
- [x] Phase 2: `hooks/useWalletSelection.ts` — `supportsEip7702`, `smartWalletAddress`, `agentAddress`
- [x] Phase 3: `lib/zerodev/client-secure.ts` — `buildSessionKeyAndPermissions()` (shared), `registerAgentErc4337()`
- [x] Phase 4: `lib/security/session-encryption.ts` — `SessionKeyErc4337Authorization` type
- [x] Phase 5: `hooks/useOptimizer.ts` — Branch: 7702 (Privy) vs 4337 (external + embedded)
- [x] Phase 6: Server routes — `generate-session-key`, `deposit`, `redeem`, `cron` accept both session types
- [x] Phase 7: UI — `DepositYield.tsx` uses `canRegister`, `WalletDetails.tsx` dynamic revoke/reset
- [x] Phase 8: Address resolution — Position queries use `agentAddress` in earn-yield, rewards, activity
- [x] Verification: TypeScript build clean, 455/455 tests pass
- [ ] **Manual**: Enable Smart Wallets in Privy Dashboard (Kernel, Base 8453, ZeroDev bundler URL)

## Completed Steps

- [x] **Step 1:** Update `lib/security/session-encryption.ts` — Added `SessionKey7702Authorization` interface with `eoaAddress` field (EOA = smart account in 7702)
- [x] **Step 2:** Update `lib/zerodev/kernel-client.ts` — Added `eip7702Account` parameter to `CreateSessionKernelClientParams`, 7702 path uses `eip7702Account` in `createKernelAccount`, legacy path unchanged
- [x] **Step 3:** Update `lib/zerodev/client-secure.ts` — Rewrote `registerAgentSecure` to use EIP-7702 flow with `eip7702Account: walletClient` in `createKernelAccount`, sends `mode: '7702'` to session key API. Added `revokeOnChain()` for full on-chain undelegation
- [x] **Step 4:** Update `app/api/agent/generate-session-key/route.ts` — Accepts `mode` parameter, stores `zerodev-7702-session` type with `eoaAddress` for 7702 registrations, legacy path unchanged
- [x] **Step 5:** Update `app/api/agent/cron/route.ts` — Dual-path: accepts both `zerodev-session-key` and `zerodev-7702-session` types, resolves `smartAccountAddress` from `eoaAddress` for 7702 users
- [x] **Step 6:** Update `hooks/useWallet.ts` — Added `signAuthorization()` method to wallet hook for registration UI
- [x] **Step 7:** Verify executor compatibility — `rebalance-executor`, `deposit-executor`, `vault-executor`, `transfer-executor` all compatible (they accept `smartAccountAddress` which equals `eoaAddress` for 7702)
- [x] **Step 8:** TypeScript build verification — No type errors in modified files

## Pendle PT-yoUSD Integration (Completed)

- [x] **Phase 1:** Foundation — `lib/pendle/constants.ts`, `types.ts`, `api-client.ts`, `lib/redis/pendle-cache.ts`
- [x] **Phase 2:** Session Key Permissions — Added Pendle Router V4 to CallPolicy + approvedVaults
- [x] **Phase 3:** Opportunity Card — PT-yoUSD appears in yield list with "YO · Pendle" branding, fixed APY badge, maturity date
- [x] **Phase 4:** Deposit Flow — 4-call atomic batch (USDC → yoUSD → PT-yoUSD) via `pendle-deposit-executor.ts`
- [x] **Phase 5:** Position Tracking — PT balance read on-chain, maturity countdown in PositionsList
- [x] **Phase 6:** Redeem Flow — Pre-maturity (AMM sell) and at-maturity (1:1 redeem) paths via `pendle-redeem-executor.ts`
- [x] **Phase 7:** Agent Integration — Decision engine evaluates PT as downstream YO optimization, auto-redeem matured PT in cron
- [x] **Phase 8:** Tests — 27 new tests across 6 test files, all 436 tests pass

## Reset Agent Delegation (Completed)

- [x] Add "Reset Agent Delegation" button to WalletDetails modal (two-click confirm)
- [x] Fix Privy `signAuthorization` (embedded wallets only, not external)
- [x] Server-side relayer for EIP-7702 undelegation (`RELAYER_PRIVATE_KEY` env var)
- [x] DB cleanup: reset `authorization_7702`, `agent_registered`, `auto_optimize_enabled`
- [x] Block external wallets with clear error message during registration
- [x] All 439 tests pass

## External Wallet Support — ERC-5792 (Completed)

- [x] Add `delegateViaExternalWallet()` — sends Type 4 tx via `authorizationList`, waits for confirmation, verifies delegation on-chain
- [x] Add `createAndSerializeAccountExternal()` — creates kernel account without `eip7702Auth` (delegation already on-chain)
- [x] Add `registerAgentSecureExternal()` — fetches vaults, serializes account, sends to server (same `/api/agent/register` endpoint)
- [x] Bifurcate `useOptimizer.ts` registration: Privy → `signAuthorization` flow, external → two-phase delegation + registration
- [x] Privy embedded wallet flow unchanged — no regression
- [x] Unit tests: `delegateViaExternalWallet`, `registerAgentSecureExternal` (3 tests each)
- [x] Integration tests: source verification for external wallet flow (tests 26–32)
- [x] All 451 tests pass (46 test files)
- [ ] E2E: test with Brave wallet and MetaMask on Base mainnet

## Pending Verification (Testnet)

- [ ] Create 7702 kernel account on Base Sepolia
- [ ] Registration: Sign authorization -> create account -> generate session key -> store
- [ ] Rebalance: Cron path with 7702 client -> Morpho vault rebalance on testnet
- [ ] Scope: Verify call policy rejects non-vault addresses
- [ ] Revocation: Soft revoke (DB) + on-chain undelegation
- [ ] Gas: Compare 7702 vs current ERC-4337 gas costs
- [ ] E2E: register -> deposit -> auto-rebalance -> withdraw -> revoke

## Architecture Notes

- EIP-7702: EOA IS the smart account (single address). No separate counterfactual address.
- Registration: Client-side `createKernelAccount({ eip7702Account: walletClient })` delegates EOA code slot to Kernel V3.1
- Execution: Server-side uses `address` parameter (not `eip7702Account`) since delegation is already on-chain
- Session key generation, call policy building, cron execution unchanged — only the account creation path differs
- Backward compatible: legacy `zerodev-session-key` users continue to work alongside `zerodev-7702-session` users
