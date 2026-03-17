# Tapioca Finance V2 Strategy

## Deep Research Report -- March 2026

---

## Executive Summary

Tapioca Finance must evolve from a frontend-first yield optimizer into a **CLI-first, agent-native platform**. The DeFi agent landscape has crystallized: every major player (MoonPay, Uniswap, Google Workspace, Binance) ships CLI + Skills + MCP. Tapioca has the core logic but no agent-accessible surface.

**Core thesis preserved:** Non-custodial yield optimization via agent automation.

**What changes:** The interface layer, wallet infrastructure, revenue model, and distribution strategy.

### Key Decisions

| Decision            | Choice                                                | Rationale                                                              |
| ------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| Primary interface   | CLI-first (`tapioca` CLI)                             | Agents are the distribution channel; CLI has 35x fewer tokens than MCP |
| Wallet infra        | Privy embedded + Biconomy MEE + Smart Sessions        | Solves re-registration pain, adds cross-chain, composable permissions  |
| Revenue model       | Invisible 10% performance fee (ERC-4626 harvest)      | Proven by Beefy (5+ years), invisible to users                         |
| Fiat on-ramp        | MoonPay as funding rail (ACH ~1%)                     | Send USDC to Biconomy smart account address                            |
| Agent distribution  | SKILL.md + MCP server + ClawHub                       | Every AI agent (Claude, GPT, Gemini) can discover and use Tapioca      |
| New wallet per user | Privy creates embedded EOA + Biconomy 7702 delegation | Simple UX, non-custodial, fiat-compatible                              |

---

## 1. Competitive Landscape Analysis

### Benchmark Matrix

| Product           | Infra Model                | Revenue                | Self-Custody | Multi-Protocol            | CLI/Agent         | Differentiator                                               |
| ----------------- | -------------------------- | ---------------------- | ------------ | ------------------------- | ----------------- | ------------------------------------------------------------ |
| **YO**            | On-chain vaults (ERC-4626) | 0% (VC funded)         | Yes          | Yes (cross-chain)         | CLI (unreleased?) | Best infra, $80M TVL, tokenized yield (yoTokens)             |
| **Giza/ARMA**     | Smart account + optimizer  | 10% perf fee           | Yes          | Yes                       | No                | MILP optimizer models yield curves per-deposit-size          |
| **Zyfai**         | Safe7579 + Rhinestone      | 10% perf fee           | Yes          | Yes                       | SDK + MCP         | ZK proofs per rebalance (ERC-8004), capital splitting        |
| **KOPS**          | Coinbase TEE + ZK proofs   | 15% perf fee           | Yes          | Limited                   | No                | Verifiable actions via ZK-proofs                             |
| **Mamo**          | Custom contracts           | 0% (Aerodrome revenue) | Yes          | Limited (Moonwell+Morpho) | No                | Simplest UX, open-source contracts                           |
| **Sail**          | Thirdweb 7702              | 0% (pre-revenue)       | Yes          | Yes                       | Chat agent        | Best personalization (per-user agent), Sonar risk monitoring |
| **Goldbot Sachs** | ERC-4626 wrapper           | 10% harvest dilution   | Yes          | Single (Beefy)            | Skill file        | Simplest architecture (1 contract)                           |

### Competitive Moats Worth Building

1. **CLI + Skills distribution** -- No competitor has published agent skills. First mover advantage.
2. **Multi-step strategies via agent composition** -- USDC -> yoUSD -> PT-yoUSD is a unique pipeline.
3. **Fiat-to-yield pipeline** -- ACH deposit -> auto-convert -> agent manages yield. Sail has card onramp, nobody has ACH.
4. **Biconomy Smart Sessions** -- Composable permissions (add protocols without re-registration).
5. **Gasless on Base** -- ~$0.002/tx, sponsor indefinitely.

### What Tapioca Should NOT Try to Build

- **On-chain vault contracts** (YO/Mamo territory) -- be an aggregator, not a protocol
- **ZK proof system** (Zyfai/KOPS territory) -- adds complexity, unclear user value
- **Autonomous self-replicating agents** (Conway territory) -- different product category
- **Token with complex tokenomics** -- keep it simple, fee-based revenue first

