# What is Sail

You just deposit stablecoins into your own Sail Account, choose your preferences (or use the default setup), and Sail continuously reallocates across DeFi to target the best net APY after rewards, fees, and risk. It can route across yield sources and, when enabled, swap, bridge, and compound rewards automatically. The result is simple: your stablecoins stay in motion without you babysitting markets.

Sail exists because most stablecoins are still idle. Even when users want yield, the experience is fragmented: picking protocols, monitoring APYs, understanding incentives, managing gas and bridging, and reacting to risks. In practice, everyone gets forced into the same “one-size” product: one yield option, one risk profile, one liquidity profile. But people don’t have the same constraints, and money shouldn’t either.

Sail turns yield into an always-on service. Each user gets a dedicated agent that runs behind their balance, plus a set of controls to shape how it behaves. You can personalize the scope: which networks and stablecoins to use, which protocols to allow, and which actions to enable (yield, swaps, bridges, rewards). Sail then executes within those permissions and shows you what happened through the dashboard, history, and chat. Your agent can explain allocations and past moves in plain language, and you can update or revoke permissions anytime.

This architecture matters. Sail doesn’t run one global allocator that treats every user the same. It deploys one agent per user, tuned to that user’s policy and behavior. Over time, this unlocks something traditional finance can’t easily package: money that adapts to your preferences and liquidity needs, not just a generic product catalog.

Our direction is “money intelligence”: money that carries context, rules, and history, and software that can act on that context safely. “Money in motion” is the visible result. Instead of a static balance in a wallet, your stablecoins are continuously optimized under your control. If we are right, most digital money will eventually sit behind an agent that understands its owner. Sail is building that system from the ground up.

# FAQ

#### What Is Sail?

Sail is a personal AI agent for Internet money. It autonomously reallocates stablecoins across DeFi for the **best net yield after rewards, fees, and risk**, while keeping you in control through your own account and permissions.&#x20;

#### How Does Sail Work?

You deposit stablecoins into your **Sail Account**, then your agent routes across vetted yield sources and can rebalance over time as conditions change. You can review activity, see where funds are allocated, and stop or update permissions whenever you want.&#x20;

#### Where Does The Yield Come From?

Sail’s USD APY comes from DeFi yield sources (like lending markets and vaults) plus any incentive rewards available on those venues. APY shown in-app is the **current** rate for each yield source, and your overall result depends on where your balance is allocated.&#x20;

#### Are there fees?

Currently, Sail does not charge performance fees. Gas costs on Base are also sponsored by Sail. Fees may be introduced later as the system scales, but always transparently and with clear disclosure.

#### Which Stablecoins And Networks Does Sail Support?

Sail supports the stablecoins and networks shown in-app (and in the docs), and will route across them based on your settings, permissions, and available opportunities.&#x20;

#### How Do Deposits Work?

You can deposit in a few ways:

* **Send stablecoins** to your Sail Account address (classic onchain transfer).
* **Deposit with wallet:** connect a wallet and deposit using **any token you hold**. Sail handles the swapping and bridging in the background so you end up deposited seamlessly.
* **Deposit with card:** where available, through supported providers.

#### How Do Withdrawals Work?

Withdrawals are initiated from Sail and sent to an address you choose. If your funds are allocated in yield sources, Sail may need to unwind positions as part of the process. You can track everything from the **History** tab (and open the underlying transactions on a block explorer).

#### How Is Sail Secure?

Sail is designed to keep you in control:

* **Your own account + permissions:** Sail uses smart accounts and scoped permissions so the agent can do only what you’ve allowed.
* **Monitoring with Sonar:** Sonar helps monitor risk signals (like stablecoin depegs and protocol health events) so the system can react when conditions change.
* **Good security hygiene still matters:** use strong login security and be cautious with new devices and suspicious links (the same basics top finance apps emphasize).&#x20;

#### What Are Sail Points And How Do Referrals Work?

**Points** are an incentives program that accrues based on your participation rules (details are in the incentives docs). \
**Referrals:** referrers earn **20% of the points** their referees generate (daily), and referees get a **10% boost** when joining with a referral code.&#x20;

#### How Do I Get Help Or Understand What My Agent Is Doing?

You can message Sail via:

* **In-app chat**
* **Telegram bot** (same questions as in-app, plus daily updates if enabled)

These channels are for customer support, explaining agent behavior, and answering DeFi / yield questions in plain language.&#x20;

# Strategy

Each agent runs a multi-factor function that scores all active markets by expected yield, liquidity depth, and volatility cost, then reallocates based on that score.

#### **1. Scoring Function**

