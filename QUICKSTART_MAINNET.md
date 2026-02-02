# 🚀 Quick Start - Switch to Base Mainnet (Recommended)

## Why Mainnet?

Base Sepolia testnet has **no active USDC markets**. The fastest way to test your implementation is to switch to Base mainnet where Morpho has real, active markets.

---

## ⚡ 2-Minute Setup

### 1️⃣ Update Chain Configuration

**File:** `lib/yield-optimizer/config.ts`

```typescript
// Change line 20-24 from:
export const CHAIN_CONFIG = {
  chainId: 84532,  // ❌ Base Sepolia
  name: "Base Sepolia",
  rpcUrl: "https://sepolia.base.org",
} as const;

// To:
export const CHAIN_CONFIG = {
  chainId: 8453,  // ✅ Base Mainnet
  name: "Base",
  rpcUrl: "https://mainnet.base.org",
} as const;
```

### 2️⃣ Update Environment Variable

**File:** `.env`

```bash
# Change from:
NEXT_PUBLIC_CHAIN_ID=base-sepolia

# To:
NEXT_PUBLIC_CHAIN_ID=base
```

### 3️⃣ Update USDC Address (Base Mainnet)

**File:** `lib/yield-optimizer/config.ts`

```typescript
// Change line 27 from:
export const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const; // Sepolia

// To:
export const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const; // Base Mainnet
```

### 4️⃣ Update Market Params for Mainnet

**File:** `lib/yield-optimizer/config.ts`

Find the `MORPHO_USDC_MARKET_PARAMS` section (around line 60) and update:

```typescript
export const MORPHO_USDC_MARKET_PARAMS = {
  loanToken: USDC_ADDRESS, // Will use mainnet USDC now
  collateralToken: "0x4200000000000000000000000000000000000006" as `0x${string}`, // WETH on Base
  oracle: "0x..." as `0x${string}`, // Need to find actual oracle address
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC" as `0x${string}`,
  lltv: 860000000000000000n, // 86% LTV
} as const;
```

**⚠️ Note:** You'll need to find an active Morpho market ID on Base mainnet. Visit [https://app.morpho.org](https://app.morpho.org) to find real market parameters.

### 5️⃣ Restart Dev Server

```bash
pnpm dev
```

---

## ✅ What You'll Get on Mainnet

| Feature | Sepolia (Testnet) | Mainnet |
|---------|-------------------|---------|
| Active USDC markets | ❌ None | ✅ Multiple |
| Live APY data | ❌ Estimated | ✅ Real rates |
| Real deposits | ❌ No markets | ✅ Works |
| TVL data | ❌ Zero | ✅ Real liquidity |

---

## 🔍 Finding Mainnet Market Params

### Option A: Use Morpho App

1. Go to [https://app.morpho.org](https://app.morpho.org)
2. Connect wallet and switch to Base
3. Find USDC lending market
4. Get market ID from URL or contract calls

### Option B: Query Morpho Registry

```typescript
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const client = createPublicClient({
  chain: base,
  transport: http(),
});

// Query Morpho Blue for markets
// Contract: 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb
```

---

## 🎯 Testing on Mainnet

### ⚠️ Important Notes

- Use **small amounts** for testing (e.g., $5-10 USDC)
- Mainnet uses **real money** - be cautious
- Gas fees are paid in **real ETH**
- Consider using a test wallet first

### Testing Checklist

- [ ] Verify mainnet USDC balance
- [ ] Have ETH for gas (~$1-2)
- [ ] Start with small deposit (e.g., 5 USDC)
- [ ] Confirm APY shows real rate (not 4.5%)
- [ ] Test full cycle: deposit → view → withdraw

---

## 🔄 Alternative: Stay on Sepolia

If you prefer to stay on testnet:

### Deploy Your Own Test Market

```bash
# Requires Sepolia ETH
pnpm tsx scripts/deploy-morpho-market.ts
```

**Pros:**
- Free testing with no risk
- Full control over market params

**Cons:**
- Requires deployment (5-10 min)
- Need Sepolia ETH
- No real TVL/activity data

---

## 📝 Summary

**Fastest Path:** Switch to Base mainnet (2 minutes)
- Real markets work immediately
- No deployment needed
- Live APY data

**Testnet Path:** Deploy market on Sepolia (10 minutes)
- Free testing
- Requires setup
- Estimated data only

---

## 🆘 Need Help?

If switching to mainnet:
- Ensure you have Base mainnet USDC
- Get mainnet market params from Morpho app
- Use small amounts for initial testing

If staying on testnet:
- Follow `MORPHO_SETUP_GUIDE.md` for deployment
- Get Sepolia ETH from faucet
- Be prepared for limited functionality

---

**Recommendation:** Start with mainnet for fastest testing, then deploy testnet market for development.