---

## 2. Architecture: CLI-First with Frontend Wrapper

### The Pattern

Every major player ships the same architecture:

```
Agent Skills (SKILL.md)     <- Strategy instructions for AI agents
       |
       v
    CLI (`tapioca`)          <- Primitive operations (11 commands)
       |
       v
   MCP (`tapioca mcp`)      <- Structured JSON-RPC wrapper over CLI
       |
       v
   Core Library              <- @tapioca/core (protocol adapters, executors)
       |
       v
   Next.js Frontend          <- Web UI wrapping the same core library
```

This is how MoonPay does it (`mp` -> `mp mcp` -> web chat), how Google Workspace does it (`gws` -> `gws mcp`), and how Uniswap does it (7 agent skills).

### Minimum Viable CLI

```
tapioca auth login              # Wallet file or env var
tapioca auth status             # Connected wallet, agent status

tapioca yields list             # All available yields (JSON)
tapioca yields list --fields "apy,tvl,protocol,address"

tapioca positions list          # Current positions with values
tapioca positions list --protocol morpho

tapioca deposit <vault> <amount> --dry-run    # Preview
tapioca deposit <vault> <amount>              # Execute

tapioca redeem <vault> <amount> --dry-run
tapioca redeem <vault> <amount>

tapioca optimize                # Run decision engine, suggest rebalance
tapioca optimize --execute      # Auto-execute
tapioca optimize --auto         # Enable recurring auto-optimization

tapioca schema <command>        # Machine-readable schema for any command

tapioca mcp                     # Start MCP server (all commands as JSON-RPC)
```

11 commands mapping directly to existing code:

- `yields list` -> `YieldDecisionEngine` + protocol API clients
- `positions list` -> Protocol position readers
- `deposit`/`redeem` -> Executor files
- `optimize` -> `YieldDecisionEngine.evaluate()` + `RebalanceExecutor`
- `schema` -> Runtime introspection

### CLI Design Principles (for AI agents)

1. **JSON output always** -- `--format table` for humans, JSON default
2. **Runtime schema introspection** -- `tapioca schema deposit` returns machine-readable args
3. **Context window discipline** -- `--fields` for field masks, pagination
4. **`--dry-run` on all mutations** -- agents validate before executing
5. **Structured errors** -- consistent JSON error schema
6. **Skill files ship with CLI** -- SKILL.md files teach agents how to compose commands

### Agent Skill Files

```yaml
# skills/yield-optimizer/SKILL.md
---
name: tapioca-yield-optimizer
description: Optimizes DeFi yield across Morpho, YO, and Pendle on Base.
  Use when depositing, withdrawing, rebalancing, or checking yield strategies.
license: MIT
metadata:
  author: tapioca-finance
  version: "1.0"
allowed-tools: Bash(tapioca:*) Read
---

## Deposit USDC into best yield
1. Run `tapioca yields list --fields "address,apy,protocol,tvl"`
2. Select vault with highest APY and TVL > $1M
3. Run `tapioca deposit <vault> <amount> --dry-run`
4. If gas < 0.1% of deposit, run `tapioca deposit <vault> <amount>`

## Multi-step Pendle PT deposit
1. Run `tapioca yields list --protocol pendle --fields "address,apy,maturity"`
2. Select PT with highest fixed APY and maturity > 30 days
3. Run `tapioca deposit <pt-vault> <amount> --dry-run`
4. Executor handles 4-call batch: approve USDC -> YO deposit -> approve yoUSD -> Pendle swap

## Check positions
Run `tapioca positions list` to see all active positions with current values.

## Rebalance
Run `tapioca optimize` to get recommendations, then `tapioca optimize --execute` to act.
```

### Auth in CLI Context

Three tiers matching the ecosystem patterns:

1. **Env var** (agents): `TAPIOCA_SESSION_KEY` -- the Biconomy session key
2. **Wallet file** (power users): Encrypted keystore in `~/.tapioca/wallet.json`
3. **Web-based** (retail): Privy auth -> session key stored server-side (current model)

### Agent Discovery

Host `/.well-known/agent-card.json` for A2A protocol discovery:

