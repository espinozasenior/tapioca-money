# Technical Development Plan for the Tapioca Finance Agent

This plan builds on our deep research and existing code. It details how to audit, fix, and extend the Tapioca Finance agent (Node.js) to meet its goals, focusing on ZeroDev account abstraction, Privy integration, Morpho yield logic, and robust operation. All code examples and design decisions are backed by references to documentation and proven patterns.

---

## 1. Code Audit and Test Setup

- **Clone and run tests:** First, clone the [Tapioca Finance repository](https://github.com/espinozasenior/tapioca-finance) and install dependencies. Execute the existing test suite to identify failures, especially those related to EIP-7702.  
- **ZeroDev/Privy points:** Search the code for how ZeroDev’s `KernelAccountClient` or similar is used. Document each integration point where:  
  - ZeroDev smart accounts are created or signed.  
  - Privy wallets or signers are used (`PrivyClient`, `createViemAccount`, etc.).  
  For example, Privy’s Node SDK uses `createViemAccount(privy, {walletId, address})` to obtain a Viem `Account`【60†L477-L485】. Ensure the code follows that pattern.  
- **Dependencies check:** Confirm library versions (e.g. `@privy-io/node`, `@zerodev/kernel`, `viem`, `ethers`). Update to latest stable versions if needed (Privy docs recommend latest Viem【60†L475-L484】).  
- **Morpho GraphQL:** Verify the GraphQL queries for Morpho vault data. Ensure the endpoint and queries (APY, utilization) match Morpho’s current schema. Test queries against a Morpho API (on Base) to ensure correct fields.  

By completing these steps, we establish a working baseline and understand where the code aligns or diverges from best practices.

---

## 2. ZeroDev & Privy Integration

- **Privy wallet setup:** Ensure the code initializes a Privy wallet and Viem account correctly. For example:  
  ```ts
  const privy = new PrivyClient({ appId: "...", appSecret: "..." });
  const {id: walletId, address} = await privy.wallets().create({owner: userId});
  const account = await createViemAccount(privy, {walletId, address});
  ```
  This matches Privy’s docs for creating an EVM wallet and Viem `Account`【60†L477-L485】. Validate that the `walletId` and `address` come from Privy, and handle any authorization context if needed.  
- **ZeroDev smart account:** With the Privy-backed `account`, initialize a ZeroDev smart wallet. Follow the ZeroDev Quickstart (with `KernelClient`). Example:  
  ```ts
  const client = createWalletClient({ account, chain: baseChain, transport: http() });
  const kernelClient = await createKernelAccountClient(client, { entryPoint: ENTRY_POINT_ADDRESS });
  await kernelClient.deploy();
  ```
  After deployment, the user’s EOA has an associated *smart account kernel*. Test that this flow succeeds. Use ZeroDev’s session keys for transaction automation【58†L129-L137】.  
- **Transaction sending:** Once `kernelClient` is ready, use it to send transactions. For batched calls (e.g. Morpho withdraw + deposit), use `kernelClient.execTransactions([...])`. This aligns with ZeroDev’s batch support【58†L129-L137】.  
- **Privy <-> ZeroDev interaction:** Ensure Privy and ZeroDev are connected: when signing a user operation, Privy’s account should sign through the ZeroDev Kernel. Privy’s `Account` can sign EIP-712 data as needed by ZeroDev’s userOp. Test a simple call: deposit some token into a Morpho vault using `kernelClient`.  

**References:** Privy’s integration with Viem【60†L477-L485】 and ZeroDev’s features (batch calls, session keys, sponsored gas) are critical【58†L120-L128】【58†L129-L137】. Ensure the code follows these patterns.

---

## 3. Audit and Fix EIP-7702 Flows

The existing tests indicate errors in EIP-7702 operations. We must fix them:

1. **Verify code delegation:** In ZeroDev/Kernel, “deploy” under the hood sets the EOA’s code via a UserOperation. Ensure the account is recognized as a smart account by the EntryPoint (i.e. it has a kernel). If tests expect a specific delegated code hash, update the test or deployment script accordingly.  
2. **Authorization checks:** EIP-7702 requires verifying a signature for code delegation. Confirm that ZeroDev’s `authorizeTransaction` or Privy’s signer is correctly signing. If tests fail on signature mismatch, check the nonce and input encoding.  
3. **Remove delegation (if needed):** If implementing temporary delegation, write code to “undelegate” after execution. Woogie’s example uses `executeRemoveAccountCode.js`【57†L73-L81】. Add a script or function that resets the EOA to non-smart state, and include it in tests to fully cycle the flow.  
4. **Patch failing tests:** For each failed assertion, adjust either the code or the test. For example, if a test expected a `0xEF0100` prefix on data but got none, prepend it (EIP-7702 convention). If a test expects two calls but only one executed, fix the batching logic. Provide concrete code changes (e.g. adding missing `await kernelClient.execTransactions(...)`).  
5. **Add new tests:** After patching, create tests that simulate realistic scenarios: 
   - “Delegation” test: sign and execute a batch withdrawal of USDC from Morpho vault, check user’s balance change.  
   - “Undelegation” test: after execution, ensure the smart account can still receive normal ETH transactions.  

By thoroughly stepping through each test case, we ensure the AA flow is robust. The corrected implementation should mirror the EIP-7702 process outlined in [Woogie’s example】【49†L261-L270】【57†L42-L51】.

---

## 4. Node.js Module Design

Restructure the code into clear modules for maintainability:

- **`wallet.ts` (Wallet Manager):** Implements user on-boarding, Privy integration, and ZeroDev account creation. Exports functions like `createUserWallet(userId): Promise<Account>` and `getUserAccount(userId): Promise<Account>`. Uses `PrivyClient` and ZeroDev’s client under the hood (as in step 2).  
- **`signer.ts` (Signer/Identity):** Wraps the Privy/ZeroDev account in Viem or Ethers. Provides a generic `Signer` interface to the rest of the app, e.g. `signer.sendTransaction(tx)`. It should read the Privy wallet and ZeroDev kernel to produce a signer connected to the Base network.  
- **`strategy.ts` (Decision Engine):** Encapsulates the trading strategy logic. Uses Morpho data to decide when to rebalance. For example, a function `findBestVault(currentVault): VaultInfo` that returns a better vault if available. This module will consume Morpho GraphQL APIs. Use citations for Morpho’s approach (similar to their rebalancer)【52†L299-L307】.  
- **`vaultAdapter.ts` (Vault Interface):** Implements deposit/withdraw calls for specific vaults (e.g. Morpho’s ERC-4626 vaults). Provides functions like `withdrawFromVault(vaultAddress, amount)` and `supplyToVault(vaultAddress, amount)`, using the connected signer. These functions will be used by the agent to execute rebalances.  
- **`agent.ts` (Automation Agent):** Orchestrates the process. On a schedule (cron), it fetches current positions, invokes `strategy.findBestVault`, and if a better target exists, it calls `vaultAdapter.withdraw...` then `.supply...`. It should execute these as one logical flow (using ZeroDev’s batch support). The agent also logs its actions.  

Structure the code so each module has clear responsibilities. This mirrors frameworks like Gelato examples, but tailored to ZeroDev and Morpho.

---

## 5. Deployment, Security, and Monitoring

- **Deployment:** Containerize the service (e.g. Docker). Ensure environment variables for keys (Privy app credentials, ZeroDev API key, Base RPC URL) are injected securely. Use a process manager (PM2 or systemd) to auto-restart the Node agent.  
- **Security Hardening:** 
  - Limit Privy wallet permissions: use **session keys or policies** so the agent can only call Morpho contracts (ZeroDev’s CallPolicy【58†L129-L137】). 
  - Keep private API keys in secure vault (not in code). 
  - Use TLS for any web endpoints (if any). 
  - Rate-limit or pausable switches: e.g. a config flag to pause the agent in emergencies.  
- **Gas Funding:** If using sponsored gas (ZeroDev can sponsor via a configured paymaster), monitor gas usage. If not, ensure the Privy wallet has enough ETH to pay gas.  
- **Monitoring:** 
  - Log all decisions and transactions to a log system or database. 
  - Set up alerts on errors (e.g. via Slack or email) if a transaction reverts or data fetch fails. 
  - Optionally expose a simple status API (e.g. `/status`) showing last run time, current vault, etc.  
- **Rollback Plan:** In case of critical bug, ensure the agent can be disabled and allow manual withdrawal. Because assets remain in user-owned vaults, users can always withdraw directly via their wallets.

By following this plan, the Tapioca Finance agent will fully implement the desired automated yield strategy using ZeroDev account abstraction and Privy wallets【60†L477-L485】【58†L120-L128】, with robust error handling and security. Each module and step is based on proven patterns from the research references to ensure correctness and reliability.

**Key References:** Privy and Viem integration【60†L477-L485】; ZeroDev capabilities (batch calls, session keys)【58†L120-L128】【58†L129-L137】; EIP-7702 delegation flow【49†L261-L270】; Morpho vault rebalancer example【52†L299-L307】; Vault architecture patterns【51†L442-L450】. Each item above aligns with these sources.