# Tapioca V2 — User Funds Flow

## Overview

Funds never leave the user's smart account. The smart account directly holds Morpho shares, yoUSD tokens, or PT-yoUSD. There is no shared vault or pool. The agent has scoped permission to move funds between whitelisted protocols within the user's own account.

---

## 1. Onboarding

```
User signs up (email/social)
     |
     v
Privy creates embedded EOA (MPC key sharding)
     |
     v
EIP-7702 delegation --> Biconomy Nexus singleton
(EOA becomes smart account, same address)
     |
     v
Smart Sessions installed --> agent gets scoped permissions
(deposit/redeem/rebalance only, time-boxed, spending limits)

User's address: 0xABC... (works as both EOA and smart account)
```

---

## 2. Funding

```
                                               +------------------+
Option A: MoonPay ACH (~1% fee)                |                  |
  User's bank --ACH--> Virtual bank acct       |                  |
  --> Auto-convert to USDC ----------------+   |                  |
                                           |   |                  |
Option B: MoonPay Card (4.5% fee)          |   |                  |
  Debit/Credit --> MoonPay checkout -------+   |   User's         |
                                           |   |   Biconomy       |
Option C: Coinbase Onramp (Base-native)    |   |   Smart Account  |
  Card/ACH --> Coinbase widget ------------+-->|   0xABC...       |
                                           |   |                  |
Option D: Direct transfer                  |   |   (USDC balance) |
  Any wallet/exchange --> send USDC -------+   |                  |
                                               +------------------+
```

---

## 3. Deposit (Agent or User via CLI)

### Decision Engine evaluates all vaults

```
Safety gates:
  [x] 7-day yield stability (+50%/-30% bounds)
  [x] Pool concentration (<15% of TVL)
  [x] Minimum liquidity ($100k+)
  [x] Risk-adjusted APY (Exponential.fi ratings)
```

### Three deposit paths

**Path A: Morpho Direct (lending)**

```
Batch tx (1 UserOp):
  1. USDC.approve(morphoVault, amount)
  2. morphoVault.deposit(amount, userAddress)

User receives: Morpho vault shares
Yield: variable, from borrower interest
```

**Path B: YO Vault (yield index)**

```
Batch tx (1 UserOp):
  1. USDC.approve(yoGateway, amount)
  2. yoGateway.deposit(amount, userAddress)

User receives: yoUSD (yield-bearing ERC-4626)
Yield: variable, from 100+ underlying strategies
Value accrues via exchange rate increase
```

**Path C: Pendle PT (fixed yield, multi-step)**

```
Batch tx (1 UserOp, 4 internal calls):
  1. USDC.approve(yoGateway, amount)
  2. yoGateway.deposit(amount)            --> get yoUSD
  3. yoUSD.approve(pendleRouter, amount)
  4. pendleRouter.swapExactTokenForPt()   --> get PT-yoUSD

User receives: PT-yoUSD (fixed yield, locked until maturity)
At maturity: 1 PT-yoUSD = 1 yoUSD (+ accrued yield)
```

**Gas**: Sponsored by Tapioca paymaster ($0.002-0.01/tx on Base)
**Auth**: Session key signs UserOp (scoped to allowed selectors only)

---

## 4. Yield Accrual (passive, no user action)

```
Morpho:  Share price increases as borrowers pay interest
YO:      yoUSD exchange rate increases as underlying pools
         generate yield across 100+ strategies
Pendle:  PT-yoUSD purchased at discount, redeems at par
         at maturity (locked-in fixed yield)
```

### Auto-compound cycle (cron, every 4-24h)

```
1. Check: accumulated rewards > $5?
   (MORPHO, FLUID, TOKE, WELL tokens)
   |
   v YES
2. Claim reward tokens from protocols
   |
   v
3. Swap rewards --> USDC (via DEX, check liquidity)
   |
   v
4. Redeposit USDC into current best vault
   (compounds user's position automatically)

Gas: sponsored
Fee: 0% initially, 5-10% later
Fee taken as: mint protocol shares at harvest
(user sees after-fee APY, never sees fee tx)
```

---

## 5. Rebalancing (agent-driven, no user action)