```json
{
  "name": "Tapioca Finance",
  "description": "Non-custodial yield optimizer on Base",
  "url": "https://tapioca.finance",
  "skills": [
    {
      "id": "yield-optimizer",
      "name": "Yield Optimization",
      "description": "Deposit, withdraw, rebalance across Morpho, YO, Pendle"
    }
  ]
}
```

Publish skills to ClawHub (13,729+ skills, the npm for agents).

---

## 3. Wallet Infrastructure: Biconomy MEE + Smart Sessions

### Why Switch from ZeroDev

| Pain Point (Current)                              | Biconomy Solution                                                                   |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Manual (target, selector) pairs per protocol      | Smart Sessions: `grantPermission()` with modular policies                           |
| Re-registration required on any permission change | Incremental `grantPermission()` -- add protocols without touching existing sessions |
| 3 registration paths (7702, external, 4337)       | 1 unified path (ERC-7579 Smart Sessions)                                            |
| Custom undelegation flow (relayer + Type 4 tx)    | On-chain session revocation via module call                                         |
| No cross-chain execution                          | MEE Supertransactions: single signature spans chains                                |
| Manual UserOp construction                        | MEE orchestrator handles sequencing                                                 |

### SDK Migration

```
REMOVE                              ADD
@zerodev/sdk                ->      @biconomy/abstractjs (v1.1.20)
@zerodev/permissions        ->      (built into abstractjs)
@zerodev/ecdsa-validator    ->      (built into abstractjs)
@zerodev/session-key        ->      (Smart Sessions module)
```

### New Wallet Creation Flow

```
User signup (email/social)
    |
    v
Privy creates embedded EOA (MPC key sharding)
    |
    v
App signs EIP-7702 auth -> delegates to Biconomy Nexus singleton
    (0x000000004F43C49e93C970E84001853a70923B03)
    |
    v
Smart Sessions module installed -> grantPermission() with:
    - Morpho: deposit/redeem selectors, USDC spending limit
    - YO: gateway deposit/redeem
    - Pendle: router V4 selectors
    - Time bound: 30 days
    |
    v
Agent operates within session scope
    |
    v
Adding new protocol: just call grantPermission() again
    (user signs once, no re-registration)
```

### Smart Session Policies

```typescript
// Example: grant Tapioca agent permissions
const response = await nexusSessionClient.grantPermission({
  sessionRequestedInfo: [
    {
      sessionPublicKey: agentSigner.address,
      actionPoliciesInfo: [
        // Morpho deposits
        {
          contractAddress: MORPHO_VAULT,
          functionSelector: "0x6e553f65", // deposit(uint256,address)
          rules: [],
        },
        // Morpho redeems
        {
          contractAddress: MORPHO_VAULT,
          functionSelector: "0xba087652", // redeem(uint256,address,address)
          rules: [],
        },
        // YO gateway
        {
          contractAddress: YO_GATEWAY,
          functionSelector: "0x...", // deposit selector
          rules: [],
        },
        // USDC approve (for any vault)
        {
          contractAddress: USDC_ADDRESS,
          functionSelector: "0x095ea7b3", // approve(address,uint256)
          rules: [],
        },
      ],
      // Time and spending limits
      sessionValidAfter: Math.floor(Date.now() / 1000),
      sessionValidUntil: Math.floor(Date.now() / 1000) + 30 * 86400, // 30 days
    },
  ],
});
```

### Cross-Chain (Future)

When Tapioca expands beyond Base, MEE Supertransactions enable:

- Single user signature -> bridge + swap + deposit across chains
- Orchestrator handles timing, confirmation, and dependencies
- No change to CLI interface (executor handles it internally)

### Biconomy DAN Status

DAN (Delegated Authorization Network) appears **superseded by Smart Sessions + MEE**. Not recommended for integration. The current docs don't reference DAN; Smart Sessions are the production path.

### PREP Accounts (Watch)

Biconomy's PREP (Provably Rootless EIP-7702 Proxy) creates smart accounts where the EOA key is **provably unknown** (cracking requires 2^103 operations). Not production-ready yet (Nexus 2.0). Revisit when it ships -- it would eliminate the Privy dependency for wallet creation.

---

