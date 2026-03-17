# ARMA vs Giza Optimizer

Your agent now shows in-depth reasoning in human language.

Every day, whether it moves or not, you get a window into the intelligence at work:

- What protocols it evaluated
- What tradeoffs it weighed
- Why it moved, or why it chose to stay

You can follow the logic, understand the decisions, and watch them play out in Giza World.

The brain inside is called the **Giza Optimizer**, and it represents a fundamental shift in
how DeFi yield works.

Until now, the core question in yield products has been: _which is the best single protocol to
deposit all my capital into?_

ARMA worked this way. The category broadly worked this way: find the highest rate, put
everything there, move when something better shows up.

The Giza Optimizer asks a different question:

> How should your capital be distributed across lending markets to maximize yield, given your
> specific risk preferences?

That is a different paradigm, and it closes a gap that has left money on the table for years.

The Giza Optimizer models yield curves across every supported protocol. It calculates exactly
how your deposit size affects each one, then distributes capital across them based on your
constraints to capture more yield with lower concentration risk.

This piece breaks down how it works.

## Product Improvements

### Deeper personalization

Autonomous agents only work if they reflect how _you_ want to manage risk.

- Some users want maximum yield
- Some want to avoid specific protocols
- Some want guaranteed diversification

A one-size-fits-all optimizer leaves value on the table.

The Giza Agent lets you define your own parameters:

- Protocol exclusions
- Concentration limits
- Diversification requirements

Before committing capital, you can simulate outcomes:

1. Set your constraints and preferences
2. Preview how the optimizer allocates across protocols
3. Deposit only when you are ready

### Dynamic liquidity management

For larger deposits, the agent checks real-time liquidity across all protocols before any move.

It sizes positions relative to available liquidity so your capital stays accessible. You can
exit when needed, not only when a protocol allows favorable timing. If conditions change, the
agent adapts.

Institutional-grade risk management is built in.

### Auto-compounding

Many protocols distribute reward tokens on top of base yield (MORPHO, COMP, SEAM, and others).

Most users either:

- Ignore rewards (exposing themselves to token volatility)
- Claim them at suboptimal times

The new agent eliminates that exposure by:

- Detecting rewards
- Identifying optimal claim timing
- Evaluating post-gas profitability
- Reinvesting automatically

Every unit of generated capital is put back to work immediately.

### Stronger on-chain security

We migrated from Thirdweb to ZeroDev for smart account infrastructure.

- **Thirdweb model:** approving a contract could approve all methods
- **ZeroDev model:** permissions can be enforced at the parameter level

Your smart account can specify that USDC only goes to an allowed destination, enforced
on-chain.

Internal safeguards existed before, but now restrictions live at the contract level.

## Why Single-Protocol Allocation Leaves Money on the Table

The APR you see is not always the APR you get.

When you deposit into a lending protocol, you change the pool. Supply rises, utilization drops,
and APR can drop with it. A protocol advertising 6% may deliver 5.2% after your capital shifts
the curve. The larger the position, the stronger this effect.

Chasing "highest APR" treats yield as static. In practice, yield is a curve, and your deposit
slides you down it.

To optimize properly, you would need to:

- Model each protocol's rate response to your deposit size
- Compare curves across multiple protocols
- Calculate the optimal split
- Factor in gas costs
- Recompute whenever conditions change

This operational load is exactly where agents become necessary.

## How the Giza Optimizer Works

The Giza Optimizer distributes capital across protocols to keep allocations in each protocol's
higher-yield range.

Intuition:

- Protocol A offers 6% on first $500k, then 5% beyond
- Protocol B offers 5.5% on first $500k
- With $1M, splitting can outperform concentration

Example outcome:

- $1M fully in Protocol A -> ~5.2% blended
- $500k in A + $500k in B -> ~5.7% blended

Same capital, higher return. You stay in the steeper parts of multiple curves instead of
sliding down one curve fully.

### Technical process

Before any allocation decision, the optimizer constructs a yield curve for each supported
protocol by querying multiple deposit levels (typically ~20 points per protocol). This maps how
APR changes as deposit size increases.

With curves modeled, the optimizer solves a **Mixed-Integer Linear Program (MILP)** to maximize
portfolio APR net of transaction costs.

MILP is chosen over simple rules because yield curves are not linear. Rules such as
"move when spread > 0.5%" ignore the impact of your own capital on rates.

The optimization accounts for:

- Current rates across all protocols
- Deposit-size impact on each protocol's utilization
- Gas costs for entering and exiting positions
- Minimum position sizes and protocol-specific constraints

Result: a portfolio allocation designed to maximize risk-adjusted yield for your capital,
constraints, and current market conditions.

## Why It's Also Safer

Yield is only half the equation.

Multi-protocol allocation improves risk management:

- **Less concentration:** no single protocol dominates your capital
- **Easier exits:** smaller positions generally preserve liquidity access
- **Contained blast radius:** any single protocol failure affects a smaller share of holdings

Distributed capital also improves accessibility. You are less tied to one pool's liquidity
conditions and can generally access capital more reliably when needed.

Yield gains scale with deposit size; risk reduction and access benefits apply broadly.

This architecture is also foundational for more advanced autonomous strategies beyond basic
yield optimization.

## Who Benefits Most

The optimizer's multi-protocol distribution typically activates for deposits above **$100k**.

Below that range, gas costs and minimum position sizes can make splitting less efficient than
single-protocol allocation. The optimizer only distributes when the math supports it.

For deposits above $100k:

- Capital is large enough to move utilization curves materially
- Yield compression from concentration becomes more significant
- Distribution across protocols captures more of the high-yield range

All users still benefit from automated management, gas-aware rebalancing, and continuous
monitoring. The optimizer acts only when expected benefit exceeds transaction costs.

## What This Means for You

Before you deposit, you can simulate optimizer behavior:

- Set protocol exclusions, concentration limits, and diversification preferences
- See exactly how capital would be allocated

After deposit, the agent handles operations continuously:

- Evaluates protocols
- Models yield curves
- Distributes capital
- Rebalances only when profitable after gas

You do not need to manually monitor rates, estimate rebalance thresholds, or continuously
recalculate diversification.

The Giza Agent runs 24/7, remains non-custodial, and acts only when it improves your position.
Your capital stays in your smart account; Giza does not take custody.

You define the constraints. The agent executes within them.

## Fees and Revenue Model

The ARMA agent charges a **10% success fee** on generated yield.

- No deposit fees
- No withdrawal fees
- No rebalance fees

### Primary mechanism (based on independent reports)

#### Performance-based fees

- Fee is charged on realized/net yielded returns (commonly reported around 10%)
- Fees are charged only on profits
- Fee visibility is provided in dashboard reporting

#### Reward consolidation

The agent collects and consolidates rewards from integrated protocols and returns earnings plus
principal on withdrawal.

This model aligns protocol revenue with user performance rather than flat usage fees.

### Summary

- Performance fee on generated yield
- No explicit deposit/withdrawal charges
- Revenue tied to actual yield delivered (profit-linked fee)
