# Self-Custody AI Agent Infrastructure for DeFi (2025-2026)

## Research Date: March 2026

## Core Question

Can an AI agent manage capital on-chain on behalf of a user while the user retains full custody and can revoke at any time?

**Answer: Yes, definitively.** Multiple production-ready solutions now exist. The design space has matured significantly since Pectra (EIP-7702) shipped on Ethereum mainnet on May 7, 2025. The key differentiators are: (1) where the private key lives, (2) how permissions are scoped and enforced, and (3) how revocation works.

---

## Comparison Table

| Project | Custody Model | EIP-7702 | ERC-4337 | Multi-Protocol | Production Ready | Could Replace Our UserOp Code |
|---------|--------------|----------|----------|---------------|-----------------|-------------------------------|
| **Lit Protocol (Vincent)** | Non-custodial (threshold MPC + TEE) | Not explicit | Not explicit | Yes (Morpho, Aave, Uniswap, deBridge) | Early Access (Sep 2025) | Partially -- different paradigm |
| **Turnkey** | Non-custodial (TEE enclaves) | Not confirmed | Not confirmed | Protocol-agnostic (raw signing) | Yes (production) | No -- signing layer only |
| **Privy + ZeroDev** (current) | Non-custodial (session keys + serialize/deserialize) | Yes (native) | Yes (dual path) | Manual integration | Yes (production, we run it) | N/A (this IS our code) |
| **Safe + Zodiac Roles** | Non-custodial (multisig + Roles module) | No (Safe is ERC-4337 native) | Yes | Yes (any contract call) | Yes (battle-tested, $100B+ secured) | Yes -- strongest candidate |
| **Biconomy (Nexus + Smart Sessions)** | Non-custodial (modular smart account) | Yes (native) | Yes (ERC-7579) | Yes (AAVE, Morpho, Yearn + hundreds via MEE) | Yes (production, 4.6M+ accounts) | Yes -- strongest candidate |
| **Coinbase AgentKit / Agentic Wallets** | Semi-custodial (TEE, keys in Coinbase infra) | Yes (Smart Wallet supports 7702 upgrade) | Yes | Limited (Base-centric, growing) | Yes (50M+ x402 txns) | Partially -- vendor lock-in risk |
| **ElizaOS** | Varies (plugin-dependent: raw keys, Lit, TEE) | Via plugins | Via plugins | Yes (cross-chain via CCIP) | Framework only, not infra | No -- agent framework, not wallet infra |
| **Brian.so** | Custodial-adjacent (intent layer, user signs) | Not confirmed | Not confirmed | Yes (multi-protocol intent resolution) | Beta | No -- NLP layer, not execution |
| **Aperture Finance** | Protocol-managed (solver network) | Not confirmed | Not confirmed | Limited (Uniswap V3/V4 focused) | Yes (live, $12M raised) | No -- different product category |
| **Openfort** | Non-custodial (embedded smart wallets) | Yes | Yes | Protocol-agnostic | Yes (production) | Yes -- viable alternative |

---

## Detailed Analysis

### 1. Lit Protocol -- Vincent Platform

**What it is:** Decentralized key management network using threshold cryptography (MPC) + TEE. Vincent is their agent-specific platform launched in Early Access (Sep 2025).

**Architecture:**
- Programmable Key Pairs (PKPs) are split across the Lit network -- no single node holds a complete key
- Agents operate with delegated PKPs; policies are enforced at signing time by Lit Actions (serverless functions running in TEEs)
- Four primitives: Accounts, Abilities, Policies, Apps

**Self-custody model:** Strong. Keys are threshold-split across a decentralized network. User delegates specific "abilities" (e.g., "swap on Uniswap up to $X") with onchain policies. User can revoke abilities at any time.

**Permissions:**
- Fine-grained: time windows, rate limits, value ceilings, slippage caps, position size limits
- Policies stored onchain and enforced by the Lit network at signing time
- Composable: abilities can be mixed and matched per agent/app

