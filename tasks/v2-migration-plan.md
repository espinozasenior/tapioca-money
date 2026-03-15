# Tapioca v2 Migration Plan

## Codebase Analysis Summary

Analysis performed by 4 parallel agents across the entire codebase.

### Scope

| Layer | Files | LOC | Must Rewrite | Must Modify | Reusable |
|-------|-------|-----|-------------|-------------|----------|
| Wallet/Auth Infra | 23 | 5,657 | 2,606 | 2,207 | 844 |
| Protocol Integration | 18 | ~2,400 | 0 | ~1,100 | ~1,300 |
| Frontend/Hooks/UI | 36+ | ~4,500 | ~1,100 | ~800 | ~2,600 |
| API Routes | 17 | ~3,500 | 0 | ~1,800 | ~1,700 |
| **Total** | **94+** | **~16,000** | **~3,700** | **~5,900** | **~6,400** |

### Key Architectural Shift

```
CURRENT (ZeroDev + Privy)
  Client: createKernelAccount() + serializePermissionAccount() -> Base64 blob
  Server: deserializePermissionAccount() -> kernelClient.sendUserOperation()
  3 registration paths (7702, external wallet, ERC-4337)

TARGET (Biconomy Nexus + Smart Sessions)
  Client: createSmartAccountClient() + installModule(smartSessionModule) + grantPermission()
  Server: createSmartAccountClient() with session signer + sendTransaction()
  1 unified registration path (ERC-7579)
```

---

## Phase 0: Foundation (TDD-first)

### 0.1 Define Protocol Adapter Interface + Tests

```typescript
// lib/adapters/types.ts
interface ProtocolAdapter {
  id: string;
  name: string;
  getPermissions(): Permission[];
  getYield(): Promise<YieldInfo[]>;
  getPositions(userAddress: Address): Promise<Position[]>;
  prepareDeposit(amount: bigint, recipient: Address): Promise<TxCall[]>;
  prepareWithdraw(amount: bigint, recipient: Address): Promise<TxCall[]>;
}

type TxCall = { to: Address; data: Hex; value: bigint };
type Permission = { target: Address; selector: Hex; rules?: ParamRule[] };
type YieldInfo = { vaultAddress: Address; asset: string; apy: number; tvl: bigint; protocol: string; riskScore?: number };
type Position = { vaultAddress: Address; shares: bigint; valueUsd: number; protocol: string };
```

**Tests first:**
- [ ] `tests/unit/lib/adapters/morpho-adapter.test.ts` -- getPermissions returns correct selectors, prepareDeposit returns 2 calls (approve+deposit), prepareWithdraw returns 1 call
- [ ] `tests/unit/lib/adapters/yo-adapter.test.ts` -- getPermissions includes gateway, prepareDeposit includes quoting, prepareWithdraw handles async redemptions
- [ ] `tests/unit/lib/adapters/pendle-adapter.test.ts` -- getPermissions spans router+PT, prepareDeposit returns 4 calls, prepareWithdraw handles maturity branching
- [ ] `tests/unit/lib/adapters/registry.test.ts` -- adapter registration, permission aggregation, yield aggregation

### 0.2 Define Biconomy Session Interface + Tests

```typescript
// lib/biconomy/types.ts
interface SessionConfig {
  sessionSigner: PrivateKeyAccount;
  permissions: Permission[];
  expiry: number; // unix timestamp
  rateLimit?: { count: number; interval: number };
}

interface BiconomySessionStore {
  sessionId: string;
  signerPrivateKey: string; // encrypted
  smartAccountAddress: Address;
  permissions: Permission[];
  expiry: number;
}
```

**Tests first:**
- [ ] `tests/unit/lib/biconomy/session-manager.test.ts` -- create session, grant permissions, resume session, revoke session
- [ ] `tests/unit/lib/biconomy/client.test.ts` -- create smart account client, send transaction with session, batch transactions

---

## Phase 1: Protocol Adapters (no wallet infra change yet)

### 1.1 Morpho Adapter (LOW complexity)

**Create:** `lib/adapters/morpho-adapter.ts`
**Reuse:** `lib/morpho/api-client.ts`, `lib/morpho/transforms.ts`, `lib/morpho/risk-scoring.ts`
**Extract from:** `lib/zerodev/deposit-executor.ts` (calldata construction only), `lib/zerodev/vault-executor.ts`