Each protocol receives a normalized score based on yield, liquidity, and volatility:

```
S_i = (A_i^α * T_i^(βγ) * e^(-λσ * σ_i²)) /
      Σ_j (A_j^α * T_j^(βγ) * e^(-λσ * σ_j²))
```

where:

* `A_i` = protocol APY
* `T_i` = liquidity (TVL)
* `σ_i` = historical volatility
* `λσ` = risk adjustment
* `α, β, γ` = sensitivity parameters that adapt to portfolio size

Larger portfolios automatically receive higher sensitivity to APY and liquidity risk, meaning big accounts favor deeper, lower-volatility venues while smaller ones chase lighter, higher-yield pools.

***

#### **2. Cost Awareness**

When the agent moves capital between chains or tokens, it models full cross-chain and swap costs:

```
c_(i→j) = μ_chain * [c_i ≠ c_j] +
           μ_token * [t_i ≠ t_j] +
           slippage_i(P) +
           gas_(i→j) / P
```

Each swap or bridge is treated as an “energy barrier.”\
The optimizer only crosses if the expected yield improvement outweighs that cost.

***

#### **3. Optimization Objective**

The agent searches for a new allocation **w\*** that maximizes a regularized utility:

```
L(w) = wᵀS − λ_c * C(w, w₀)
       − η * ||w − w_t||²
       − ν * H(w)
```

where:

* `C(w, w₀)` = total cost to move from previous allocation
* `H(w)` = entropy term that prevents over-concentration
* `λ_c, η, ν` = cost and diversification controls

The optimizer uses **simulated annealing**, gradually cooling search temperature to escape local minima and converge near an optimal allocation. A CNN meta-controller provides priors for `(α, β, γ)` based on volatility and APY history.

***

#### **4. Learn More**

