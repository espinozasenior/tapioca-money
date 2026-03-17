YO is a secure multi-chain DeFi yield optimizer that continuously rebalances portfolios for the best risk-adjusted returns.

# YO Protocol

### Summary of the yoVaults;

The yoVault protocol is a robust, secure, and efficient smart contract system designed to streamline asset management across blockchain platforms. Built on the widely recognized ERC4626 standard, yoVault automates the optimization of user assets across various decentralized finance (DeFi) strategies and chains. This vault eliminates manual management by intelligently reallocating funds to ensure users consistently achieve optimal returns.

yoVault incorporates a unique asynchronous redemption mechanism. Users can initiate a withdrawal request at any time, and the vault immediately processes these if it has sufficient liquidity. If the vault lacks immediate liquidity, redemption requests are securely stored until fulfilled by authorized operators, who are empowered to manage liquidity efficiently.

Risk management is integral to yoVault’s design. It actively monitors asset valuations and implements automatic safeguards, such as pausing operations when significant percentage changes occur in asset values, protecting users against volatility and market disruptions.

Transparent and predictable fees can be charged on both deposits and withdrawals, clearly defined within preset limits to ensure fairness. Currently these fees are set to 0. yoVault employs rigorous access control through clearly defined user and operator permissions, bolstered by the AuthUpgradeable contract. The system’s transparency is enhanced by integrating oracle-driven reporting mechanisms that regularly update aggregated balances and asset valuations.

Overall, yoVault simplifies onchain asset management, offering a secure, automated, and transparent solution ideal for both individual users and institutional participants seeking optimized yield strategies with minimal manual intervention.

# Why should I use YO?

If you’re tired of constantly chasing the highest yields across multiple blockchains and DeFi protocols: YO is designed specifically for you. Manually searching for yield opportunities is exhausting, time-consuming, and expensive, forcing you to pay bridging fees, endure trading slippage, and deal with volatile yields that change without notice.

YO eliminates these pain points by automatically seeking and investing in the best risk-adjusted yield opportunities across multiple blockchains. No manual chasing, bridging headaches, or slippage losses involved for you. Using a smart, risk-adjusted approach, YO delivers more consistent yield earnings and helps you achieve a steadier, predictable DeFi earnings.

Say goodbye to endless research, complex interfaces, high gas costs, and frustrating yield chasing. With YO, you get clarity, simplicity, and peace of mind knowing your crypto is continuously optimized in a safe, transparent environment. It’s your trusted companion to finally making DeFi earnings reliable, stress-free, and efficient.

<figure><img src="https://2576447856-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fwkm0XGONc7sDuNeJww6d%2Fuploads%2F3up0Oy2naeKSYZIK8tZz%2Ffeatures.png?alt=media&#x26;token=253daee4-24a0-4e63-9997-ba7b58b6c469" alt=""><figcaption></figcaption></figure>

# yoVault Tokens

In a nutshell, yoVault tokens are a basket of yield-generating pools for a specific asset exposure. This means that yoETH is a basket of ETH pools, yoBTC a basket of BTC pools and so on. Anyone can mint yoTokens by depositing the corresponding underlying asset into the YO protocol, and anyone can redeem yoVault tokens for underlying assets.&#x20;

<figure><img src="https://2576447856-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fwkm0XGONc7sDuNeJww6d%2Fuploads%2FrHHQKOkHE2IICnAsbJPq%2FyoTokens.png?alt=media&#x26;token=e0d10651-b10c-493f-80fd-e2c055d07147" alt=""><figcaption></figcaption></figure>

yoVault tokens are fully self-custodial, compatible with any wallet that supports ERC20 tokens.&#x20;

### Yield-bearing tokens

yoVault tokens like yoETH are yield-bearing in nature as the assets that collateralize the token are invested in yield-generating pools across DeFi. As the value of those pools increase relative to the underlying asset of the vault, the exchange rate of yoToken <> underlying asset keeps increasing.&#x20;

