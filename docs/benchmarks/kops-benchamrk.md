# **Core Concepts**

Understanding KOPS is simple. The entire protocol is built on three fundamental pillars that work together to provide intelligent, secure, and verifiable automation.

**🤖 Agents**

A KOPS Agent is your personal, autonomous financial entity on the blockchain. When you deploy an Agent, you are activating a dedicated assistant that works exclusively for you. It operates from a highly secure, programmatically managed wallet and works tirelessly to execute your chosen strategy. Each Agent acts only within the strict parameters you define, ensuring your capital is always working for you, according to your rules.

**📜 Strategies**

A Strategy is the "playbook" or set of instructions your Agent follows. It's a complete plan designed to achieve a specific financial goal. KOPS offers a curated marketplace of strategies, from simply finding the best interest rates on your stablecoins to executing complex, market-neutral positions. All strategies are rigorously vetted, tested, and audited by our team before being made available, ensuring both security and performance.

**🧾 Verifiable Actions**

This is the KOPS difference. Most AI systems operate as a "black box," forcing you to blindly trust that they are acting in your best interest. KOPS is built on the principle of "don't trust, verify." We use cutting-edge cryptography (zero-knowledge proofs, or ZK-proofs) to create a verifiable, on-chain receipt for every critical action your Agent takes. This allows anyone to mathematically prove that the Agent acted honestly and followed its strategy perfectly, without revealing any of your private data or the proprietary logic of the strategy itself.


# Protocol

To deliver on the promise of self-driving capital that is verifiably executed, KOPS is built on a sophisticated three-layer architecture. Each layer has a distinct role, working together like a coordinated team to turn strategy into secure, on-chain action.

### **Layer 1: The Brain (Orchestration & Intelligence)**

This is the core logic center of the protocol. The Brain is responsible for analyzing the market, identifying opportunities, and deciding on the optimal action for your Agent. It goes far beyond simply chasing the highest advertised APY.

- Holistic Data Analysis: The Decision Engine processes millions of on-chain data points in real-time, including asset prices, liquidity depth, and transaction costs. It also uses Natural Language Processing (NLP) to analyze market sentiment from news and social media, providing a richer, more contextual understanding of market dynamics.
- Predictive AI Models: At its heart are predictive machine learning models. These models don't just see the current yield; they forecast its sustainability and assess protocol risk. This helps your Agent avoid "yield traps" and interact only with high-quality, reputable protocols.
- Sophisticated Optimization: The engine treats every DeFi protocol as a "non-linear optimizer". It understands the unique curves of each liquidity pool and lending market, allowing it to find the true optimal point for capital allocation, not just the one with the highest advertised rate.

### **Layer 2: Intent System (Secure Execution)**

When the Brain decides on an action, it passes a directive to the Intent System. This layer is responsible for translating that strategic decision into a secure and efficient on-chain transaction.

- Secure Wallet Infrastructure: Security is paramount. Agent wallets are created and managed using the Coinbase Wallet API v2. The private keys for these wallets are generated and permanently sealed within a Trusted Execution Environment (TEE), a highly isolated hardware module that makes them inaccessible to any party—including the KOPS protocol itself.
- Permissioned Actions: The system uses a session key framework. The Brain is granted temporary, narrowly-scoped permissions to authorize a specific, pre-defined action (e.g., "deposit 1,000 $HYPE into Hyperbeat"). This ensures the Agent can *never* operate outside its mandated strategy, providing a powerful safeguard against threats.
- Efficient Execution: The Intent System bundles actions to save on gas fees and perform a series of automated "pre-flight health checks" before every transaction to prevent failures and protect your capital from interacting with a paused or compromised protocol.

### **Layer 3: The Proof (Verifiable Action)**

This layer is the cornerstone of KOPS and what truly sets it apart. It solves the "black box" problem of AI by providing an unbreakable, mathematical guarantee of integrity.

- The Trust Problem: In a typical AI-driven system, you have to trust the operators. There is no way to prove an action was legitimate and not the result of a bug or a hidden fee mechanism.
- The Cryptographic Solution: For every critical action, a KOPS Agent generates a Zero-Knowledge Proof (ZK-proof). This proof is a cryptographic receipt, mathematically attesting that the transaction was the direct and unaltered output of the Agent's strategy logic, given the market data at that moment.
- Verifiable Certainty: This ZK-proof can be published on-chain, where anyone can independently verify it. This transforms the trust model. You no longer have to trust our reputation; you can trust the math.

## Reveneu fees
KOPS charges a 15% performance fee on the yield your Agent generates. All fees are transparent and clearly displayed before you start.

## Available Strategies
Full list of current KOPS agent strategies.

1. MaxYield ($USDT0) 
Deposit: $USDT0

Explanation: Best supply rate from classic lending HyperEVM protocols. All position are in $USDT0.

Strategy: Distributing $USDT0 in to best current $USDT0 supply pool across Hypurrfi and Hyperlend.

Protocols used: Hyperlend, Hypurrfi

Risks: Very Conservative. Underlying Protocols.

2. PRJX AI LP
Deposit: $USDT0

Explanation: AI management of the LP position on behalf of the user, always be in a tight range and earn fees.  You also earn PRJX points.

Strategy: 10 tick-wide strategy with auto-compound and rebalance.

Protocols used: PRJX

Risks: IL, total liquidity on USDT/USDC falls to under $50K we might face large IL when swapping and reacting to massice swings in USDT/USDC price. Probability of this is incredibly low. 

3. Ultrasolid AI LP
Deposit: $USDT0

Explanation: AI management of the LP position on behalf of the user, always be in a tight range and earn fees.  You also earn Ultrasolid points.

Strategy: 10 tick-wide strategy with auto-compound and rebalance.

Protocols used: Ultrasolid

Risks: IL, total liquidity on USDT/USDC falls to under $50K we might face large IL when swapping and reacting to massice swings in USDT/USDC price. Probability of this is incredibly low. 

## Getting Started
Deploying your first agent is designed to be seamless.

1. Connect Your Wallet: Navigate to the KOPS app and connect your primary wallet (e.g., MetaMask). This wallet is only for controlling your account.

2. Choose a Strategy: Browse the Strategies. Review the goals, historical performance simulations, and risk parameters for each.

3. Deposit Funds: Deposit the capital you would like the agent to manage into your secure KOPS account. You will go through Agent initiation, Signing Permissions and finally a Deposit.

4. Agent starts positioning into the Strategy: It takes a couple of minutes for the KOPS Agent to enter the strategy. 

5. Monitor & Relax: Track your agent's performance and actions through your personal dashboard. 

6. Withdraw: Once you are satisifed with results you can withdraw. It takes a couple of minutes for the Agent to exit all the positions and send funds directly back to your wallet. 

## Audits
To guarantee user safety and transparency, KOPS has completed several audits with leading blockchain security companies, ensuring our smart contracts meet the highest standards of reliability & trust.

Verichain:

https://verichains.io/?search=kops

Cyberscope:

cyberscope.io/audits/kops

Peckshield:

https://github.com/peckshield/publications/blob/master/audit_reports/PeckShield-Audit-Report-KOPs-MaxYieldUSDT-v1.0.pdf

## Next in line: 

Yield Optimization 

Delta-Neutral LPs

Delta-Neutral Deployment Optimization via Vaults