## 4. Revenue Model: Invisible Performance Fee

### Recommended 3-Phase Approach

| Phase                    | TVL     | Fee               | Gas       | Revenue/Month      |
| ------------------------ | ------- | ----------------- | --------- | ------------------ |
| **Growth** (0-$10M)      | $0-10M  | 0%                | Sponsored | $0 (runway funded) |
| **Transition** ($10-50M) | $10-50M | 5% performance    | Sponsored | $4k-21k            |
| **Sustainable** ($50M+)  | $50M+   | 7-10% performance | Sponsored | $29k-42k+          |

### Why This Model

- **Invisible to users**: Fee taken at harvest via ERC-4626 share dilution. Users see "4.8% APY" not "5.3% APY minus 10% fee"
- **Aligned incentives**: Protocol earns only when users earn
- **Proven**: Beefy has operated profitably for 5+ years at $200M+ TVL with 9.5% performance fee
- **No withdrawal friction**: Unlike Giza's early exit penalty
- **No token dependency**: Unlike Mamo's Aerodrome revenue

### Implementation

```
Harvest cycle:
1. Claim rewards from underlying protocols (MORPHO, WELL, etc.)
2. Calculate yield since last harvest
3. Mint (yield * feeBps / 10000) as new vault shares to protocol treasury
4. Compound remaining yield back into positions
5. Share price reflects after-fee returns
```

Users never see a fee transaction. The displayed APY already accounts for it.

### Gas Sponsorship Budget

Base L2 gas is extremely cheap:

| Users  | Rebalances/day | Monthly Gas Cost |
| ------ | -------------- | ---------------- |
| 100    | 1              | $6-30            |
| 1,000  | 1              | $60-300          |
| 10,000 | 1              | $600-3,000       |

**Maintain gasless UX indefinitely.** At $300/month for 1,000 users, this is the highest-ROI UX investment possible.

### Yield Context (Base USDC, March 2026)

| Protocol                | APY Range |
| ----------------------- | --------- |
| Morpho (curated vaults) | 4-10.7%   |
| Aave V3                 | 4-7%      |
| Moonwell                | 3-8%      |
| Fluid                   | 3-6%      |
| Compound V3             | 3-5%      |

Optimizer captures 1-3% spread between worst and best. At 6% average yield, 10% fee = 0.6% of TVL annually.

### Breakeven Analysis

At 10% performance fee, 5% average yield:

- **$10M TVL**: $4.2k/month -- skeleton crew only
- **$25M TVL**: $10.4k/month -- lean team
- **$50M TVL**: $20.8k/month -- breakeven
- **$100M TVL**: $41.7k/month -- comfortable

---

## 5. Fiat On-Ramp: MoonPay as Funding Rail

### Integration Architecture

```
User creates Biconomy smart account
    |
    v
User funds via MoonPay (3 options):
    |
    +-- Option A: On-ramp widget (walletAddress = smart account)
    |   -> Card (4.5%) or ACH (1%)
    |   -> USDC sent directly to smart account on Base
    |
    +-- Option B: Virtual bank account (lowest friction for recurring)
    |   -> KYC required
    |   -> Real routing/account numbers created
    |   -> ACH/Wire/SEPA -> auto-convert to USDC
    |   -> Sent to registered smart account address
    |   -> NOTE: Base may not be supported yet for VA deposits
    |            May need Arbitrum + bridge
    |
    +-- Option C: MoonPay Balance (0% fee)
        -> Pre-fund MoonPay balance
        -> Transfer to smart account
    |
    v
Agent manages yield automatically
```

### Key Findings

- MoonPay creates **plain EOA wallets** (BIP39 HD), NOT smart accounts
- Use MoonPay purely as a **funding rail**, not as wallet infra
- `walletAddress` parameter in both widget and Virtual Account API accepts any address (including Biconomy smart accounts)
- ACH at ~1% is significantly cheaper than card at 4.5%
- Virtual bank accounts require KYC + Proof of Address
- **Chain support caveat**: Virtual account stablecoin destinations explicitly support Ethereum/Solana/Arbitrum. Base support needs verification.
- MCP integration available via `mp mcp` -- potential for agent-driven funding

### Competitive Advantage