- [ ] Implement `getPermissions()` -- standard ERC-4626 (approve, deposit, redeem, withdraw per vault)
- [ ] Implement `getYield()` -- wraps existing `MorphoClient.fetchVaults()`
- [ ] Implement `getPositions()` -- wraps existing GraphQL position queries
- [ ] Implement `prepareDeposit()` -- returns `[approve, deposit]` calls
- [ ] Implement `prepareWithdraw()` -- returns `[redeem]` call
- [ ] Tests pass against mocked Morpho API responses

### 1.2 YO Adapter (MEDIUM complexity)

**Create:** `lib/adapters/yo-adapter.ts`
**Reuse:** `lib/yo/api-client.ts`, `lib/yo/constants.ts`, `lib/yo/transforms.ts`
**Extract from:** `lib/zerodev/yo-deposit-executor.ts`, `lib/zerodev/yo-vault-executor.ts`

- [ ] Implement `getPermissions()` -- gateway deposit/redeem selectors
- [ ] Implement `getYield()` -- wraps existing `YoApiClient.fetchVaults()`
- [ ] Implement `getPositions()` -- wraps existing YO API position queries
- [ ] Implement `prepareDeposit()` -- returns `[approve, gateway.deposit]` with on-chain quoting
- [ ] Implement `prepareWithdraw()` -- returns `[approve, gateway.redeem]`, handles async redemptions
- [ ] Tests pass with mocked gateway quoting

### 1.3 Pendle Adapter (HIGH complexity)

**Create:** `lib/adapters/pendle-adapter.ts`
**Reuse:** `lib/pendle/api-client.ts`, `lib/pendle/constants.ts`, `lib/pendle/position-reader.ts`
**Extract from:** `lib/zerodev/pendle-deposit-executor.ts`, `lib/zerodev/pendle-redeem-executor.ts`
**Depends on:** YO Adapter (for deposit pipeline: USDC -> yoUSD -> PT)

- [ ] Implement `getPermissions()` -- router V4 selectors + PT token approve
- [ ] Implement `getYield()` -- wraps Pendle REST API + Redis cache
- [ ] Implement `getPositions()` -- on-chain `balanceOf` for PT tokens
- [ ] Implement `prepareDeposit()` -- returns 4 calls (approve USDC, YO deposit, approve yoUSD, Pendle swap)
- [ ] Implement `prepareWithdraw()` -- maturity detection, returns AMM sell OR 1:1 redeem calls
- [ ] Tests verify maturity branching, API fallback estimation

### 1.4 Adapter Registry

**Create:** `lib/adapters/registry.ts`

- [ ] `registerAdapter(adapter)` -- add adapter to registry
- [ ] `getAllPermissions()` -- `adapters.flatMap(a => a.getPermissions())`
- [ ] `getAllYields()` -- parallel fetch from all adapters
- [ ] `getAllPositions(address)` -- parallel fetch from all adapters
- [ ] `getAdapter(protocolId)` -- lookup by id
- [ ] Tests verify aggregation, deduplication

---

## Phase 2: Biconomy Nexus Integration

### 2.1 Dependencies

- [ ] Remove: `@zerodev/sdk`, `@zerodev/permissions`, `@zerodev/ecdsa-validator`, `@zerodev/session-key`
- [ ] Add: `@biconomy/account` (or Nexus SDK equivalent)
- [ ] Keep: `viem`, `@privy-io/react-auth`, `@privy-io/node`, all protocol SDKs
- [ ] Update `pnpm` overrides (remove `permissionless` override)
- [ ] Update `next.config.ts` `serverExternalPackages`

### 2.2 Session Manager (replaces serialize/deserialize)

**Create:** `lib/biconomy/session-manager.ts` (replaces `lib/zerodev/client-secure.ts`)

- [ ] `createSession(smartAccountClient, adapters[])` -- install Smart Sessions module, grant permissions from adapter registry
- [ ] `resumeSession(sessionStore)` -- reconstruct signer from encrypted private key, create session-enabled client
- [ ] `revokeSession(smartAccountClient, sessionId)` -- on-chain session revocation
- [ ] `storeSession(sessionStore)` -- encrypt and persist to DB (replaces `authorization_7702` JSONB)
- [ ] Tests mock Biconomy SDK, verify permission installation

### 2.3 Execution Client (replaces kernel-client.ts)

**Create:** `lib/biconomy/execution-client.ts` (replaces `lib/zerodev/kernel-client.ts`)