Read the full paper: [*Cross-Chain Optimization Engine for Autonomous Agents*](https://docsend.com/view/8qqn3qy5ijgg94zr/d/tsxt8ebabn9v6c7d)

# Balance Tiers

Tiers update automatically as your balance changes. Execution and diversification are always bounded by your tier, and further bounded by the permissions you approve.

***

#### **Tier Overview**

* **Executions:** how many times per day Sail scans and reallocates (when needed).
* **Networks / Stablecoins:** what your agent can use by default at that tier (you can restrict this via personalization).
* **Positions:** max positions per stablecoin/network the agent may hold at once.
* **Security:** Sonar runs for all tiers.

<table><thead><tr><th width="98.80078125">Tier</th><th width="114.70703125" align="right">Balance</th><th width="122.58203125" align="right">Executions</th><th width="115.2421875">Networks</th><th width="132.609375">Stablecoins</th><th width="110.984375">Positions</th><th>Features</th></tr></thead><tbody><tr><td><strong>Silver</strong></td><td align="right">$0–$10,000</td><td align="right">4× / day</td><td>Base, Arbitrum</td><td>USDC, USDT</td><td>1 per stablecoin/network</td><td>Sonar active</td></tr><tr><td><strong>Gold</strong></td><td align="right">$10,000–$100,000</td><td align="right">12× / day</td><td>Base, Arbitrum</td><td>USDC, USDT</td><td>up to 4 per stablecoin/network</td><td>Sonar + diversification + swaps &#x26; bridges</td></tr><tr><td><strong>Platinum</strong></td><td align="right">$100,000+</td><td align="right">24× / day</td><td>Base, Arbitrum</td><td>USDC, USDT</td><td>up to 5 per stablecoin/network</td><td>Sonar + diversification + swaps &#x26; bridges</td></tr></tbody></table>

Higher tiers increase execution frequency, which helps capture short-lived APY changes faster and reduces idle time.

***

#### How balance tiers interact with personalization

Tiers define the **maximum** scope your agent can operate within. Personalization lets you set your **actual** scope.

Examples:

* you’re **Gold**, but you only want **Base** → personalize networks to Base-only.
* you’re **Platinum**, but you never want bridging → personalize actions to disable bridging.
* you want “lending primitives only” (Aave/Fluid/Moonwell) → personalize permissions to allowlist only those protocols.

if you expand scope later (new networks, protocols, or actions), Sail will ask you to sign **new permissions** before the agent can use them.

***

### Automatic Tier Updates

* Tier changes happen automatically when your balance crosses thresholds.
* Upgrading your tier can unlock higher execution frequency and additional capabilities.
* Downgrading reduces the maximum execution/position scope accordingly.

***

#### **Performance Analysis**

*Back-tested and live agent data since October 1, 2025*

**Top 5 Protocols on Base (USDC)**

| Protocol                    | Mean APY | Max APY | Min APY |
| --------------------------- | -------- | ------- | ------- |
| Euler Yo                    | 9.88 %   | 15.88 % | 5.18 %  |
| Morpho Clearstar High Yield | 9.54 %   | 12.12 % | 7.64 %  |
| Morpho Clearstar            | 8.90 %   | 11.85 % | 7.72 %  |
| Morpho Clearstar Reacted    | 8.90 %   | 11.34 % | 7.71 %  |
| Moonwell                    | 8.57 %   | 11.58 % | 6.99 %  |

***

**Agent Performance by Tier**

| Tier         | Mean APY | Max APY | Min APY |
| ------------ | -------- | ------- | ------- |
| **Silver**   | 11.90 %  | 16.91 % | 9.14 %  |
| **Gold**     | 12.69 %  | 18.11 % | 9.26 %  |
| **Platinum** | 13.26 %  | 18.21 % | 9.36 %  |

Execution frequency directly boosts realized yield: more re-checks mean faster reaction to APY shifts and fewer idle cycles.

# Yield Sources

Each source is monitored continuously for **risk-adjusted yield**; reallocations only occur when the **after-fee, after-risk** outcome improves.

***

### **How we evaluate sources (quick guide)**

* **Signals:** APY, TVL/liquidity depth, volatility, withdrawal friction.
* **Costs:** swap + bridge fees, gas, expected slippage, exit penalties.
* **Rules:** your tier’s position caps, chain allowlist, exclusions.
* **Receipts:** every move includes itemized fees and tx hashes in **History**.

***

### **Coverage by Network & Asset**

<table><thead><tr><th width="248.703125">Yield Source</th><th width="115.33984375">Stablecoin</th><th width="105.2578125">Network</th><th width="118.89453125">Protocol</th><th>Curator</th></tr></thead><tbody><tr><td><a href="https://app.aave.com/reserve-overview/?underlyingAsset=0x833589fcd6edb6e08f4c7c32d4f71b54bda02913&#x26;marketName=proto_base_v3">Aave USDC</a></td><td>USDC</td><td>Base</td><td>Aave</td><td>Aave</td></tr><tr><td><a href="https://fluid.io/lending/8453/USDC">Fluid USDC</a></td><td>USDC</td><td>Base</td><td>Fluid</td><td>Fluid</td></tr><tr><td><a href="https://moonwell.fi/markets/supply/base/usdc">Moonwell USDC</a></td><td>USDC</td><td>Base</td><td>Moonwell</td><td>Moonwell</td></tr><tr><td><a href="https://v3-app.compound.finance/markets/usdc-basemainnet">Compound USDC</a></td><td>USDC</td><td>Base</td><td>Compound</td><td>Compound</td></tr><tr><td><a href="https://app.morpho.org/base/vault/0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca/moonwell-flagship-usdc">Morpho Moonwell</a></td><td>USDC</td><td>Base</td><td>Morpho</td><td>moonwell</td></tr><tr><td><a href="https://app.morpho.org/base/vault/0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A/spark-usdc-vault">Morpho Spark</a></td><td>USDC</td><td>Base</td><td>Morpho</td><td>Spark</td></tr><tr><td><a href="https://app.morpho.org/base/vault/0x616a4E1db48e22028f6bbf20444Cd3b8e3273738/seamless-usdc-vault">Morpho Seamless</a></td><td>USDC</td><td>Base</td><td>Morpho</td><td>Gauntlet</td></tr><tr><td><a href="https://app.morpho.org/base/vault/0xeE8F4eC5672F09119b96Ab6fB59C27E1b7e44b61/gauntlet-usdc-prime">Morpho Gauntlet Prime</a></td><td>USDC</td><td>Base</td><td>Morpho</td><td>Gauntlet</td></tr><tr><td><a href="https://app.morpho.org/base/vault/0x23479229e52Ab6aaD312D0B03DF9F33B46753B5e/extrafi-xlend-usdc">Morpho Extrafi</a></td><td>USDC</td><td>Base</td><td>Morpho</td><td>Gauntlet</td></tr><tr><td><a href="https://app.morpho.org/base/vault/0xc0c5689e6f4D256E861F65465b691aeEcC0dEb12/gauntlet-usdc-core">Morpho Gauntlet Core</a></td><td>USDC</td><td>Base</td><td>Morpho</td><td>Gauntlet</td></tr><tr><td><a href="https://app.morpho.org/base/vault/0x236919F11ff9eA9550A4287696C2FC9e18E6e890/gauntlet-usdc-frontier">Morpho Gauntlet Frontier</a></td><td>USDC</td><td>Base</td><td>Morpho</td><td>Gauntlet</td></tr><tr><td><a href="https://app.morpho.org/base/vault/0xBEEFE94c8aD530842bfE7d8B397938fFc1cb83b2/steakhouse-prime-usdc">Morpho Steakhouse Prime</a></td><td>USDC</td><td>Base</td><td>Morpho</td><td>Steakhouse</td></tr><tr><td><a href="https://app.morpho.org/base/vault/0xBEEFA7B88064FeEF0cEe02AAeBBd95D30df3878F/steakhouse-high-yield-usdc-v11">Morpho Steakhouse High Yield</a></td><td>USDC</td><td>Base</td><td>Morpho</td><td>Steakhouse</td></tr><tr><td><a href="https://app.morpho.org/base/vault/0x1D3b1Cd0a0f242d598834b3F2d126dC6bd774657/clearstar-reactor-openeden-boosted-usdc">Morpho Clearstar Reacted</a></td><td>USDC</td><td>Base</td><td>Morpho</td><td>Clearstar</td></tr><tr><td><a href="https://app.morpho.org/base/vault/0xE74c499fA461AF1844fCa84204490877787cED56/high-yield-clearstar-usdc">Morpho Clearstar High Yield</a></td><td>USDC</td><td>Base</td><td>Morpho</td><td>Clearstar</td></tr><tr><td><a href="https://app.auto.finance/autopool?id=0x9c6864105aec23388c89600046213a44c384c831">AutoFinance baseUSD</a></td><td>USDC</td><td>Base</td><td>Auto Finance</td><td>Auto Finance</td></tr><tr><td><a href="https://app.aave.com/reserve-overview/?underlyingAsset=0xaf88d065e77c8cc2239327c5edb3a432268e5831&#x26;marketName=proto_arbitrum_v3">Aave_USDC</a></td><td>USDC</td><td>Arbitrum</td><td>Aave</td><td>Aave</td></tr><tr><td><a href="https://fluid.io/lending/42161/USDC">Fluid_USDC</a></td><td>USDC</td><td>Arbitrum</td><td>Fluid</td><td>Fluid</td></tr><tr><td><a href="https://v3-app.compound.finance/markets/usdc-arb">Compound USDC</a></td><td>USDC</td><td>Arbitrum</td><td>Compound</td><td>Compound</td></tr><tr><td><a href="https://app.morpho.org/arbitrum/vault/0x7e97fa6893871A2751B5fE961978DCCb2c201E65/gauntlet-usdc-core">Morpho Gauntlet Core</a></td><td>USDC</td><td>Arbitrum</td><td>Morpho</td><td>Gauntlet</td></tr><tr><td><a href="https://app.morpho.org/arbitrum/vault/0x7c574174DA4b2be3f705c6244B4BfA0815a8B3Ed/gauntlet-usdc-prime">Morpho Gauntlet Prime</a></td><td>USDC</td><td>Arbitrum</td><td>Morpho</td><td>Gauntlet</td></tr><tr><td><a href="https://app.morpho.org/arbitrum/vault/0x5c0C306Aaa9F877de636f4d5822cA9F2E81563BA/steakhouse-high-yield-usdc">Morpho Steakhouse High Yield</a></td><td>USDC</td><td>Arbitrum</td><td>Morpho</td><td>Steakhouse</td></tr><tr><td><a href="https://app.morpho.org/arbitrum/vault/0x4B6F1C9E5d470b97181786b26da0d0945A7cf027/hyperithm-usdc">Morpho Hyperithm</a></td><td>USDC</td><td>Arbitrum</td><td>Morpho</td><td>Hyperithm</td></tr><tr><td><a href="https://app.morpho.org/arbitrum/vault/0x36b69949d60d06ECcC14DE0Ae63f4E00cc2cd8B9/yearn-degen-usdc">Morpho Yearn Degen</a></td><td>USDC</td><td>Arbitrum</td><td>Morpho</td><td>Yearn Finance</td></tr><tr><td><a href="https://app.morpho.org/arbitrum/vault/0xa53Cf822FE93002aEaE16d395CD823Ece161a6AC/clearstar-usdc-reactor">Morpho Clearstar Reactor</a></td><td>USDC</td><td>Arbitrum</td><td>Morpho</td><td>Clearstar</td></tr><tr><td><a href="https://app.morpho.org/arbitrum/vault/0x64CA76e2525fc6Ab2179300c15e343d73e42f958/clearstar-high-yield-usdc">Morpho Clearstar High Yield</a></td><td>USDC</td><td>Arbitrum</td><td>Morpho</td><td>Clearstar</td></tr><tr><td><a href="https://app.euler.finance/vault/0x6aFB8d3F6D4A34e9cB2f217317f4dc8e05Aa673b?network=arbitrumone">Euler K3 USDai Cluster</a></td><td>USDC</td><td>Arbitrum</td><td>Euler</td><td>K3 Capital</td></tr><tr><td><a href="https://app.euler.finance/vault/0x44C10DA836d2aBe881b77bbB0b3DCE5f85C0C1Cc?network=arbitrumone">Euler Frontier Theo</a></td><td>USDC</td><td>Arbitrum</td><td>Euler</td><td>Euler DAO</td></tr><tr><td><a href="https://app.euler.finance/vault/0x05d28A86E057364F6ad1a88944297E58Fc6160b3?network=arbitrumone">Euler Arbitrum Yield</a></td><td>USDC</td><td>Arbitrum</td><td>Euler</td><td>Gauntlet</td></tr><tr><td><a href="https://app.euler.finance/vault/0x0a1eCC5Fe8C9be3C809844fcBe615B46A869b899?network=arbitrumone">Euler Arbitrum</a></td><td>USDC</td><td>Arbitrum</td><td>Euler</td><td>Gauntlet</td></tr><tr><td><a href="https://app.auto.finance/pools/arbUSD">Auto Finance arbUSD</a></td><td>USDC</td><td>Arbitrum</td><td>Auto Finance</td><td>Auto Finance</td></tr><tr><td><a href="https://app.aave.com/reserve-overview/?underlyingAsset=0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9&#x26;marketName=proto_arbitrum_v3">Aave USDT</a></td><td>USDT</td><td>Arbitrum</td><td>Aave</td><td>Aave</td></tr><tr><td><a href="https://fluid.io/lending/42161/USDT">Fluid USDT</a></td><td>USDT</td><td>Arbitrum</td><td>Fluid</td><td>Fluid</td></tr><tr><td><a href="https://v3-app.compound.finance/markets/usdt-arb">Compound USDT</a></td><td>USDT</td><td>Arbitrum</td><td>Compound</td><td>Compound</td></tr><tr><td><a href="https://app.euler.finance/earn/0xe4783824593a50Bfe9dc873204CEc171ebC62dE0?network=arbitrumone">Euler Earn </a></td><td>USDC</td><td>Arbitrum</td><td>Euler </td><td>Euler DAO</td></tr><tr><td><a href="https://app.morpho.org/arbitrum/vault/0x2C609d9CfC9dda2dB5C128B2a665D921ec53579d/kpk-usdc-yield">Morpho KPK</a></td><td>USDC</td><td>Arbitrum </td><td>Morpho </td><td>KPK</td></tr><tr><td><a href="https://app.morpho.org/arbitrum/vault/0xbeeff1D5dE8F79ff37a151681100B039661da518/steakhouse-high-yield">Steakhouse High Yield V2</a></td><td>USDC</td><td>Arbitrum </td><td>Morpho </td><td>Steakhouse</td></tr><tr><td><a href="https://app.morpho.org/arbitrum/vault/0xbeeff77CE5C059445714E6A3490E273fE7F2492F/steakhouse-high-yield">Steakhouse High Yield V2</a></td><td>USDT</td><td>Arbitrum </td><td>Morpho </td><td>Steakhouse</td></tr><tr><td><a href="https://app.aave.com/reserve-overview/?underlyingAsset=0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42&#x26;marketName=proto_base_v3">Aave EURC</a></td><td>EURC</td><td>Base</td><td>Aave</td><td>Aave</td></tr><tr><td><a href="https://app.morpho.org/base/vault/0xbeef009F28cCf367444a9F79096862920e025DC1/steakhouse-prime-eurc">Steakhouse Prime EURC V2</a></td><td>EURC</td><td>Base</td><td>Morpho </td><td>Steakhouse</td></tr><tr><td><a href="https://fluid.io/lending/8453/EURC">Fluid Lending EURC</a></td><td>EURC</td><td>Base</td><td>Fluid</td><td>Fluid</td></tr><tr><td><a href="https://app.morpho.org/base/vault/0x94Af495DE1F56Aa5576dEB17986bDCeE5Dd9778D/gauntlet-eurc-balanced">Gauntlet EURC Balanced V2</a></td><td>EURC</td><td>Base</td><td>Morpho</td><td>Gauntlet</td></tr><tr><td><a href="https://moonwell.fi/markets/supply/base/eurc">Moonwell EURC</a></td><td>EURC</td><td>Base</td><td>Moonwell</td><td>Moonwell</td></tr></tbody></table>

# Security Agent: Sonar

#### What Sonar Tracks

**1. Stablecoin depegs**\
• Sonar checks all supported stablecoins every 5 minutes.\
• It triggers an alert when the price drops 5% or more from the 1:1 peg.

**2. TVL drops in yield sources**\
• Sonar monitors Total Value Locked (TVL) in all integrated vaults and protocols every hour.\
• It triggers an alert if TVL drops 20% or more in that window.

#### Why These Signals

• A sharp peg move is often the earliest sign of liquidity issues or protocol contagion.\
• A large TVL drop can indicate stress, an exploit, or a run.\
• Sonar alerts allow your money agent to act with intent before broader markets react.&#x20;

#### How Sonar Works

• Live stablecoin price and TVL feeds. \
• A rules engine that checks for the 5% and 20% thresholds. \
• Alerts feed directly into Sail’s agent orchestration layer where protective actions can be recommended or executed.&#x20;

#### Performance and Balance Tiers

Sonar performs even better for higher balance tiers. When balances are larger, your agent executes more frequently. More executions mean that when Sonar detects a risk event, the agent can exit faster and reduce exposure sooner.

#### Coming Soon

Sonar is expanding into deeper, more proactive risk intelligence. Upcoming capabilities include:

• Social media signal scanning for exploit chatter and protocol-specific warnings. \
• Security-firm intelligence feeds and vulnerability reports. \
• Vault collateral analysis to detect deteriorating backing or unhealthy asset mixes. \
• Liquidity drop analysis across integrated venues to spot exit pressure before it cascades. \
• More granular risk signals to power autonomous decision-making.&#x20;

# Rewards Auto-Compounding

Rewards Auto-Compounding keeps your balance in motion without you needing to handle reward tokens. \
\
Each time your agent runs an execution cycle, it:

* Checks whether any rewards are ready to claim.&#x20;
* Claims them once they’re large enough to cover gas and improve net yield.&#x20;
* Swaps the reward token to an integrated USD stablecoin, using multi-hop routes when needed.&#x20;
* Treats the resulting USD stablecoin like any other part of your balance and reallocates it. &#x20;

You simply see your balance grow. You never need to manage or monitor the underlying reward assets. All reward claiming and swapped is also showed in your history tab.&#x20;

To turn this on, Sail needs **updated permissions for claiming and swapping reward tokens**. You’ll be asked to sign these when you first enable auto-compounding. You can always review the active permissions in your profile.

#### Supported Reward Tokens

<table><thead><tr><th>Reward Token</th><th width="229.4609375">Network </th><th>Swap Type</th></tr></thead><tbody><tr><td>MORPHO</td><td>Base</td><td>Single</td></tr><tr><td>MORPHO </td><td>Arbitrum </td><td>Multi</td></tr><tr><td>ARB</td><td>Arbitrum </td><td>Single</td></tr><tr><td>SEAM</td><td>Base</td><td>SIngle</td></tr><tr><td>WELL </td><td>Base</td><td>Multi</td></tr><tr><td>EXTRA</td><td>Base</td><td>Multi</td></tr></tbody></table>

#### For former Fungi users

If you used Fungi before joining Sail, you may have unclaimed rewards waiting. You can redeem them here:\
[**https://sail.money/manage-wallet/4337**](https://sail.money/manage-wallet/4337)

The steps are:&#x20;

1. Connect using your old Fungi credentials
2. Paste your Sail account address
3. Click on “Redeem Rewards”
4. Sail will pick up the redeemed tokens during the next execution and swap them into USDC automatically

# Account Permissions

When you “start” your agent (or change settings later), you’ll usually sign two types of permissions:

#### 1) Token approvals

Token approvals allow your Sail Account to interact with specific contracts (for example, a yield source or router) using a specific token.

* Approvals are **scoped** to a token and spender.
* They do **not** give someone control over your wallet. They simply allow smart contracts to move a token **under the constraints of your permissions**.
* Approvals are common in DeFi. Sail surfaces them in the UI so you can review what you’re signing.

#### 2) Agent permissions (session keys)

Session keys are what make Sail feel “agentic”: you don’t need to sign every rebalance, claim, swap, or bridge.

* Your agent receives a **scoped, revocable permission** to execute on your behalf.
* The permission is limited to what you chose in onboarding or personalization (networks, stablecoins, protocols, actions).
* You can update or revoke these permissions at any time from the app.

#### What you should expect to see at signing time

Sail shows you the **exact permissions** you’re authorizing before you sign, including what the agent can do and where it can do it. This is intentional: you should be able to verify the scope before granting access.

#### Where to review or change permissions

Open the **Profile Menu → Personalization** to review and update what your agent is allowed to do. If you expand scope (new protocols/actions), Sail will request new permissions. If you reduce scope, Sail will stop using anything outside your updated rules.

# Session Keys

Instead of giving an agent broad wallet access, Sail uses **session keys**: temporary keys that can sign transactions **only within a defined scope**. This is what lets your agent operate continuously while keeping you in control.

#### Why session keys exist

Without session keys, you’d need to manually approve every action:

* reallocations across yield sources
* claims of protocol rewards
* swaps into supported stablecoins
* bridging across networks (if enabled)

Session keys make those actions possible while preserving a “least-privilege” model.

#### What session keys can be scoped to

A session key is granted with limits such as:

* **Networks** (where it can execute)
* **Stablecoins** (what assets it can use)
* **Protocols / yield sources** (where it can allocate)
* **Actions** (yield, swaps, bridges, claim rewards)
* **Constraints** (transaction rules and safety checks enforced by your configuration)

Personalization is how you define this scope. If you want “lending-only” or “no bridging,” session keys enforce that.

#### Lifecycle: how session keys work in practice

1. You choose default permissions or personalize your own.
2. Sail shows the permissions you’re about to grant.
3. You sign to authorize the session key(s).
4. The agent can now execute within that scope.
5. You can update or revoke permissions anytime (which replaces or removes session keys).

#### What happens if a session key is removed or expires

If a key is revoked or no longer valid, the agent simply **cannot execute**. Your funds remain in your Sail Account. To resume automation, you sign a new set of permissions.

#### Your safety guarantees

* **No blanket custody:** session keys are not “take over the wallet” permissions.
* **Revocable:** you can shut off the agent by revoking permissions.
* **Scoped:** the agent can only do what you approved, on the venues you approved.
* **Transparent:** you see what you sign in the UI before granting access.

If anything ever looks unclear, use in-app chat or Telegram to ask what a permission does before signing.

# Container Isolation

Execution runs in isolated containers to contain faults and reduce cross-tenant risk.

* **Per-run isolation:** Agent jobs execute in ephemeral containers with no shared memory or disk.
* **Minimal egress:** Network access is restricted to allow-listed RPCs and APIs; no open internet.
* **No secret sprawl:** There are **no private keys** off-chain; session keys are on-chain permissions. Any operational tokens are short-lived and scoped.
* **Hardened runtime:** Read-only filesystems where possible, resource quotas, rate limiting, and strict observability.
* **Deterministic deployment:** Reproducible builds and checksums to ensure the code that runs is the code that was reviewed.

# Security Agent: Sonar

#### What Sonar Tracks

**1. Stablecoin depegs**\
• Sonar checks all supported stablecoins every 5 minutes. \
• It triggers an alert when the price drops 5 percent or more from the 1:1 peg.&#x20;

**2. TVL drops in yield sources**\
• Sonar monitors Total Value Locked in all integrated vaults and protocols every hour. \
• It triggers an alert if TVL drops 20 percent or more in that window.&#x20;

#### Why These Signals

• A sharp peg move is often the earliest sign of liquidity issues or protocol contagion. \
• A large TVL drop can indicate stress, an exploit, or a run. \
Sonar alerts allow your money agent to act with intent before broader markets react.&#x20;

#### How Sonar Works

• Live stablecoin price and TVL feeds. \
• A rules engine that checks for the 5 percent and 20 percent thresholds. \
• Alerts feed directly into Sail’s agent orchestration layer where protective actions can be recommended or executed.&#x20;

#### Performance and Balance Tiers

Sonar performs even better for higher balance tiers. When balances are larger, your agent executes more frequently. More executions mean that when Sonar detects a risk event, the agent can exit faster and reduce exposure sooner.

#### Coming Soon

Sonar is expanding into deeper, more proactive risk intelligence. Upcoming capabilities include:

• Social media signal scanning for exploit chatter and protocol-specific warnings. \
• Security-firm intelligence feeds and vulnerability reports. \
• Vault collateral analysis to detect deteriorating backing or unhealthy asset mixes. \
• Liquidity drop analysis across integrated venues to spot exit pressure before it cascades. \
• More granular risk signals to power autonomous decision-making.&#x20;

# Audits

Sail does not currently deploy bespoke, Sail-owned protocol contracts. Our onchain execution is built on **Thirdweb’s ERC-7702 smart account infrastructure** and **ERC-7702 smart session keys**, which have been audited by independent security firms. We rely on these audited, production-grade components and keep Sail’s custom logic offchain (policy, routing, explainability) to minimize onchain attack surface.

#### What we do today

* **Use audited primitives for execution**\
  User accounts are ERC-7702 smart accounts with scoped session keys, implemented using Thirdweb’s audited codebase.
* **Review our integration and configuration**\
  We run internal security reviews focused on:
  * permissions and transaction constraints
  * session key scoping and lifecycle
  * protocol integration safety checks
* **Make permissions explicit at signing time**\
  When you authorize a session key, Sail shows the exact session key you are approving in the UI, including its scope and permissions, so you can verify what you are granting.

#### Audit reports (Thirdweb / ERC-7702 components)

* [0xMacro Security Audit: thirdweb 22 (April 25, 2025)](https://0xmacro.com/library/audits/thirdweb-22?utm_source=chatgpt.com) [0xmacro.com](https://0xmacro.com/library/audits/thirdweb-22)
* [thirdweb A-14 Audit PDF](https://ipfs.io/ipfs/Qmc36VUCuwG2u7kZrqmXmJsH5c8sF7SHySVbPnwVmo3XYX/thirdweb%20A-14%20_%20Macro%20Audits%20_%20The%200xMacro%20Library.pdf)

# Deposit

{% hint style="info" %}
**The minimum deposit amount for your agent to work is set at a $100.**&#x20;
{% endhint %}

Your first deposit funds your Sail account and unlocks agent execution. You can choose one of three methods:

* **Send stablecoins**
* **Deposit with wallet**
* **Deposit with card**

<figure><img src="https://2171443932-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2FaRvuDeAPVlfdTdwTaykg%2Fuploads%2FU6aN6pPdWOYMPZ3wBUfF%2FCaptura%20de%20pantalla%202025-12-22%20a%20las%206.47.31%E2%80%AFp.m..png?alt=media&#x26;token=02f1e4f3-c689-4aaf-9411-d1ea7895e528" alt=""><figcaption></figcaption></figure>

***

#### 1. Send stablecoins

Use this if you want to transfer supported stablecoins from another wallet or exchange.

1. Select the **network**
2. Select the **asset**
3. Copy your **Sail account address**
4. Send the funds to that address.&#x20;
5. Once it arrives, click **Continue**

<figure><img src="https://2171443932-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2FaRvuDeAPVlfdTdwTaykg%2Fuploads%2FjsgTIP1kLcDUNp0UZFFT%2FCaptura%20de%20pantalla%202025-12-22%20a%20las%206.50.56%E2%80%AFp.m..png?alt=media&#x26;token=8767d154-d474-459b-8f48-e5fe7781aba1" alt=""><figcaption></figcaption></figure>

***

#### 2. Deposit with wallet

Use this if you signed in with a crypto wallet (or want to connect one) and prefer to deposit directly from it. You can deposit with **any token** you hold in the connected wallet. If the token isn’t a supported stablecoin on the right network, Sail will **swap and bridge in the background** so the deposit arrives in your Sail Account as supported stablecoins. The goal is simple: **deposit with whatever you already have, and Sail handles the routing.**

1. Enter the amount
2. Click **Deposit**
3. Select the **wallet** you want to use:
   * Your current connected wallet (often the same one you used to sign in), or
   * **Connect a new Wallet**.
4. Choose the **Token** you want to pay with (you can pick any token you hold in the connected wallet)
5. Click **Confirm Payment**

<figure><img src="https://2171443932-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2FaRvuDeAPVlfdTdwTaykg%2Fuploads%2FY0rwEJb7rDkEXy6LaZGl%2FCaptura%20de%20pantalla%202025-12-26%20a%20las%204.00.38%E2%80%AFp.m..png?alt=media&#x26;token=4fdbd462-6a3a-4965-a617-cd1eea052b3a" alt=""><figcaption></figcaption></figure>

***

#### 3. Deposit with card

Use this if you want to buy stablecoins with a debit/credit card.

1. Enter the amount
2. Click **Deposit**
3. Choose a provider: **Coinbase**, **Stripe**, or **Transak**
4. Complete provider KYC and finish the purchase

<figure><img src="https://2171443932-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2FaRvuDeAPVlfdTdwTaykg%2Fuploads%2FjEbrwCrKI5hmdhOrQGXx%2FCaptura%20de%20pantalla%202025-12-22%20a%20las%206.54.02%E2%80%AFp.m..png?alt=media&#x26;token=c3998211-fa21-44d9-affd-477406ac42fb" alt=""><figcaption></figcaption></figure>