No competitor offers ACH -> yield pipeline:

- **Sail**: Card onramp only (Coinbase, Stripe, Transak)
- **Mamo**: No built-in onramp
- **Zyfai**: No built-in onramp
- **KOPS**: No built-in onramp

If MoonPay virtual accounts work with Base, Tapioca becomes: "Set up ACH recurring deposit -> your money automatically earns yield -> withdraw anytime." That's a savings account UX.

### Alternative: Coinbase Onramp

If MoonPay virtual accounts don't support Base:

- Coinbase Onramp SDK (`@coinbase/onramp-sdk`) natively supports Base USDC
- Simpler integration, fewer features
- No virtual bank account / ACH recurring option

---

## 6. Implementation Roadmap

### Phase 1: Extract Core Library (3-4 days)

Create `@tapioca/core` package with zero frontend dependencies:

```
packages/core/
  src/
    adapters/
      types.ts           # ProtocolAdapter interface (from v2 plan)
      morpho-adapter.ts  # Extract from lib/morpho/
      yo-adapter.ts      # Extract from lib/yo/
      pendle-adapter.ts  # Extract from lib/pendle/
      registry.ts        # Adapter registry
    agent/
      decision-engine.ts # Extract from lib/agent/
      rebalance.ts       # Extract from lib/agent/
    config.ts            # Chain config
```

Reuse existing `lib/morpho/api-client.ts`, `lib/yo/api-client.ts`, `lib/pendle/api-client.ts` as-is.

### Phase 2: Biconomy Migration (5-6 days) -- PRIORITY

Following the existing v2-migration-plan.md structure:

1. **Session Manager** (`lib/biconomy/session-manager.ts`)

   - `createSession()` -- install Smart Sessions, grant permissions from adapter registry
   - `resumeSession()` -- reconstruct from encrypted storage
   - `revokeSession()` -- on-chain revocation
   - `addPermissions()` -- incremental grant (new!)

2. **Execution Client** (`lib/biconomy/execution-client.ts`)

   - `createSessionClient()` -- decrypt, resume
   - `executeBatch()` -- batched tx via session
   - Replaces `createDeserializedKernelClient`

3. **Unified Executor** (`lib/biconomy/executor.ts`)

   - `executeDeposit(session, adapterId, amount)`
   - `executeWithdraw(session, adapterId, amount)`
   - `executeRebalance(session, from, to, amount)`
   - Replaces 7 executor files

4. **Registration Flow** -- single path via `grantPermission()`

### Phase 3: Build CLI (3-4 days)

```
packages/cli/
  src/
    commands/
      auth.ts     # login, status
      yields.ts   # list
      positions.ts # list
      deposit.ts  # deposit with --dry-run
      redeem.ts   # redeem with --dry-run
      optimize.ts # optimize, --execute, --auto
      schema.ts   # runtime introspection
      mcp.ts      # start MCP server
    index.ts      # commander.js entry point
  skills/
    yield-optimizer/
      SKILL.md
    deposit/
      SKILL.md
```

### Phase 4: MoonPay + Coinbase Onramp Integration (2-3 days)

1. Embed MoonPay on-ramp widget with `walletAddress = agentAddress`
2. Add Coinbase Onramp as fallback (Base-native)
3. Test virtual account USDC delivery to Biconomy smart account
4. If Base not supported for VA, implement Arbitrum receive + bridge

### Phase 5: Frontend Simplification (2-3 days)

- Remove 7702/4337 branching from all components
- Remove undelegation flow (replaced by session revocation)
- Simplify `useWalletSelection` -- `agentAddress` always = Nexus smart account
- Add "Fund via ACH" flow using MoonPay widget
- Display APY after fees (when fee is introduced)

### Phase 6: Agent Distribution (1-2 days)

- Publish skills to ClawHub registry
- Host `/.well-known/agent-card.json`
- Publish `tapioca` to npm
- Create `tapioca mcp` command for MCP server mode

### Phase 7: Revenue Implementation (1 day)

- Add configurable performance fee to harvest cycle
- Set to 0% initially
- Protocol treasury address for fee shares
- Admin function to adjust fee (capped at 15%)

### Total Estimate: ~17-23 days