- [ ] `createSessionClient(encryptedSession)` -- decrypt, resume session, return client
- [ ] `executeBatch(client, calls[])` -- send batched transaction via session
- [ ] `executeWithRetry(client, calls[], maxRetries)` -- retry logic for transient failures
- [ ] Tests verify batch execution, retry behavior

### 2.4 Unified Executor (replaces 7 executor files)

**Create:** `lib/biconomy/executor.ts` (replaces all `lib/zerodev/*-executor.ts`)

- [ ] `executeDeposit(session, adapterId, amount, recipient)` -- `adapter.prepareDeposit()` -> `executeBatch()`
- [ ] `executeWithdraw(session, adapterId, amount, recipient)` -- `adapter.prepareWithdraw()` -> `executeBatch()`
- [ ] `executeRebalance(session, fromAdapter, toAdapter, amount, recipient)` -- compose withdraw + deposit calls
- [ ] Tests verify each protocol path, cross-protocol rebalance

### 2.5 Registration Flow (replaces 3 paths -> 1)

**Modify:** `hooks/useOptimizer.ts` (`useAgent` hook)

- [ ] Remove: `useSign7702Authorization`, dynamic imports of `@zerodev/*`
- [ ] Add: Biconomy `createSmartAccountClient`, `installModule`, `grantPermission`
- [ ] Single path: create Nexus account -> install Smart Sessions module -> grant permissions from adapter registry -> store session
- [ ] Tests mock Biconomy SDK, verify single registration path

---

## Phase 3: API Routes Migration

### Routes that change (8 files):

| Route | Change |
|-------|--------|
| `/api/agent/cron` | Replace `createDeserializedKernelClient` with `createSessionClient` |
| `/api/vault/deposit` | Replace 3 executor imports with unified `executeDeposit` |
| `/api/vault/redeem` | Replace 3 executor imports with unified `executeWithdraw` |
| `/api/agent/register` | Accept Biconomy session format instead of ZeroDev |
| `/api/agent/generate-session-key` | Store Biconomy session instead of serialized account |
| `/api/agent/health` | Ping Biconomy bundler instead of ZeroDev |
| `/api/transfer/register` | Biconomy transfer session |
| `/api/transfer/send` | Biconomy transfer execution |

### Routes unchanged (9 files):
`/api/optimize`, `/api/withdraw`, `/api/morpho/vaults`, `/api/yo/vaults`, `/api/yo/pending-redeems`, `/api/agent/activity`, `/api/agent/sync`, `/api/agent/gains`

### Route to remove:
`/api/agent/undelegate` -- EIP-7702 specific; Biconomy uses on-chain session revocation instead

---

## Phase 4: Frontend Adaptation

### 4.1 Providers (MEDIUM)

- [ ] Remove `SmartWalletsProvider` from `app/providers.tsx`
- [ ] Keep `PrivyProvider` for auth-only
- [ ] Add Biconomy provider/context if needed

### 4.2 Wallet Hooks (HIGH)

- [ ] Simplify `useWalletSelection.ts` -- remove `supportsEip7702`, `smartWalletAddress` branching. `agentAddress` always = Nexus smart account
- [ ] Simplify `useBalance.ts` -- remove dual-path (7702/4337) resolution
- [ ] Rewrite `useAgent()` in `useOptimizer.ts` -- single Biconomy registration path

### 4.3 Components (MEDIUM)

- [ ] `WalletDetails.tsx` -- remove undelegate flow, add "Revoke Session" button
- [ ] `DepositYield.tsx` -- remove 7702/4337 branching in registration gate
- [ ] `AutoOptimize.tsx` -- remove wallet type branching
- [ ] Remove `WalletReconnect` complexity in `home.tsx`

### 4.4 Legacy Removal

- [ ] Remove Crossmint on-ramp (`components/deposit/*`, `server-actions/createOrder.ts`)
- [ ] Remove `useProcessWithdrawal.tsx` (legacy)
- [ ] Remove `@privy-io/wagmi` (unused dependency)

---

## Phase 5: Decision Engine + Rebalance Refactor

### 5.1 Decision Engine (MEDIUM)

- [ ] Replace inline `NormalizedPosition`/`NormalizedVault` with adapter `Position`/`YieldInfo` types
- [ ] Replace protocol-specific fetch calls with `adapterRegistry.getAllPositions()` / `getAllYields()`
- [ ] Preserve Pendle "satellite" check logic but make it adapter-aware
- [ ] Tests use adapter mocks instead of protocol-specific mocks

