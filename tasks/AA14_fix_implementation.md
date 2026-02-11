# AA14 Smart Account Deployment Fix - Implementation Complete

## Summary

Fixed the "AA14 initCode must return sender" error that prevented users from executing their first vault deposit after agent registration.

## Root Cause

The smart account creation flow was not handling the first deployment:
1. During registration, ZeroDev SDK computes a counterfactual address (account not deployed)
2. During first deposit, SDK was told the account exists (`address: params.smartAccountAddress`)
3. SDK assumed account was deployed and didn't generate initCode
4. EntryPoint couldn't find the account at that address → AA14 error

## Solution Implemented

**File**: `lib/zerodev/kernel-client.ts`

### Changes:
1. **Import** (line 9): Added `checkSmartAccountActive` helper function
2. **Deployment check** (lines 68-74): Check if account has bytecode deployed on-chain
3. **Conditional address parameter** (lines 76-93): Only pass address to SDK if account is already deployed

### How It Works:

```
First Deposit (Account Not Deployed):
┌─────────────────────────────────────────────────────┐
│ 1. Create session key & permission validator        │
│ 2. Check: Is account deployed? → NO                 │
│ 3. Omit address parameter                           │
│ 4. SDK generates initCode (factory + factoryData)   │
│ 5. Bundler deploys account + executes deposit       │
│ 6. Success! Account now deployed                    │
└─────────────────────────────────────────────────────┘

Subsequent Deposits (Account Deployed):
┌─────────────────────────────────────────────────────┐
│ 1. Create session key & permission validator        │
│ 2. Check: Is account deployed? → YES                │
│ 3. Pass address parameter                           │
│ 4. SDK reuses existing account (no initCode)        │
│ 5. Bundler executes deposit                         │
│ 6. Success! Faster, no redeployment                │
└─────────────────────────────────────────────────────┘
```

## Verification

### Expected Logs on First Deposit:
```
[KernelClient] Account deployment status: {
  address: "0x...",
  isDeployed: false
}
[KernelClient] Account not deployed yet - SDK will generate initCode
[KernelClient] ✓ Address verified: 0x...
```

### Expected Logs on Subsequent Deposits:
```
[KernelClient] Account deployment status: {
  address: "0x...",
  isDeployed: true
}
[KernelClient] Using existing deployed account
[KernelClient] ✓ Address verified: 0x...
```

## Testing Checklist

- [ ] Fresh agent registration completes successfully
- [ ] First vault deposit executes without AA14 error
- [ ] Smart account bytecode visible on Base explorer after first deposit
- [ ] Second deposit completes without redeployment
- [ ] Session key permissions still enforced
- [ ] Address verification still passes

## Related Files

- **Modified**: `lib/zerodev/kernel-client.ts`
- **Dependencies**: `lib/zerodev/client-secure.ts` (checkSmartAccountActive helper)
- **Callers**: `lib/zerodev/deposit-executor.ts` (uses createSessionKernelClient)
- **Entry point**: `app/api/vault/deposit/route.ts`

## Commit

```
beeb0b9 fix: conditionally deploy smart account on first deposit
```

## Performance Impact

- **Added latency**: One `getBytecode()` RPC call per deposit (~50-200ms)
- **Total deposit time**: Still 3-5 seconds (minimal impact)
- **Optimization opportunity**: Cache deployment status in database after first success

## Rollback

If issues arise:
1. Revert to always passing `address` parameter (pre-fix behavior)
2. Or add feature flag `FORCE_ADDRESS_PARAMETER=true`
