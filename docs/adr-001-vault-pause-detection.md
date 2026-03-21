# ADR-001: Vault Pause Detection

**Status:** Proposed
**Date:** 2026-03-20
**Author:** Engineering Team

## Context

Tapioca Finance deposits user funds into ERC-4626 vaults across multiple DeFi protocols (Morpho, YO Protocol, Aave, Moonwell). Vault operators can pause deposits or redeems at any time via guardian controls, typically during security incidents or protocol upgrades.

**Current state:** Zero pause detection. Paused vaults are only caught when deposit/redeem simulations revert at execution time. This creates:

- Poor UX: users see a generic error instead of a clear "vault paused" message
- Agent waste: the autonomous rebalance agent evaluates paused vaults, attempts deposits, and fails
- No proactive visibility: the dashboard shows paused vaults as normal opportunities

## Decision

Implement a **cross-protocol pause detection layer** using Domain-Driven Design, with protocol-specific adapters behind a shared interface and an in-memory TTL cache.

### Architecture

```
Morpho Context              YO Context
pause-checker.ts            pause-checker.ts
(on-chain paused())         (on-chain paused())
        |                          |
        +--- VaultPauseChecker ----+   (shared port)
                    |
          pause-service.ts             (application service + cache)
           /            \
  decision-engine     API route / UI
  (filters paused)    (enriches response)
```

### Key Design Choices

**1. Shared value object, not protocol type extension**

Pause state is a runtime on-chain check, not a property from the API/SDK. Mixing it into `YoVault` or `MorphoVault` types would violate bounded context boundaries.

```typescript
// lib/shared/vault-pause-state.ts
interface VaultPauseState {
  address: `0x${string}`;
  paused: boolean;
  depositPaused: boolean;   // some vaults pause deposits/redeems independently
  redeemPaused: boolean;
  checkedAt: number;        // for TTL cache freshness
}
```

**2. Protocol-specific adapters behind a shared port**

Each protocol implements `VaultPauseChecker`, translating its pause mechanism into the shared `VaultPauseState` value object.

```typescript
// lib/shared/vault-pause-checker.ts
interface VaultPauseChecker {
  checkPauseStates(addresses: `0x${string}`[]): Promise<VaultPauseState[]>;
}
```

| Protocol | Detection Method | Granularity |
|----------|-----------------|-------------|
| YO Protocol | On-chain `paused()` via `@yo-protocol/core` | Binary |
| Morpho | On-chain `paused()` + GraphQL `warnings[]` | Binary + severity levels |
| Aave/Moonwell | On-chain `paused()` (future) | Binary |

**3. In-memory cache with 60-second TTL**

Pause state changes are rare (guardian action). A 60s in-memory TTL avoids redundant RPC calls without adding Redis complexity. Process-local cache is acceptable for Next.js on Vercel (single process).

**4. Fail-open on error**

If an RPC call fails or a vault doesn't implement `paused()`, assume "not paused". The existing simulation catch in `rebalance-executor.ts` remains as defense-in-depth.

**5. Granular deposit/redeem pause flags**

Some vaults can pause deposits and redeems independently. The decision engine needs both:
- `depositPaused` — "can I deposit into this target vault?"
- `redeemPaused` — "can I exit my current vault?"

The top-level `paused` boolean is the union for simple UI consumption.

## New Files

| File | Layer | Purpose |
|------|-------|---------|
| `lib/shared/vault-pause-state.ts` | Domain | Value object + factory + freshness check |
| `lib/shared/vault-pause-checker.ts` | Domain | Port interface for protocol adapters |
| `lib/shared/pause-service.ts` | Application | Aggregated checking with TTL cache |
| `lib/morpho/pause-checker.ts` | Infrastructure | Morpho on-chain `paused()` adapter |
| `lib/yo/pause-checker.ts` | Infrastructure | YO on-chain `paused()` adapter |

## Modified Files

| File | Change |
|------|--------|
| `hooks/useOptimizer.ts` | Add `paused?: boolean` to `YieldOpportunity` |
| `app/api/optimize/route.ts` | Call `checkVaultPauseStates`, enrich response |
| `lib/agent/decision-engine.ts` | Filter paused vaults from rebalance candidates; block redeem from paused source vault |
| `components/earn-yield/YieldList.tsx` | Gray out paused vaults with badge |
| `components/earn-yield/DepositYield.tsx` | Block deposit with warning UI |

## Integration Points

### Agent Decision Engine

```typescript
// Filter target vaults
const eligibleVaults = allVaults.filter(
  (v) => !pauseStates.get(v.address.toLowerCase())?.depositPaused
);

// Block redeem from paused source
if (currentPauseState?.redeemPaused) {
  return { shouldRebalance: false, reason: "Current vault has redeems paused" };
}
```

### API Route

```typescript
const pauseStates = await checkVaultPauseStates(
  opportunities.map((o) => ({ address: o.address, protocol: o.protocol }))
);
const enriched = opportunities.map((o) => ({
  ...o,
  paused: pauseStates.get(o.address.toLowerCase())?.paused ?? false,
}));
```

### UI Components

- **YieldList:** `opacity-60 cursor-not-allowed` + red "Paused" badge on paused cards
- **DepositYield:** Early return with warning card if `yieldOpportunity.paused`
- **OpportunityCard:** Disable click + muted APY tag when paused

## Alternatives Considered

**1. Extend protocol types directly (`YoVault.paused`, `MorphoVault.paused`)**
Rejected — pause state is a runtime check, not an API property. Would violate bounded context boundaries.

**2. New bounded context (`lib/vault-health/`)**
Rejected — over-engineering. Pause state is a simple vault property, not a domain concept with its own aggregates or lifecycle.

**3. Redis cache instead of in-memory**
Rejected — adds infrastructure complexity for minimal benefit. Pause events are rare. 60s in-memory TTL is sufficient. If multi-process becomes relevant, revisit.

**4. Only rely on simulation catch (current behavior)**
Rejected — reactive approach gives poor UX and wastes agent compute. Proactive detection is strictly better.

## Consequences

**Positive:**
- Users see clear "vault paused" messaging instead of generic errors
- Agent skips paused vaults entirely, reducing failed transaction attempts
- Dashboard reflects real vault availability
- Defense-in-depth: simulation catch remains as fallback

**Negative:**
- Adds 1 RPC read per vault per 60 seconds (cached)
- Vaults without `paused()` function silently pass through (fail-open)
- In-memory cache is process-local (no cross-process sharing on Vercel)

**Risks:**
- Some vault implementations may use non-standard pause function signatures. Mitigation: try multiple ABIs, fall back to "not paused".
- RPC rate limits if many vaults are checked simultaneously. Mitigation: `Promise.allSettled` + batch grouping.

## References

- [OpenZeppelin Pausable](https://docs.openzeppelin.com/contracts/5.x/api/utils#Pausable)
- [ERC-4626 Tokenized Vault Standard](https://eips.ethereum.org/EIPS/eip-4626)
- `@yo-protocol/core` — exports `isPaused(publicClient, vaultAddress)`
- Morpho MetaMorpho guardian system