**Multi-protocol:** Morpho, Aave v3, Uniswap v3, deBridge at Early Access. Growing.

**Production readiness:** Early Access. 7,000+ Vincent Agent Wallets created. Not yet battle-tested at scale.

**Key strength:** The only solution where the signing infrastructure itself is decentralized. No single entity (not even Lit) can sign on behalf of the user.

**Key weakness:** Early stage. SDK maturity unclear. No explicit EIP-7702/4337 support documented -- uses its own account abstraction approach.

**Verdict for Tapioca:** Watch closely. The decentralized signing model is philosophically superior, but we would need to validate SDK stability, gas costs, and latency before migrating.

---

### 2. Turnkey

**What it is:** Enterprise-grade non-custodial wallet infrastructure. All key operations happen in secure enclaves (TEEs).

**Architecture:**
- Keys generated and stored in TEEs -- Turnkey never has access to plaintext keys
- Policy engine scopes what each key can do
- Delegated access model for AI agents
- 50-100ms signing latency, 99.9% uptime

**Self-custody model:** Strong non-custodial. User controls the root key; agent gets a sub-key with scoped policies.

**Production readiness:** Very high. Used by Spectral (4.5M daily users), Axiom, and others.

**Key strength:** Enterprise reliability, raw signing speed, clean API.

**Key weakness:** It is a signing infrastructure, not a smart account SDK. You still need to build session key logic, permission scoping, and UserOp construction yourself. It does not replace our ZeroDev code -- it replaces Privy's embedded wallet layer.

**Verdict for Tapioca:** Could replace Privy as our embedded wallet provider, but would not simplify our UserOp/session key code. Only relevant if we hit Privy-specific limitations.

---

### 3. Privy + ZeroDev (Current Approach)

**What it is:** Our current stack. Privy provides embedded wallets + auth. ZeroDev provides ERC-4337/EIP-7702 smart accounts with session keys via serialize/deserialize pattern.

**Architecture (as implemented in Tapioca):**
- Client creates kernel account with EOA as sudo validator, session key as regular validator
- `serializePermissionAccount` captures the enable signature + CallPolicy
- Server `deserializePermissionAccount` to execute UserOps without the EOA private key
- Dual-path: EIP-7702 for embedded wallets, ERC-4337 for external wallets
- Scoped permissions: per-vault (target, selector) pairs with spending limits

**Self-custody model:** Strong. User's EOA key never leaves Privy's MPC infrastructure. Session key is scoped and time-limited (7 days). User can revoke by undelegating (7702) or revoking session (4337).

**Known pain points from our experience:**
- Manual permission management: every new protocol requires updating `createAndSerializeAccount` with new (target, selector) pairs
- Re-registration required after any CallPolicy change
- External wallet support required building a separate 4337 path
- EIP-7702 signing constraints with Privy (embedded wallets only for signAuthorization)
- Undelegation requires server-side relayer with Type 4 tx (ZeroDev bundler rejects address(0) auth)
- Gas estimation failures (AA23) when target addresses missing from approvedVaults
- SDK surface area is large and under-documented for edge cases

**Key strength:** We own the full stack. Maximum flexibility. Both 7702 and 4337 paths working.

**Key weakness:** Significant engineering burden. Every protocol integration is manual. Permission changes require user re-registration.

---

### 4. Safe + Zodiac Roles Modifier

**What it is:** Safe{Wallet} (formerly Gnosis Safe) is the most battle-tested smart account ($100B+ secured). Zodiac Roles Modifier is an onchain permissions module maintained by Gnosis Guild.

**Architecture:**
- Safe is an N-of-M multisig smart account (ERC-4337 compatible)
- Zodiac Roles Modifier is installed as a Safe module
- Roles define which addresses, functions, and parameters an agent can call
- Agent address is granted a role; it can execute any permitted call unilaterally (no multisig approval needed for in-scope actions)
- Out-of-scope actions still require multisig approval

