# Research: EIP-7702 External Wallet Delegation with ZeroDev

## Executive Summary

**Tapioca already has ~80% of the external wallet code written.** The backend functions exist and are tested. The missing piece is **UI wiring** in `useOptimizer.ts` — branching on wallet type to call the external wallet flow instead of the Privy-only path.

---

## The Core Problem

viem's `signAuthorization` only works with **local accounts** (private key in memory). JSON-RPC accounts (MetaMask, Brave, Rabby) get `AccountTypeNotSupportedError`. Per viem maintainers: _"It is not possible to sign an authorization over JSON-RPC right now, so it won't be added into Viem until there is an ERC for it."_ (github.com/wevm/viem/discussions/3285)

This means **apps cannot call `signAuthorization` on an external wallet**. The wallet must sign the authorization internally.

---

## Two Approaches for External Wallets

### Approach A: Type 4 Transaction (What Tapioca Uses)

The wallet sends a raw EIP-7702 transaction with `authorizationList`. The wallet signs the authorization internally as part of `eth_sendTransaction`.

```
1. App calls eth_sendTransaction with { authorizationList: [{ contractAddress: kernelImpl }] }
2. External wallet prompts user to approve Type 4 tx
3. Wallet signs authorization internally + sends tx
4. Delegation is now on-chain
5. App creates kernel account WITHOUT eip7702Auth (SDK detects on-chain delegation)
6. App creates session key normally
```

**Tapioca already implements this**: `delegateViaExternalWallet()` in `client-secure.ts:484-590`

### Approach B: ERC-5792 / wallet_sendCalls (Pimlico Pattern)

Use wagmi's `useSendCalls` for batched, sponsored transactions. The wallet handles 7702 under the hood.

```typescript
// Pimlico external wallet pattern (from docs.pimlico.io/guides/eip7702/external)
import { useSendCalls } from "wagmi/experimental"
import { useCapabilities } from "wagmi"

// 1. Check capabilities
const { data: capabilities } = useCapabilities()
const supportsBatching = capabilities?.[chainId]?.atomic?.status === "ready"

// 2. Send batched calls - wallet handles 7702 internally
sendCalls({
  calls: [
    { to: tokenAddr, data: encodeFunctionData({...}) },
    { to: vaultAddr, data: encodeFunctionData({...}) },
  ],
  capabilities: {
    paymasterService: { url: pimlicoUrl }
  }
})
```

**Limitation for Tapioca**: This approach doesn't create a persistent session key. Each batch requires wallet approval. Not suitable for agent automation.

---

## ZeroDev SDK Internals (How It Detects Delegation)

From `createKernelAccount.ts` in the ZeroDev SDK source:

```typescript
const signAuthorization = async () => {
  const code = await getCode(client, { address: accountAddress })
  // Check if delegation already on-chain
  if (!code || !code.toLowerCase().startsWith(`0xef0100${implAddress...}`)) {
    // Not delegated yet - need auth
    const auth = eip7702Auth ?? (await signAuthorizationAction(...))
    return auth
  }
  return undefined  // Already delegated, skip auth
}
```

**Key insight**: If `eip7702Auth` is NOT provided AND delegation is already on-chain (bytecode starts with `0xef0100`), the SDK skips authorization entirely. This is exactly what Tapioca's `createAndSerializeAccountExternal()` relies on.

---

## What Tapioca Already Has

### Existing Functions (client-secure.ts)

| Function                              | Lines   | Status              |
| ------------------------------------- | ------- | ------------------- |
| `delegateViaExternalWallet()`         | 484-590 | Implemented, tested |
| `createAndSerializeAccountExternal()` | 601-796 | Implemented, tested |
| `registerAgentSecureExternal()`       | 810-899 | Implemented, tested |

### Existing Tests

```
test("26. delegateViaExternalWallet is exported")
test("27. registerAgentSecureExternal is exported")
test("28. createAndSerializeAccountExternal exists")
test("29. External wallet flow uses authorizationList")
test("30. External wallet registration verifies delegation")
test("31. useOptimizer blocks external wallets")  // <-- This is what needs to change
test("32. External permissions match embedded")
```

### The Blocker (useOptimizer.ts ~line 266)

```typescript
if (activeWallet.walletClientType === "privy") {
  const signedAuth = await signAuthorization({...});
  result = await registerAgentSecure(...);
} else {
  throw new Error("requires your Privy embedded wallet for EIP-7702 signing");
}
```