### 5.2 Rebalance Executor (HIGH -> LOW with adapters)

- [ ] Replace O(n^2) `fromProtocol x toProtocol` branching with: `from.prepareWithdraw() + to.prepareDeposit()`
- [ ] Fix Pendle exit (currently throws `PENDLE_EXIT_REQUIRES_TWO_STEP`) -- adapter handles it internally
- [ ] Tests verify all cross-protocol rebalance paths

---

## Phase 6: Database Migration

### 6.1 Schema Changes

```sql
-- Rename column for clarity
ALTER TABLE users RENAME COLUMN authorization_7702 TO session_authorization;

-- New JSONB structure:
{
  "type": "biconomy-smart-session",
  "smartAccountAddress": "0x...",
  "sessionId": "...",
  "signerPrivateKey": "encrypted...",  -- AES encrypted
  "permissions": [...],
  "expiry": 1234567890,
  "adapters": ["morpho", "yo", "pendle"]
}
```

### 6.2 Migration Strategy

- [ ] All existing users must re-register (ZeroDev sessions are incompatible)
- [ ] Add migration banner in UI: "Please re-register your agent"
- [ ] Keep old column data for 30 days as backup
- [ ] Cleanup script after migration period

---

## Phase 7: Cleanup

- [ ] Delete `lib/zerodev/` directory (all 11 files, ~2,838 LOC)
- [ ] Delete `lib/zerodev/delegation-verification.ts`
- [ ] Remove ZeroDev packages from `package.json`
- [ ] Remove `permissionless` override from pnpm
- [ ] Remove `ZERODEV_PROJECT_ID`, `ZERODEV_BUNDLER_URL` env vars
- [ ] Remove `NEXT_PUBLIC_ENABLE_ERC4337_FALLBACK` flag
- [ ] Update all test mocks from ZeroDev to Biconomy
- [ ] Remove `RELAYER_PRIVATE_KEY` if undelegation route removed

---

## Test Strategy (TDD Throughout)

### Unit Tests (per phase)

| Phase | Test Files | Focus |
|-------|-----------|-------|
| 0 | `adapters/*.test.ts` | Interface contracts |
| 1 | `adapters/{morpho,yo,pendle}-adapter.test.ts` | Calldata construction, permissions |
| 2 | `biconomy/{session-manager,execution-client,executor}.test.ts` | Session lifecycle, batch execution |
| 3 | `api/{deposit,redeem,cron}.test.ts` | Route integration with new executor |
| 4 | `hooks/{useAgent,useBalance}.test.ts` | Registration flow, balance resolution |
| 5 | `agent/{decision-engine,rebalance-executor}.test.ts` | Adapter-based decisions |

### Integration Tests

- [ ] Full registration -> deposit -> rebalance -> withdraw -> revoke flow
- [ ] Cross-protocol rebalance (Morpho -> YO -> Pendle)
- [ ] Session expiry and re-registration
- [ ] Concurrent cron execution with rate limiting

### Verification Gates

Each phase must pass before proceeding:
1. All existing tests pass (or are updated)
2. New tests cover the changed code
3. TypeScript build clean (`tsc --noEmit`)
4. No regression in API behavior

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Biconomy SDK API changes | HIGH | Pin exact version, wrap in thin abstraction |
| User re-registration friction | MEDIUM | Clear UI banner, in-app walkthrough |
| Pendle adapter complexity | HIGH | Implement last, extensive test coverage |
| Privy + Biconomy compatibility | MEDIUM | Keep Privy for auth-only, verify no conflicts |
| Base Paymaster v0.6 vs Biconomy v0.7 | LOW | Use Biconomy's own MEE sponsorship instead |

---

## Estimated Effort

| Phase | Scope | Estimate |
|-------|-------|----------|
| Phase 0: Foundation | Interface + tests | 1 day |
| Phase 1: Protocol Adapters | 3 adapters + registry | 3 days |
| Phase 2: Biconomy Integration | Session manager + executor | 3-4 days |
| Phase 3: API Routes | 8 route updates | 2 days |
| Phase 4: Frontend | Hooks + components | 2 days |
| Phase 5: Decision Engine | Adapter integration | 1 day |
| Phase 6: DB Migration | Schema + migration script | 0.5 days |
| Phase 7: Cleanup | Delete ZeroDev code | 0.5 days |
| **Total** | **~34 files changed** | **~13-14 days** |