**Self-custody model:** Very strong. Safe is user-owned. Agent is a module with scoped permissions. User (as Safe owner) can remove the module at any time via a standard Safe transaction.

**Permissions:**
- Granular: per-contract, per-function, per-parameter constraints
- Example: "Agent can call Morpho.deposit() with USDC only, max 10,000 USDC per call"
- Onchain enforcement -- impossible to bypass
- No session key expiry needed; module can be removed instantly

**Multi-protocol:** Any smart contract call can be permitted. Protocol-agnostic.

**Production readiness:** Safe: extremely battle-tested. Zodiac Roles: used by Lagoon Finance, Karpatkey, and others for treasury management with AI agents. Almanak uses Safe + Zodiac for their AI agent wallets.

**Key strength:** Most audited and trusted smart account in DeFi. Roles Modifier is purpose-built for delegation. No custom UserOp code needed -- standard Safe transactions.

**Key weakness:** Requires users to deploy a Safe (or already have one). Not a same-address model like EIP-7702. Higher gas for Safe deployment. Less suited for retail users who want their EOA to be the smart account.

**Verdict for Tapioca:** Strong candidate for a future architecture, especially if targeting power users or institutional users who already have Safes. The Roles Modifier would eliminate our manual permission management. However, it changes the UX model (users interact with a Safe address, not their EOA).

---

### 5. Biconomy (Nexus + Smart Sessions + MEE)

**What it is:** Modular smart account infrastructure. Nexus is their ERC-7579 compliant smart account. Smart Sessions enable scoped delegation. MEE (Modular Execution Environment) handles cross-chain composability.

**Architecture:**
- Nexus smart account: 25% lower gas than alternatives (their claim)
- Smart Sessions: users define permissions (contract access, function limits, token caps), approve with a single gasless signature, then agents operate within boundaries
- EIP-7702 support: Smart Sessions work with both smart accounts and EOAs (via EIP-7702)
- Delegated Authorization Network (DAN): off-chain authorization layer for AI agents
- MEE extends ERC-4337 for cross-chain execution

**Self-custody model:** Strong. User owns the smart account. Agent operates via Smart Session with scoped permissions. EIP-7702 revocation is native (EOA owner creates new authorization).

**Permissions:**
- Smart Sessions with reusable policies and validators (ERC-7579 modules)
- Time-boxed, budget-scoped session keys
- Example from docs: AI rebalancing across AAVE, Morpho, and Yearn with USDC-only permissions
- Pre-built integrations for "hundreds of DeFi protocols" via Supertransaction API

**Production readiness:** High. 4.6M+ smart accounts deployed. $1.1B+ processed.

**Key strength:** Native EIP-7702 support with Smart Sessions. The Supertransaction API could eliminate our manual permission/selector management. Cross-chain execution via MEE.

**Key weakness:** Vendor dependency. Less battle-tested than Safe for high-value custody. DAN documentation is thin.

**Verdict for Tapioca:** THE strongest candidate to replace our current hand-rolled UserOp code. Biconomy's Smart Sessions + EIP-7702 support + multi-protocol integrations directly address our biggest pain points. The Supertransaction API could replace our manual (target, selector) pair management. Worth a serious proof-of-concept.

---

### 6. Coinbase AgentKit / Agentic Wallets

**What it is:** Coinbase Developer Platform's toolkit for giving AI agents wallets. Agentic Wallets are purpose-built wallet infrastructure for autonomous agents.

**Architecture:**
- Keys isolated in Coinbase TEEs
- Session spending caps, per-transaction limits, KYT screening
- x402 protocol for machine-to-machine payments
- Smart Wallet is ERC-4337 compliant, supports EIP-7702 upgrade
- Framework-agnostic (works with LangChain, OpenAI Agents SDK, etc.)

**Self-custody model:** Semi-custodial. Keys are in Coinbase's TEEs. Described as "non-custodial" and "exportable," but Coinbase operates the infrastructure. Not the same trust model as threshold MPC (Lit) or user-held keys (ZeroDev session keys).