Execution order: Core -> Biconomy (fix pain points) -> CLI (agent surface) -> MoonPay -> Frontend -> Distribution -> Revenue.

---

## 7. Yield Strategy Mechanisms Analysis

### Competitive Strategy Comparison

| Protocol              | Allocation Model                                           | Rebalance Trigger                                            | Risk Scoring                                           | Auto-Compound                                     | Multi-Step                                       | Unique Mechanism                                           |
| --------------------- | ---------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| **Giza/ARMA**         | Nonlinear optimizer, yield curve modeling per deposit size | Cost-threshold + 7-day APR forecast                          | Pre-flight health checks, EigenLayer AVS               | Dynamic frequency based on position size + gas    | Single-protocol chase (MILP architecture exists) | Deposit-size impact on yield curves                        |
| **YO**                | Index of 100+ pools, weighted allocation                   | Daily + trend confirmation ("confirmed trend before moving") | Exponential.fi risk ratings (thousands of vectors)     | Operators claim+swap reward tokens                | Cross-chain via "embassy" model                  | Risk-adjusted yield with probability-of-default scoring    |
| **Sail**              | Scoring function with APY/TVL/volatility weighting         | Balance-tier frequency (4x/12x/24x per day)                  | Sonar: depeg (5%), TVL drop (20%) alerts               | Full pipeline: claim -> swap -> redeposit         | Cross-chain with cost-aware routing              | CNN meta-controller adapts sensitivity params (unverified) |
| **Zyfai**             | 100% single-protocol, no splitting                         | 5 safety checks (see below)                                  | 15% max pool share, 50% TVL drop exit, 7-day stability | $2 threshold -> claim -> swap -> reinvest         | Cross-chain via OmniAccounts                     | ERC-8004 ZK proof per rebalance                            |
| **Beefy**             | User picks vault (no allocation engine)                    | Gas-cost vs compound-benefit optimization                    | Strategy-level (audited contracts per vault)           | harvest() -> charge fees -> swap -> LP -> restake | Single vault strategies                          | "Harvest on deposit" pattern, EIP-1167 minimal proxies     |
| **Morpho**            | Curator-set allocation caps, bot reallocation              | Utilization equalization (2.5% delta) or APY range bands     | Agent-based simulations (Gauntlet), timelocked params  | Protocol-level (curators handle)                  | Curator-defined market sets                      | Separation of curation from execution                      |
| **Tapioca (current)** | Single-protocol chase, flat APY comparison                 | Fixed 0.5% threshold, no trend confirmation                  | Minimum $100k liquidity filter only                    | None (relies on underlying)                       | USDC -> yoUSD -> PT-yoUSD                        | Multi-protocol pipeline (Morpho+YO+Pendle)                 |

### Zyfai's 5 Safety Checks (Best-in-Class Rebalancing Gate)

1. **Pool Safety**: Agent's share must stay under 15% of target pool TVL
2. **Meaningful Yield**: Delta APY >= 1.0% (100 basis points)
3. **Yield Stability**: 7-day APY must stay within +50%/-30% of its average
4. **Profit vs Cost**: Net gain after gas must be positive (payback period check)
5. **TVL Drop Detection**: If pool TVL drops >50% from previous day, emergency exit

### Giza's Yield Curve Modeling (Most Sophisticated)

Giza doesn't compare flat APY numbers. For each protocol, they:

1. Query ~20 deposit levels to build a yield curve
2. Model how YOUR deposit size shifts the utilization rate
3. Calculate blended APY at your specific deposit amount
4. Compare curves across protocols, not points

Example: Protocol A shows 6% APY, but depositing $1M would push it to 5.2% due to utilization compression. Protocol B shows 5.5% but stays at 5.4% with your deposit. Split: 50/50 yields ~5.3% blended vs 5.2% single-protocol.

This matters most for deposits >$100k where your capital materially moves the curve.

### YO's Risk-Adjusted Yield (Best Risk Framework)

Uses Exponential.fi ratings that calculate **probability of total pool wipeout** from thousands of vectors:

- Protocol age, audit history, code quality
- Governance maturity, counterparty exposure
- Historical reliability, oracle dependencies