---

## What Needs to Change

### 1. useOptimizer.ts Registration Mutation

```typescript
const register = useMutation({
  mutationFn: async () => {
    if (activeWalletType === "embedded") {
      // Current Privy flow (unchanged)
      const signedAuth = await signAuthorization({...});
      result = await registerAgentSecure(...);
    } else if (activeWalletType === "external-evm") {
      // NEW: Two-step external flow
      // Step 1: Delegate via Type 4 tx (wallet signs auth internally)
      await delegateViaExternalWallet(walletClient, userAddress, kernelImplAddr);
      // Step 2: Create session key (no eip7702Auth needed - delegation on-chain)
      result = await registerAgentSecureExternal(walletClient, userAddress, ...);
    } else {
      throw new Error("Unsupported wallet type");
    }
  }
})
```

### 2. UI for Two-Step Flow

External wallets require **two separate wallet prompts**:

1. **"Delegate to Smart Account"** — Signs Type 4 tx (sets delegation on-chain)
2. **"Create Session Key"** — Signs enable typed data (creates permission validator)

Need a stepper UI or modal that shows progress through both steps.

### 3. Capability Detection

Already implemented in `delegateViaExternalWallet()` via `wallet_getCapabilities`. Show warning if wallet doesn't support EIP-7702.

---

## Wallet Support Matrix (as of March 2026)

| Wallet          | EIP-7702                    | EIP-5792 (sendCalls) | ERC-7715 (grantPermissions) | Notes                                      |
| --------------- | --------------------------- | -------------------- | --------------------------- | ------------------------------------------ |
| MetaMask v12+   | Via Delegation Toolkit      | Supported            | Via Delegation Toolkit      | Most mature implementation                 |
| Coinbase Wallet | Expected                    | Supported            | Unknown                     | Don't delegate directly to CoinbaseSW impl |
| Rainbow         | Unknown                     | Supported            | Unknown                     |                                            |
| Brave Wallet    | Unknown                     | Unknown              | Unknown                     | Need to test                               |
| Rabby           | Not yet                     | Not yet              | Not yet                     | EOA-only, no AA support                    |
| WalletConnect   | Depends on connected wallet | Depends              | Depends                     |                                            |

---

## ERC-7715 / wallet_grantPermissions (Future Enhancement)

MetaMask's Delegation Toolkit introduces `wallet_grantPermissions` — a standard way for dApps to request scoped permissions from wallets. This is more elegant than Tapioca's current two-step flow:

```
1. App calls wallet_grantPermissions with permission scope
2. Wallet shows permission request to user
3. User approves → wallet delegates via 7702 + grants permissions
4. App can now execute within granted scope
```

**Not actionable now** — ERC-7715 adoption is still early. But worth watching for a future upgrade path.

---

## Recommended Implementation Plan

### Phase 1: Wire External Wallet Flow (Minimal Changes)

1. Remove the `throw` in `useOptimizer.ts` for non-Privy wallets
2. Branch on `activeWalletType` from `useWalletSelection()`
3. Call existing `delegateViaExternalWallet()` → `registerAgentSecureExternal()`
4. Add two-step stepper UI for the registration flow
5. Update test 31 to expect success instead of error

### Phase 2: Capability Detection & Graceful Degradation

1. Use `wallet_getCapabilities` to check EIP-7702 support before starting
2. Show clear error if wallet doesn't support 7702
3. Suggest switching to Privy embedded wallet as fallback

### Phase 3: ERC-7715 Integration (Future)

1. Detect if wallet supports `wallet_grantPermissions`
2. Use single-step permission flow where available
3. Fall back to two-step Type 4 tx flow for older wallets

---

## Key Sources

- viem signAuthorization limitation: github.com/wevm/viem/discussions/3285
- Pimlico external wallet guide: docs.pimlico.io/guides/eip7702/external
- ZeroDev 7702 quickstart: docs.zerodev.app/sdk/getting-started/quickstart-7702
- ZeroDev 7702 examples: 7702.zerodev.app
- EIP-7702 wallet adoption tracker: eip7702.io
- Biconomy 7702 guide: blog.biconomy.io/a-comprehensive-eip-7702-guide-for-apps/
- MetaMask Delegation Toolkit: docs.metamask.io/delegation-toolkit
- ERC-7715 spec: eips.ethereum.org/EIPS/eip-7715
- awesome-eip-7702 list: github.com/fireblocks-labs/awesome-eip-7702