**Permissions:** Policy-based. Humans set objectives, spending limits, risk parameters. Agents execute within boundaries. KYT (Know Your Transaction) compliance screening built in.

**Multi-protocol:** Growing. Currently Base-centric. Solana support added. Smart contract deployment supported.

**Production readiness:** High for Coinbase ecosystem. 50M+ x402 transactions.

**Key strength:** Easiest onramp. Pre-built skills for common operations. Compliance built in. Good for agents that need to operate in a regulated context.

**Key weakness:** Vendor lock-in to Coinbase infrastructure. Semi-custodial trust model (you trust Coinbase's TEEs). Base-centric. Not ideal for DeFi-native users who want true self-custody.

**Verdict for Tapioca:** Not a fit for our self-custody-first philosophy. The trust model (Coinbase holds keys in their TEEs) is weaker than what we have with Privy + ZeroDev. However, AgentKit's framework-agnostic design and x402 protocol are worth studying for inspiration.

---

### 7. ElizaOS (formerly ai16z)

**What it is:** Open-source TypeScript framework for building autonomous AI agents. Not wallet infrastructure -- it is an agent runtime that connects to various wallet backends via plugins.

**Architecture:**
- Plugin-based: EVM plugin, Solana plugin, TEE plugin, Lit Agent Wallet plugin, AgentKit plugin
- Agent manages character/personality, memory, and tool selection
- Wallet management delegated to whichever plugin is installed
- Cross-chain via Chainlink CCIP integration (Nov 2025)

**Self-custody model:** Depends entirely on which wallet plugin is used:
- Raw private key in env vars: custodial (agent holds key)
- Lit Agent Wallet plugin: non-custodial (threshold MPC)
- TEE plugin (Phala Network): hardware-secured
- AgentKit plugin: semi-custodial (Coinbase TEE)

**Multi-protocol:** Yes, via plugin system. EVM, Solana, and cross-chain.

**Production readiness:** Framework is mature (v2). But it is a framework, not infrastructure. You build agents on it; it does not solve the wallet/custody/permissions problem.

**Key strength:** Largest open-source AI agent ecosystem. Extremely flexible plugin system.

**Key weakness:** Does not solve the self-custody delegation problem. You still need to pick a wallet backend (Lit, Turnkey, ZeroDev, etc.) and integrate it.

**Verdict for Tapioca:** Not relevant as a replacement for our wallet infrastructure. Could be relevant if we wanted to build a more sophisticated AI agent runtime (natural language understanding, memory, multi-step reasoning) on top of our existing wallet stack.

---

### 8. Brian.so (Brian Knows)

**What it is:** AI-powered intent resolution layer for Web3. Translates natural language prompts into executable smart contract calls.

**Architecture:**
- Brian-8B model (fine-tuned Llama-3.1-8B) for Web3 intent recognition
- Intent Recognition Engine translates "Swap 10 USDC for ETH on Uniswap" into calldata
- API-based: returns transaction objects that the user/agent signs
- Does not hold keys or manage wallets

**Self-custody model:** N/A -- Brian is a translation layer. The user/agent signs transactions with their own wallet. Brian generates the calldata.

**Multi-protocol:** Yes -- trained on multi-protocol transaction patterns.

**Production readiness:** Beta. The Intent Recognition Engine and Brian-8B model are in active development.

**Key strength:** Could dramatically simplify our decision engine. Instead of manually constructing calldata for each protocol, ask Brian "deposit 1000 USDC into Morpho USDC vault on Base" and get back ready-to-sign calldata.

**Key weakness:** Trust in AI-generated calldata. A hallucinated function selector or wrong address could drain funds. Requires verification layer.

**Verdict for Tapioca:** Interesting as a calldata generation layer, but too risky for production without a verification/simulation step. Our current approach of hardcoded (target, selector) pairs is more secure, even if less flexible.

---

### 9. Aperture Finance

**What it is:** Intent-based DeFi automation platform with a solver network. Focused on liquidity management (Uniswap V3/V4).

**Architecture:**
- Users state goals in natural language or structured intents
- Solver network finds optimal execution paths
- Automated liquidity management, rebalancing, fee auto-compounding

**Self-custody model:** Protocol-managed. Users deposit into Aperture's contracts. The solver network manages positions.

**Multi-protocol:** Limited. Primarily Uniswap V3/V4. Not a general-purpose agent infrastructure.

**Production readiness:** Live. $12M raised. DefiLlama tracked.

**Verdict for Tapioca:** Different product category. Aperture is a managed DeFi product, not agent infrastructure. Not relevant as a replacement for our stack.

---

### 10. Protocol-Native Agent Integration

**Uniswap AI Skills (Feb 2026):** Uniswap Labs released 7 open-source "skills" for AI agents: security-foundations, configurator, deployer, viem-integration, swap-integration, liquidity-planner, swap-planner. CLI-installable. This is the beginning of protocols publishing their own agent interfaces.

**Trend:** Major DeFi protocols are starting to publish agent-friendly SDKs and MCP (Model Context Protocol) integrations. This will eventually make manual (target, selector) pair management obsolete -- agents will use protocol-published tools instead of raw calldata.

---

## Recommendations for Tapioca Finance

### Short-Term (0-3 months): Stay on Privy + ZeroDev

Our current stack works. The pain points are real but manageable. No competing solution is mature enough to justify a migration right now.

**Immediate improvements:**
1. Extract permission definitions into a config file so adding new protocols does not require code changes in `client-secure.ts`
2. Investigate ZeroDev's latest permission validator updates -- they may have improved the re-registration requirement
3. Monitor Uniswap AI Skills and similar protocol-native agent interfaces

### Medium-Term (3-6 months): Proof-of-Concept with Biconomy

Biconomy's Nexus + Smart Sessions is the most direct replacement for our hand-rolled code:
- Native EIP-7702 support (matches our primary path)
- Smart Sessions eliminate manual (target, selector) management
- Supertransaction API handles multi-protocol calldata
- 25% lower gas (their claim, needs verification)
- ERC-7579 modular architecture means we can add custom validation logic

**PoC scope:** Build a parallel registration path using Biconomy Smart Sessions. Compare gas costs, latency, and developer experience against our ZeroDev implementation for the same operations (Morpho deposit/redeem, Pendle deposit/redeem).

### Medium-Term Alternative: Safe + Zodiac Roles

If targeting institutional or power users:
- Safe is the gold standard for high-value custody
- Zodiac Roles Modifier is purpose-built for agent delegation
- No custom UserOp code needed
- But changes UX model (Safe address vs EOA)

### Long-Term (6-12 months): Watch Lit Protocol Vincent

Vincent's decentralized signing model is the philosophically correct answer to "who should hold the keys?" But it needs time to mature:
- Wait for General Availability
- Monitor security audits of the Lit network
- Evaluate gas costs and latency at scale
- The "Abilities" model (composable protocol integrations) could be transformative

### Do NOT Pursue

- **Coinbase AgentKit/Agentic Wallets**: Semi-custodial trust model does not align with our self-custody-first approach
- **Brian.so**: Too risky as a calldata generation layer without verified simulation
- **Aperture Finance**: Different product category entirely
- **ElizaOS**: Agent framework, not wallet infrastructure -- orthogonal to our needs

---

## Key Takeaway

The landscape has shifted from "can we do this?" to "which approach is best?" The answer depends on trust model priorities:

1. **Maximum decentralization**: Lit Protocol Vincent (threshold MPC, no single party holds keys)
2. **Maximum battle-testedness**: Safe + Zodiac Roles ($100B+ secured, most audited)
3. **Best developer experience for EIP-7702**: Biconomy Nexus + Smart Sessions
4. **Best current production stability**: Privy + ZeroDev (what we run today)
5. **Easiest onramp**: Coinbase AgentKit (but semi-custodial)

For Tapioca specifically, Biconomy is the most compelling next step because it directly addresses our biggest pain point (manual permission management) while maintaining the same trust model (non-custodial, user-owned smart account, scoped session keys) and supporting our primary path (EIP-7702).

---

## Sources

- [Lit Protocol - Vincent Early Access](https://www.prnewswire.com/news-releases/lit-protocol-launches-vincent-early-access-for-building-ai-agents-in-defi-302546693.html)
- [Lit Protocol - Vincent Architecture](https://spark.litprotocol.com/meet-vincent-an-agent-wallet-and-app-store-framework-for-user-owned-automation/)
- [Lit Protocol - Vincent on Blockworks](https://blockworks.co/news/lit-protocol-vincent-ai-agents)
- [Turnkey - AI Agents Solution](https://www.turnkey.com/solutions/ai-agents)
- [Turnkey - 2025 Wrapped](https://www.turnkey.com/blog/2025-turnkey-crypto-wallet-infrastructure)
- [ZeroDev - Permissions / Session Keys](https://docs.zerodev.app/smart-wallet/permissions/intro)
- [ZeroDev - EIP-7702 Quickstart](https://docs.zerodev.app/sdk/getting-started/quickstart-7702)
- [Safe Agentathon 2025](https://safe.global/ai)
- [Zodiac Roles Modifier Docs](https://docs.roles.gnosisguild.org/)
- [Zodiac Roles Modifier - GitHub](https://github.com/gnosisguild/zodiac-modifier-roles)
- [Gnosis Guild - Onchain Permissions](https://gnosisguild.mirror.xyz/oQcy_c62huwNkFS0cMIxXwQzrfG0ESQax8EBc_tWwwk)
- [Biconomy - EIP-7702 Guide](https://blog.biconomy.io/a-comprehensive-eip-7702-guide-for-apps/)
- [Biconomy - Nexus Smart Account](https://blog.biconomy.io/nexus-the-operating-system-for-smart-accounts/)
- [Biconomy - MEE + EIP-7702](https://docs.biconomy.io/new/getting-started/enable-mee-eoa-7702)
- [Biconomy - Permissions Infrastructure](https://www.biconomy.io/post/securing-the-artificial-intelligence-driven-crypto-future-biconomy-permissions-infrastructure)
- [Coinbase AgentKit - GitHub](https://github.com/coinbase/agentkit)
- [Coinbase - Agentic Wallets](https://www.coinbase.com/developer-platform/discover/launches/agentic-wallets)
- [Coinbase - AgentKit Q1 Update](https://www.coinbase.com/developer-platform/discover/launches/agentkit-q1-update)
- [Coinbase - EIP-7702 FAQs](https://docs.cdp.coinbase.com/paymaster/paymaster-7702-faq)
- [ElizaOS Documentation](https://docs.elizaos.ai)
- [ElizaOS - Lit Agent Wallet Plugin](https://x.com/LitProtocol/status/1884703972558360938)
- [ElizaOS - TEE Plugin](https://github.com/elizaos-plugins/plugin-tee)
- [Brian Knows - AI Models](https://docs.brianknows.org/brian-ai-models)
- [Aperture Finance](https://www.aperture.finance/)
- [Uniswap AI Agent Skills](https://www.cryptotimes.io/2026/02/21/uniswap-rolls-out-7-ai-skills-for-automated-defi-execution/)
- [Openfort - Agent Wallet Infrastructure](https://www.openfort.io/solutions/ai-agents)
- [Openfort - EIP-7702 Deep Dive](https://www.openfort.io/blog/eip-7702-with-erc-4337)
- [Almanak - Safe + Zodiac for AI Agents](https://docs.almanak.co/docs/wallets/)
- [Lagoon - Safe + Zodiac Roles Setup](https://docs.lagoon.finance/curation-solutions/how-to/how-to-setup-safe-and-zodiac-roles-modifier)