Each pool's APY is weighted against its wipeout probability:

```
risk_adjusted_yield = APY * (1 - probability_of_wipeout)
```

The algorithm maximizes risk-adjusted yield, not raw APY. This means a 5% pool with 0.1% wipeout probability (risk-adjusted: 4.995%) beats a 6% pool with 2% wipeout probability (risk-adjusted: 5.88%) -- but not by as much as raw APY suggests.

### How Tapioca's Decision Engine Should Evolve

**Stage 1: Safety Gates (Immediate, ~2 days)**

- Add yield stability check: reject targets with 7-day APY swing >+50%/-30%
- Add pool concentration limit: skip if position would be >15% of pool TVL
- Add TVL drop emergency exit: auto-rebalance to safety if current pool TVL drops >50%
- Use trailing 7-day average APY instead of point-in-time for comparisons

**Stage 2: Smart Triggers (~3 days)**

- Trend confirmation: require sustained APY advantage over 2-3 consecutive cron checks (8-12h)
- Position-size-aware threshold: scale from 0.5% (small) down to 0.2% (large positions)
- Add auto-compounding pipeline: claim MORPHO/FLUID/TOKE rewards -> swap to USDC -> redeposit
- Integrate Exponential.fi risk ratings for pool scoring

**Stage 3: Advanced Strategies (~5 days)**

- Deposit-size yield curve modeling (query protocols at multiple deposit levels)
- Leveraged PT carry trade: borrow Morpho variable -> buy Pendle PT fixed (when spread > 2%)
- Reward token harvesting with dynamic frequency (based on accumulated value vs gas cost)
- Defensive "go to cash" posture when risk signals fire (depeg, TVL crash, oracle failure)

**Stage 4: Sophisticated Optimization (future)**

- Multi-protocol capital splitting (MILP/quadratic programming)
- Cross-chain yield arbitrage via MEE Supertransactions
- Agent-based simulations for allocation decisions (Gauntlet approach)
- ML-based APY prediction from historical patterns

### Multi-Step Strategies to Add

| Strategy               | Flow                                                 | When Profitable                          | Risk                                |
| ---------------------- | ---------------------------------------------------- | ---------------------------------------- | ----------------------------------- |
| **Current: PT-yoUSD**  | USDC -> yoUSD -> PT-yoUSD                            | Always (fixed yield on top of variable)  | Maturity lock, yoUSD depeg          |
| **Leveraged PT carry** | Borrow USDC (Morpho) -> buy PT-yoUSD                 | PT fixed APY > Morpho borrow rate + 2%   | Rate spike on borrow side           |
| **Recursive Morpho**   | Deposit yoUSD collateral -> borrow USDC -> redeposit | Supply APY + rewards > borrow APY        | Liquidation risk                    |
| **Reward harvesting**  | Claim MORPHO/FLUID/TOKE -> swap to USDC -> redeposit | Accumulated rewards > $5 swap threshold  | Reward token price slippage         |
| **Defensive exit**     | Any vault -> USDC in wallet                          | TVL drop >50%, depeg >5%, oracle failure | Opportunity cost of sitting in cash |

---

## 8. What Makes Tapioca Stand Out

After analyzing all benchmarks, here is Tapioca's unique positioning:

### Tagline

**"The yield optimizer that AI agents can use."**

### Moat Stack

1. **Agent-native**: Only yield optimizer with CLI + SKILL.md + MCP server
2. **Multi-step strategies**: USDC -> yoUSD -> PT-yoUSD via Pendle (nobody else does this)
3. **ACH-to-yield**: MoonPay virtual bank account -> auto-convert -> agent manages yield
4. **Composable permissions**: Add new protocols without user re-registration (Biconomy Smart Sessions)
5. **Gasless**: Sponsor all transactions on Base (~$300/month for 1,000 users)
6. **Non-custodial**: User retains full control, agent operates within scoped session

### What We Take From Each Competitor