### Decision Engine runs every 4h via cron

```
1. Fetch current position APY (trailing 7-day avg)
2. Fetch all available vault APYs
3. Apply safety gates:
   - Yield stability check (7-day bounds)
   - Pool concentration limit (<15% TVL)
   - TVL drop emergency exit (>50% drop)
4. Compare: best_target_apy - current_apy > 0.5%?
5. Trend confirmation: advantage sustained 8-12h?
```

### If YES --> execute rebalance

```
+----------+  redeem   +----------+  deposit   +----------+
| Current  |---------->|  USDC    |----------->|  Best    |
| vault    |           |  in smart|            |  vault   |
| (Morpho) |           |  account |            |  (YO/PT) |
+----------+           +----------+            +----------+

All in 1 UserOp (batch tx via session key)
```

### Emergency triggers

```
TVL drop >50%  --> auto-exit to USDC in wallet
Depeg >5%      --> auto-exit to USDC in wallet
Oracle failure --> auto-exit to USDC in wallet
(defensive "go to cash" posture)
```

---

## 6. Withdrawal (user-initiated)

**From Morpho: Instant**

```
Morpho shares --redeem--> USDC --> user's wallet
```

**From YO: Instant (if liquidity) or queued (up to 24h)**

```
yoUSD --redeem--> USDC --> user's wallet
(async: auto-delivered when fulfilled by operators)
```

**From Pendle PT:**

```
Before maturity: sell PT on Pendle AMM
  PT-yoUSD --> yoUSD --> USDC (some slippage)

After maturity: redeem 1:1
  PT-yoUSD --> yoUSD --> USDC (no slippage)
```

**Off-ramp to fiat (optional):**

```
USDC in wallet --MoonPay off-ramp--> User's bank account
```

No withdrawal fees. No lockups (except Pendle PT maturity). Gas: sponsored.

---

## Permission Boundaries

### User controls

- Deposit/withdraw anytime
- Revoke agent session (on-chain, instant)
- Export private key (via Privy)
- Access funds even if Tapioca is offline (smart account is on Base, use any wallet)

### Agent can do

- Deposit into whitelisted vaults
- Redeem from whitelisted vaults
- Approve tokens for whitelisted contracts
- Claim and swap reward tokens

### Agent cannot do

- Transfer USDC to other addresses
- Interact with non-whitelisted contracts
- Exceed spending limits
- Operate after session expires (30 days)

---

## Fee Flow (at scale)

```
User deposits $10,000 USDC
     |
     v
Agent deposits into Morpho vault earning 6% APY
     |
     v
After 1 year: $600 yield generated
     |
     v
At each harvest:
  |-- 90% ($540) --> compounds back into user's position
  |-- 10% ($60)  --> minted as vault shares to Tapioca treasury
     |
     v
User sees: 5.4% APY displayed (after fee)
User never sees a "fee" transaction
Tapioca earns: 0.6% of TVL annually
```

### Fee phases

| Phase       | TVL     | Fee Rate | User Sees     |
| ----------- | ------- | -------- | ------------- |
| Growth      | $0-10M  | 0%       | Full APY      |
| Transition  | $10-50M | 5%       | 95% of APY    |
| Sustainable | $50M+   | 7-10%    | 90-93% of APY |

---

## Summary: Where Funds Live at Each Stage

| Stage              | Location             | Token Held          | Who Controls                 |
| ------------------ | -------------------- | ------------------- | ---------------------------- |
| Funded             | User's smart account | USDC                | User                         |
| Deposited (Morpho) | User's smart account | Morpho vault shares | User (agent can rebalance)   |
| Deposited (YO)     | User's smart account | yoUSD               | User (agent can rebalance)   |
| Deposited (Pendle) | User's smart account | PT-yoUSD            | User (agent can rebalance)   |
| Rebalancing        | User's smart account | USDC (momentarily)  | Agent (within session scope) |
| Withdrawn          | User's smart account | USDC                | User                         |
| Off-ramped         | User's bank account  | USD                 | User                         |

Funds are always in the user's smart account. Never in a shared pool, never in Tapioca's custody.