Users do not need to interact with the protocol to claim or harvest yield. Simply by holding yoTokens in their wallet, they are already earning yield on the underlying asset. yoTokens are not rebasing to facilitate composability with partner protocols.&#x20;

<figure><img src="https://2576447856-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fwkm0XGONc7sDuNeJww6d%2Fuploads%2F307NmrTCyxKv34MZ8r2A%2FTLDR.png?alt=media&#x26;token=8973627b-cc7c-4695-96e4-f22eecd35805" alt=""><figcaption></figcaption></figure>

# Risks

Like all DeFi protocols, YO isn’t risk-free. While YO is built to optimize for the best risk-adjusted yield, there are still risks to be aware of when depositing your crypto:

### Smart contract risk

YO vaults rely on smart contracts to operate. While we’ve taken every measure to secure the protocol, including audits and continuous monitoring, there’s always a risk of a bug or vulnerability in the code, whether in YO or in the underlying protocols we allocate to.

### Protocol risk

YO allocates your funds across a curated list of pools from vetted protocols, but every DeFi protocol comes with its own risks. These include things like oracle manipulation, bad debt, and governance exploits. We mitigate this by only investing in pools with solid fundamentals and by using [Exponential.fi’s Risk Ratings](https://exponential.fi/learn/risk-rating) to avoid protocols with excessive risk.

### Chain risk

YO is multi-chain, so it interacts with multiple blockchains. We are currently live on Ethereum and Base, with more chains coming soon. If a specific chain goes down, is congested, or suffers from a consensus failure, it may affect the vault performance.

### Liquidity risk

Most of the time, you can redeem your assets instantly. But if a large number of users want to exit at the same time or a vault has heavy exposure to less liquid pools, your withdrawal may be delayed for up to 24 hours as the protocol unwinds positions.

### Strategy risk

YO directs funds to a variety of pools and strategies. YO may run advanced DeFi strategies like automated carry trades or concentrated liquidity farming in order to generate higher yields. Underlying pools and strategies are all verifiable onchain. These pools and strategies can sometimes underperform or incur losses due to market volatility or execution lag.

### Bridging risk

Moving assets across chains involves bridging, which introduces another layer of risk. YO minimizes bridging risk by only rebalances when a better opportunity is confirmed. However, in the rare case that a bridge is compromised, funds could be at risk.

YO is designed to reduce your exposure to unnecessary risk, but it can’t eliminate risk entirely. That’s why we optimize for risk-adjusted yield—maximizing returns while keeping risk in check.

Exponential.fi has a comprehensive report of YO protocol here:

{% embed url="<https://exponential.fi/protocols/yo/8056939b-d456-48f7-8611-e14e31a6f8e7>" %}

# FAQ

## General FAQ

<details>

<summary>What is YO?</summary>

YO is your multi-chain yield optimizer, continuously rebalancing your assets across DeFi to deliver the best risk-adjusted yield.

</details>

<details>

<summary>How does YO work?</summary>

When you deposit, YO allocates your assets to the highest-yielding pools across multiple chains, optimizing yield and managing rebalancing for the vault. Allocations are adjusted based on pool risk using Exponential.fi's trusted ratings. The underlying pool listings are transparent and can be viewed on the vault page.

</details>

<details>

<summary>What makes YO different?</summary>

YO never stops hunting. YO scans the entire DeFi ecosystem, across chains and protocols, to find the best risk-adjusted yield for your assets. It continuously adds new opportunities and auto-rebalances across pools to keep your yield optimized.

</details>

<details>

<summary>Why does YO have superior yields?</summary>

YO looks for all the pools within a strategy and is asset-, protocol- and chain-agnostic: e.g. yoBTC can allocate cbBTC or tBTC, on Morpho or Aave, on Base or Ethereum.

\
YO optimizes yield on a risk-adjusted basis by investing new deposits in the most attractive yields and redeeming withdrawals from the least attractive yields, on a risk-adjusted basis.<br>

YO automates strategies you cannot perform on your own, like continuously moving to the highest tick to provide liquidity to cbETH-wETH on Aerodrome, or performing a carry trade on BTC to earn higher yields.

</details>

<details>

<summary>How does vault allocation work?</summary>

Vault allocation consists of two key components: underlying pools and target allocation. The target allocation defines how assets are distributed across these pools, ensuring diversification while maximizing risk-adjusted yield.

</details>

<details>

<summary>How is the YO yield calculated?</summary>

Yield is calculated as the weighted average of the yields from the underlying pools within a vault and considers any idle assets.

</details>

<details>

<summary>How can I embed YO yield in my dApp?</summary>

Check the section [Build with YO](https://docs.yo.xyz/integrations/build-with-yo) here in our docs

</details>

## Vaults FAQ

<details>

<summary>How does the rebalancing of pools and allocation work?</summary>

Each yoVault has a target allocation of pools, which is a subset of all the whitelisted pools for the vault. Every day, the protocol calculates the optimal allocation based on the existing pools' risk rating and trending yield. The protocol then divests assets from the least attractive pools and invests those in the higher yielding ones.&#x20;

</details>

<details>

<summary>How are new protocols and chains selected for integration? Who does this?</summary>

The YO team, together with the YO community on Telegram and Discord, actively monitors the DeFi ecosystem to identify attractive yield opportunities, across all protocols and chains. Each opportunity is evaluated based on factors such as the sustainability of its yield source, its risk rating, and the efficiency of capital flows in and out of the position.

When a high-quality opportunity is identified, the development team is responsible for integrating the relevant protocol or chain into the YO vault infrastructure. Once integrated, the algorithm automatically allocates new deposits to the opportunity, but only if it offers the most attractive risk-adjusted return at that time.

Looking ahead, YO’s governance will play a more active role by voting on which pools and protocols should be prioritized for integration. The algorithm will continue to decide where capital is allocated and may choose not to allocate funds to a governance-approved opportunity if it doesn't meet performance or risk thresholds. Governance is not yet active but is planned for a future phase of the protocol.

</details>

<details>

<summary>How often are the vaults rebalanced?</summary>

Vaults are rebalanced for the optimal risk-adjusted yield on a daily basis.

</details>

<details>

<summary>How do you weigh yield vs risk?</summary>

YO uses Exponential.fi's risk ratings to quantify pool risk. Each rating has a quantitative score that represents the probability of the pool losing all of its value. All pools' APYs are weighted against their probability of a total wipeout and that results in a risk-adjusted yield for each pool. The YO algorithm then finds the allocation that maximizes the risk-adjusted yield of the vault.

</details>

<details>

<summary>How are gas costs, bridging fees and other costs handled?</summary>

At the moment, the Protocol is sponsoring gas fees. All of the other costs of the vault are socialized among depositors. The optimization algorithm does take costs into consideration to avoid unnecessary transactions on a daily basis. This means that even if one pool is particularly high-yielding on one day, the protocol will not rebalance towards that pool automatically to avoid incurring bridging and trading fees unnecessarily. Once a trend has been confirmed, the vault is rebalanced. <br>

This approach makes yield farming more efficient for you as an individual, given that keeping tabs on all of these costs, risks and pools is really a full-time job and that's why YO exists.&#x20;

</details>

<details>

<summary>Are the contracts audited? </summary>

Yes! You can find a link to our audits [here](https://docs.yo.xyz/protocol/security-audits)

</details>

<details>

<summary>Can I instantly withdraw my funds? Are there any lock-up periods?</summary>

The yoVaults keep a % of their assets idle so that you can redeem your yoTokens instantly. When you want to redeem a larger portion of the vault's assets, your withdrawal will be queued and may take up to 24 hrs to execute.

\
In those cases, your yoTokens will be burnt and as soon as the protocol redeems assets from the existing positions, you will receive your assets in your wallet automatically without having to come back to claim them. \
\
You can read a more detailed explanation [in our blog.](https://www.yo.xyz/blog/post/how-yo-solves-vault-withdrawals)

</details>

<details>

<summary>How are third-party token rewards handled? </summary>

All rewards are continuously reinvested into the vault as soon as they are claimable. Including TOKE, FLUID, MORPHO, etc.. They are reflected in the top-level APY as well as in the performance of the vault. This means yoVaults sell the reward tokens for more of the underlying asset or in some edge cases, they are reinvested as-is (when rewards are in the same token as the underlying asset of the vault). These reinvestments are continuous and executed as soon as the rewards exceed a specific amount to not overpay in gas for reinvestments.

</details>

## yoVault tokens FAQ

<details>

<summary>What are yoVault tokens?</summary>

Each Vault has a dedicated strategy, or yoToken. yoETH is investing in yield strategies based on ETH. yoBTC is investing in yield strategies based on BTC. When you mint yoTokens, you are entering at a specific yoToken <> asset exchange rate and that rate increases over time. You don't have to claim yield or do anything, your assets grow automatically with the protocol. The yoTokens you receive after depositing an asset in the vault represent your share in the vault.&#x20;

</details>

<details>

<summary>Which wallets are compatible with yoVault tokens? </summary>

Any wallet that supports ERC20 tokens is compatible with yoTokens. If you need to manually import the token into your wallet, please check the list of [token addresses](https://docs.yo.xyz/protocol/contract-addresses)&#x20;

</details>

<details>

<summary>How do yoVault tokens generate yield? </summary>

yoTokens increase in value relative to their underlying asset as yield accrues. Yield accrues through the various underlying pools and investment strategies that the vault is investing in. The yield accrues to all participants in the vault proportionally to their share in the vault while they are holding the yoTokens.

</details>

<details>

<summary>Can I use yoVault tokens in DeFi?</summary>

Yes! yoTokens are compatible with the ERC-4626 and ERC-20 standards so anyone can build using yoTokens. We are working to bring native DeFi integrations for yoTokens. Stay tuned in our X, Discord, or Telegram communities.

</details>

### $YO Rewards FAQ

<details>

<summary>How do I earn $YO rewards?</summary>

$YO rewards are earned for qualifying activities going forward. The Rewards Program will consist of multiple "Heats", and the first Heat began on January 29th, the same day $YO was introduced. You will be able to earn $YO rewards in two ways:<br>

1. Deposit into YO Vaults

   Choose between yoUSD, yoETH, yoEUR, yoBTC, or yoGOLD vaults and start earning base yield plus additional $YO rewards.

2. Participate in DeFi activities

   Add liquidity to all of our supported DeFi activities to earn $YO rewards.

</details>

<details>

<summary>For how long will $YO rewards be issued? </summary>

YO reserved 30% of its token supply to reward the community, including through the $YO Rewards program. Reward rates will vary over time but they will be active for the foreseaable future with no plans to stop them.&#x20;

</details>

<details>

<summary>What's the difference between native APY and reward APY?</summary>

Native APY is the yield earned by the vault's investments and positions in DeFi. This yield is paid in the same asset that you deposited and it compounds continuously. You don't need to do anything to earn this yield. Reward APY is an additional yield paid in $YO tokens to incentivize long-term holders. These additional $YO tokens have to be claimed in the app.&#x20;

</details>

<details>

<summary>How is the Reward APY calculated?</summary>

Reward APY is calculated based on the last price of $YO (FDV of $90M or $0.09 per $YO) and the amount of token rewards assigned to each activity such as deposit & hold or other DeFi activities. &#x20;

</details>

<details>

<summary>How long do I have to claim my rewards? How often can I claim them?</summary>

You can claim $YO rewards continuously throughout the day as your account will earn $YO rewards every few hours. Our provider Merkl, takes multiple snapshots in the day to distribute rewards, which you have to claim. In some ocassions, these snapshots are taken only once a day. You can claim new rewards only after the snapshots are taken. \
\
You have 90 days to claim your $YO rewards. If you don't, we may reassign those rewards.&#x20;

</details>

# AI Agents

Build AI-powered applications on top of YO Protocol using our open-source agent skills.&#x20;

Whether you're scripting vault interactions from the command line, building React dashboards, or writing backend services that prepare deposit and redeem transactions, our skills give your AI coding agent full context on the SDK, CLI, and React hooks, so it can generate correct, up-to-date code without hallucinating APIs.&#x20;

Install them with `npx skills add yoprotocol/yo-protocol-skills --all` or browse the individual skills below

{% embed url="<https://github.com/yoprotocol/yo-protocol-skills>" %}

# Whitepaper

The pursuit of yield has always driven innovation in finance. In traditional finance (TradFi), investors earn yields from cash savings, stock dividends, foreign exchange, market making, and fixed-rate bonds. Financial institutions have historically managed these opportunities through products like high-yield funds, bundling a diversified basket of these investments on behalf of their customers. However, these institutions often reserve the most attractive yields for clients with substantial holdings, citing both logistical complexity and limited incentives to share profits.

Decentralized finance (DeFi) emerged as an alternative to this structure, allowing anyone to engage directly in yield-generating activities such as lending, staking, market making, and bridging assets across blockchains. By removing intermediaries, blockchain technology promised to democratize yield, enabling everyday users to capture returns that were previously accessible only to well-capitalized institutions. This ethos has spurred a Cambrian explosion of yield opportunities across hundreds of blockchains and thousands of protocols.

Yet, as DeFi has grown, it has become clear that complexity and fragmentation present significant obstacles. Investors today must navigate an ever-expanding landscape of chains, protocols, and assets, each with its own yield dynamics, risk profiles, and operational challenges. Evaluating factors like gas fees, liquidity, slippage, and counterparty risks can be overwhelming, especially for those who lack the time or expertise to research constantly shifting market conditions. Most users simply want to earn a stable return on their preferred asset, regardless of what chain it is on. While high yields exist, they often come with trade-offs, such as smart contract vulnerabilities, centralization risks, or illiquidity. A risk-adjusted yield accounts for these factors, ensuring that returns are optimized without exposing users to undue risk.

This whitepaper introduces YO (“Yield Optimizer”), a cross-chain solution designed to address these challenges through continuous yield optimization. YO connects to multiple blockchains, allowing users to access yield opportunities across different networks from a single platform. Instead of managing separate wallets and protocols, users can easily invest and track their earnings in one place. Through its algorithm, YO selects the most promising investment opportunities, consolidates them for depositors, and dynamically adjusts allocations in response to market changes and risk parameters. In doing so, YO aims to fill the gap in the current DeFi landscape by offering both new and experienced users a straightforward, efficient way to earn consistent returns in the decentralized economy.

Here is the **full transcription of the images** you provided.

---

# Protocol Overview

YO (“the Protocol”) is a chain- and protocol-agnostic DeFi solution that optimizes yield for users through curated asset vaults (ETH, BTC, and USD stablecoins). YO abstracts away the complexities of cross-chain transactions and protocol selection. Users simply deposit their preferred asset, and the Protocol handles the rest, eliminating much of the operational overhead typically associated with multi-chain DeFi investing. Unlike single-chain optimizers, YO sources yield from a broad range of protocols across multiple blockchains, allowing users to access a diversified yield portfolio within a single vault.

## User-Friendly Risk Management

YO incorporates a pool-level risk rating system based on the research of the Exponential DeFi team. These scores account for thousands of risk vectors, including protocol design, collateralization, and liquidity, providing each pool with a transparent risk score. This approach relieves users of the burden of analyzing every underlying chain, protocol, or asset. Once an investor identifies the asset exposure they want to have, the only consideration is whether the pool’s yield is worth its risk. Because the risk score already incorporates all aspects of a pool’s risk, the rational investor does not need to burden themselves with the identification of the exact protocol, underlying asset or chain. The rational investor only cares about optimizing their risk-adjusted yield, knowing that YO maintains allocations within a defined risk threshold.

## Liquid, Composable Yield-Bearing Tokens

YO also introduces yoTokens, which function as liquidity pool tokens (LPTs) representing each depositor’s share of the Protocol’s yield-bearing assets. These tokens accrue value over time, reflecting the returns generated by YO’s dynamic yield allocation strategy. Because yoTokens adhere to widely recognized token standards, they maintain composability within the broader DeFi ecosystem, enabling holders to deploy them in other protocols, lend or borrow against them, or engage in other use cases without forfeiting the underlying yield they continue to earn.

---

# Algorithmic Rebalancing

YO leverages a sophisticated algorithm that continuously identifies high-value opportunities across various blockchains and protocols. This system adjusts allocations in response to shifting yields and risk levels, promptly moving assets from pools where yield has diminished to more attractive destinations. This automated rebalancing process occurs with minimal manual intervention and is guided by a set of governance-defined parameters to ensure that risk remains managed throughout. By swiftly adapting to new market information, YO seeks to optimize returns while staying within its targeted risk profile.

---

# Multi-Chain Compatibility

While many DeFi protocols focus on a single chain, YO is inherently designed to operate across multiple blockchains. It utilizes decentralized bridges and an internal trading engine to move assets between chains, identifying the best risk-adjusted yields among supported networks such as Ethereum, Arbitrum, Optimism, Base and Solana. This cross-chain infrastructure helps reduce fees through strategic batching of transactions and intelligent routing, allowing users to keep a larger portion of their returns. YO also aims to offer deposit and redemption functionalities on multiple chains, granting users the convenience of interacting with the Protocol on whichever chain best suits their needs. Although YO will initially deploy on a single chain, its architecture is built for seamless expansion, ensuring it can scale to new blockchains as demand grows.

---

# Yield Optimization Algorithm

YO employs a systematic, algorithm-driven method to allocate new deposits across an approved set of pools, each of which is vetted and whitelisted by the community for a given asset index. At launch, the initial set of pools will be determined in collaboration with the Exponential DeFi team. Post launch, the pool selection process will gradually shift to the community. The community selects pools that get listed for each index, and defines a set of exposure parameters that help limit the exposure of each index. These exposure parameters are:

- **Buffer for withdrawals (per chain):** Ensures there is always sufficient liquidity to accommodate user withdrawals without requiring emergency divestments.
- **Max % exposure per pool/protocol/chain:** Prevents excessive concentration in a single pool, protocol or blockchain, reducing systemic and smart contract risks.
- **Max % exposure per risk rating:** Limits the allocation to higher-risk pools to maintain a balanced risk-adjusted yield across the index.
- **Max % exposure to fixed maturity pools (e.g. Pendle, Spectra):** Avoids overcommitting funds to pools with locked durations, preserving flexibility for rebalancing and withdrawals.
- **Minimum amount of deposit or withdrawals to trigger a rebalancing:** Prevents unnecessary rebalancing due to small transactions, optimizing gas efficiency and minimizing unnecessary asset movement.

The Protocol considers all listed pools based on their risk adjusted yield and their yield and allocates new deposits to the most attractive pool(s) subject to the constraints of the defined parameters. For example, assuming there are 3 pools listed, the Protocol will direct deposits that exceed the buffer to pool ranked #1 until the max exposure of one of the parameters is met, then it will direct the remaining deposits to the pool ranked #2, and so on and so forth.

This algorithm-driven yield allocation method balances maximum risk-adjusted return and exposure.

---

If you want, I can also help you **improve this whitepaper section** (there are some repetitions and wording issues that would be flagged by crypto investors or technical reviewers).

# Resources

- https://github.com/yoprotocol/yo-protocol-skills/blob/main/skills/yo-protocol-cli/SKILL.md
- https://www.npmjs.com/package/@yo-protocol/cli
- https://github.com/yoprotocol