| Competitor        | What We Take                                               |
| ----------------- | ---------------------------------------------------------- |
| **YO**            | Yield tokenization concept (we already integrate yoUSD)    |
| **Giza**          | MILP optimizer approach for deposit-size-aware allocation  |
| **Zyfai**         | Revenue model (10% perf fee, 50/50 split)                  |
| **Sail**          | Per-user agent personalization, Sonar-like risk monitoring |
| **Mamo**          | UX simplicity ("deposit and forget")                       |
| **Goldbot Sachs** | ERC-4626 harvest fee mechanism                             |
| **MoonPay**       | CLI-first architecture, MCP mode, ACH on-ramp              |
| **Conway**        | Skills marketplace concept, agent discovery                |

---

## 8. Decisions (Resolved)

1. **Token**: Skip for now. Fee-based revenue first. Revisit at $25M+ TVL.
2. **Fiat on-ramp**: Both MoonPay (ACH differentiator) + Coinbase Onramp (Base-native fallback). MoonPay first.
3. **CLI package name**: `tapioca` — short, memorable. `npm install -g tapioca`.
4. **Frontend redesign**: Architecture first, redesign second. Ship new infra with simplified current UI.
5. **Multi-chain**: Base-only for now, but use Biconomy MEE from day 1 so cross-chain plumbing is ready. Expand at $10M+ TVL.
6. **Self-improving agent**: Separate R&D track ("Tapioca Labs"), not V2 scope.
7. **Phase ordering**: Infra-first (Core -> Biconomy -> CLI -> MoonPay -> Frontend -> Distribution -> Revenue).
8. **Repo strategy**: Evolve current codebase via feature branches. ~6,400 LOC reusable.

---

## Sources

### Moonpay CLI + ACH

- [MoonPay Agents Launch](https://www.moonpay.com/agents)
- [MoonPay Virtual Accounts](https://support.moonpay.com/en/articles/381402-virtual-accounts-explained)
- [Iron (MoonPay) Stablecoin Banking APIs](https://iron.xyz/)
- [MoonPay Developer Docs](https://dev.moonpay.com/)

### Revenue Models

- [Beefy Finance Fees](https://docs.beefy.finance/ecosystem/beefy-bulletins/beefy-finance-fees-breakdown)
- [Giza Protocol Fees](https://docs.gizaprotocol.ai/token/fees)
- [ZyfAI Token Mechanisms](https://docs.zyf.ai/zfi-and-stzfi-and-rzfi/token-mechanisms-zfi-and-stzfi)
- [Pimlico Pricing](https://docs.pimlico.io/infra/platform/pricing)

### CLI-First Architecture

- [Rewrite Your CLI for AI Agents](https://justin.poehnelt.com/posts/rewrite-your-cli-for-ai-agents/)
- [Why CLI Tools Beat MCP for AI Agents](https://jannikreinhard.com/2026/02/22/why-cli-tools-are-beating-mcp-for-ai-agents/)
- [Agent Skills Specification](https://agentskills.io/specification)
- [OpenClaw Skills Documentation](https://docs.openclaw.ai/tools/skills)
- [A2A Protocol Agent Discovery](https://a2a-protocol.org/latest/topics/agent-discovery/)

### Biconomy Infrastructure

- [Biconomy MEE Documentation](https://docs.biconomy.io/new/learn-about-biconomy/what-is-mee)
- [Smart Sessions Introduction](https://docs.biconomy.io/new/smart-sessions/introduction)
- [MEE + EIP-7702 Guide](https://docs.biconomy.io/new/getting-started/enable-mee-eoa-7702)
- [PREP Deep Dive](https://blog.biconomy.io/prep-deep-dive/)
- [@biconomy/abstractjs on npm](https://www.npmjs.com/package/@biconomy/abstractjs)
- [Comprehensive EIP-7702 Guide](https://blog.biconomy.io/a-comprehensive-eip-7702-guide-for-apps/)

### Competitor Architecture

- [Zyfai Technical Overview](https://docs.zyf.ai/docs/product/overview/introduction)
- [Sail.money Documentation](https://docs.sail.money)
- [Conway/Automaton GitHub](https://github.com/Conway-Research/automaton)
- [Uniswap AI Agent Skills](https://www.cryptotimes.io/2026/02/21/uniswap-rolls-out-7-ai-skills-for-automated-defi-execution/)
- [Mamo Contracts](https://github.com/moonwell-fi/mamo-contracts)
