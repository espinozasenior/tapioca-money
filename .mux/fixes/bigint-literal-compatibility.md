# BigInt Literal Compatibility Fix

## Problem

All new yield optimizer files used BigInt literals (`0n`, `1n`, etc.) which require ES2020+ target, but the project was configured for ES2017.

**Error**: "BigInt literals are not available when targeting lower than ES2020"

## Solution

Updated `tsconfig.json` to target **ES2020** instead of ES2017.

### Change Made

```json
{
  "compilerOptions": {
    "target": "ES2020",  // was: "ES2017"
    ...
  }
}
```

## Files Affected by BigInt Literals

- `lib/yield-optimizer/types.ts` - Type definitions with BigInt
- `lib/yield-optimizer/protocols/morpho.ts` - Deposit/withdraw amounts
- `lib/yield-optimizer/protocols/aave.ts` - Balance queries
- `lib/yield-optimizer/protocols/moonwell.ts` - Token amounts
- `lib/yield-optimizer/strategy/evaluator.ts` - Cost calculations
- `components/earn-yield/AutoOptimize.tsx` - UI integration
- `hooks/useOptimizer.ts` - API response handling

## Why ES2020?

- ✅ Supports BigInt literals (ES2020 feature)
- ✅ Still widely supported by modern browsers (>95%)
- ✅ Required for Web3/blockchain operations
- ✅ No impact on Next.js build process

## Verification

All BigInt uses are now valid:

- `0n` literals
- `BigInt(...)` constructor
- Numeric operations on bigints
