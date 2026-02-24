Below is a **meticulous technical checklist** you can use to **review and harden your Tapioca Money project’s implementation of EIP-7702 / ZeroDev / smart account logic**, especially in the context of building a non-custodial automated yield agent.

Each item includes **why it matters**, **what to check**, and **reference links** so that Claude Code or any engineer using this checklist can confidently validate every piece.

---

# 📦 **Technical Compliance & Implementation Checklist for EIP-7702 / ZeroDev / Smart Accounts**

---

## ✅ 1️⃣ **EIP-7702 Fundamentals — Correct Delegation Logic**

**Why:** EIP-7702 enables an Externally Owned Account (EOA) to behave like a smart contract during a single transaction by adding code via `SetCodeTransaction`. This is core to AA, gas sponsorship, batching, and automation. ([Ethereum Improvement Proposals][1])

### 🔹 Checklist

- [x] Confirm EIP-7702 code follows the specification of **transaction type `0x04` (SetCodeTransaction)** and uses proper authorization tuples. ([Ethereum Improvement Proposals][1])
- [x] Validate correct construction of `authorization_list` with `(chain_id, delegate_address, nonce, signature)` per spec. ([Ethereum Improvement Proposals][1])
- [x] Ensure delegation can be **cleared/revoked** by delegating to `0x0`. ([ethereum.org][2])
- [x] Test that after setting code, the EOA's **next transactions execute the delegate logic for that tx**. ([docs.fluent.xyz][3])
- [x] Confirm correct **nonce handling** and replay resistance for delegation signatures to avoid permanent dangerous delegation.

### 📚 Reference

EIP-7702 Spec: “**Add a new tx type … allows EOAs to set the code in their account**” ([Ethereum Improvement Proposals][1])
Fluent Docs: “**SetCodeTransaction (`0x04`) writes a delegation indicator**” ([docs.fluent.xyz][3])

---

## 🧠 2️⃣ **ZeroDev Smart Account Integration**

**Why:** Your project uses ZeroDev for AA. Ensure ZeroDev’s SDK correctly wraps and extends EIP-7702 functionality (gasless, batching, session keys). ([docs.zerodev.app][4])

### 🔹 Checklist

- [x] Confirm ZeroDev SDK version supports **EIP-7702** (ZeroDev claims explicit support). ([docs.zerodev.app][4])
- [x] Validate that batch transactions (approve + supply/withdraw) are executed correctly with ZeroDev. ([docs.zerodev.app][4])
- [x] Confirm **gas abstraction** works (pay in ERC-20 or via sponsor) without breaking AA expectations. ([docs.zerodev.app][4])
- [x] Ensure ZeroDev session keys are created securely and scoped (limits, expiry). ([v3-docs.zerodev.app][5])
- [ ] Test recovery / key abstraction flows (social login, passkeys) integrated with ZeroDev. ([zerodev.app][6])

### 📚 Reference

ZeroDev: “**support for both ERC-4337 and EIP-7702**” ([docs.zerodev.app][4])
ZeroDev Session Keys Guide: “**session keys restrict actions and expire**” ([v3-docs.zerodev.app][5])

---

## 🔐 3️⃣ **Secure Session Keys & Delegated Authorization**

**Why:** Session keys allow your backend agent to act on behalf of the user without full custody. Proper limits prevent abuse and loss. ([v3-docs.zerodev.app][5])

### 🔹 Checklist

- [x] Verify session keys **cannot perform actions beyond explicit permissions** (e.g., withdraw only certain tokens). ([v3-docs.zerodev.app][5])
- [x] Confirm session key expiry (validUntil) and rotate or revoke as needed. ([v3-docs.zerodev.app][5])
- [x] Validate whitelist of permitted contracts/functions when generating session keys. ([v3-docs.zerodev.app][5])
- [x] Ensure backend agent uses session keys only for authorized flows (no arbitrary txs).

### 📚 Reference

Session keys: “**used to enable automatic transactions… only what the user allowed**” ([v3-docs.zerodev.app][5])

---

## 📑 4️⃣ **Contract Code & Delegate Templates**

**Why:** EIP-7702 does **not enforce safe delegate logic** itself — the developer must ensure the delegate code is safe and audited.

### 🔹 Checklist

- [x] Select a **vetted delegate implementation** (e.g., ZeroDev’s official templates). ([docs.zerodev.app][4])
- [x] Audit delegate contract logic to ensure no unsafe calls or backdoors.
- [x] Validate batching and sponsor logic works exactly the way business logic expects.
- [x] For your yield agent, ensure your delegate doesn't leave dangerous code in the account beyond intended operations.

---

## 🔄 5️⃣ **Test Batching & Sponsor Flows**

**Why:** One of the main benefits of 7702 is the ability to batch and sponsor transactions in a single operation. ([eco.com][7])

### 🔹 Checklist

- [x] Test simple batching: e.g., ERC-20 approve + Morpho supply supply in one tx. ([eco.com][7])
- [x] Verify sponsor logic (pay gas via sponsor) is processed correctly with session keys. ([docs.zerodev.app][4])
- [x] Simulate complex yield automation sequences (withdraw + reallocate + supply).

### 📚 Reference

EIP-7702 Overview: “**Batching: multiple ops in one atomic transaction**” ([Ethereum Improvement Proposals][1])

---

## 🔍 6️⃣ **ZeroDev Account Abstraction Interop with v430 & Capabilities**

**Why:** ZeroDev supports ERC-4337 smart accounts and leverages EIP-7702 as a bridge for legacy EOAs. ([zerodev.app][8])

### 🔹 Checklist

- [x] Confirm ZeroDev implementation supports **parallel transactions** with 2D nonces. ([zerodev.app][8])
- [x] Ensure that smart account capabilities (session keys, batching, sponsorship) are compatible with your agent flows. ([zerodev.app][8])
- [ ] Evaluate capabilities API (ERC-5792) if integrating further smart-account discovery/perm exchange. ([Ethereum Improvement Proposals][9])

---

## 🔄 7️⃣ **Backend Agent Cron Integration**

**Why:** For automation, the backend agent triggers on intervals or events. You must ensure safe signalling and transaction building.

### 🔹 Checklist

- [x] Validate agent schedules and avoids race conditions.
- [x] Ensure agent respects user permissions (session keys).
- [x] Simulate agent failures and rollback or skip strategies safely.

---

## ⚠️ 8️⃣ **Security & Phishing Guardrails**

**Why:** Real exploits have shown EIP-7702 phishing risk: a malicious 7702 delegation can drain funds. ([arXiv][10])

### 🔹 Checklist

- [x] Ensure UI never signs ambiguous delegation requests.
- [x] Present clear, audited delegation prompts (explicit code address).
- [x] Limit session key scopes to prevent exhaustive access.
- [x] Review phishing vectors and warn users before delegation signing.

### 📚 Reference

Research shows delegation signatures can be misused if users sign malicious auth tuples. ([arXiv][10])

---

## 📡 9️⃣ **Testing & Simulation**

**Why:** EIP-7702 modifies the account model; rigorous testing is required.

### 🔹 Checklist

- [x] Unit tests for SetCode Tx construction & validation (delegation + revocation).
- [x] Integration tests for agent flows with Morpho GraphQL + real transactions.
- [x] Fuzz tests for invalid delegations or replay.
- [x] CI/CD gating for delegate code upgrades.

---

## 🧪 1️⃣0️⃣ **Monitoring & Logging**

**Why:** Rigorous monitoring ensures expected agent automation behavior.

### 🔹 Checklist

- [x] Log all delegated authorizations.
- [x] Log session key creations & permissions.
- [x] Backend traces of agent execution, including server errors.
- [ ] Onchain event watchers for failed transactions or reverts.

---

## 🧾 Summary of Key Reference Docs

| Topic                     | Link                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| EIP-7702 Spec             | `https://eips.ethereum.org/EIPS/eip-7702` ([Ethereum Improvement Proposals][1])                 |
| EIP-7702 High-Level Guide | `https://docs.fluent.xyz/developer-guides/account-abstraction/eip-7702/` ([docs.fluent.xyz][3]) |
| EIP-7702 Explainer        | `https://eco.com/support/en/articles/10442528-what-is-eip-7702` ([eco.com][7])                  |
| ZeroDev Session Keys      | `https://v3-docs.zerodev.app/use-wallets/use-session-keys` ([v3-docs.zerodev.app][5])           |
| ZeroDev AA Support        | `https://docs.zerodev.app/sdk/plugins/session-keys` ([docs.zerodev.app][4])                     |
| ZeroDev AA FAQs           | `https://zerodev.app/faqs` ([zerodev.app][8])                                                   |

---

## 🧠 Final Notes

✔ Use this checklist to validate both your **smart account delegation logic** and your **backend agent flows**.

✔ Pay attention to **EIP-7702 security nuances** — especially phishing risk related to delegation signatures. ([arXiv][10])

✔ ZeroDev’s session keys are your primary tool for secure, automated backend execution without custodial risk. ([v3-docs.zerodev.app][5])

---

If you want, I can also produce a **unit test suite template** (JS/viem/Foundry) that asserts all the key properties above and integrates with CI pipelines.

[1]: `https://eips.ethereum.org/EIPS/eip-7702?utm_source=chatgpt.com` "EIP-7702: Set Code for EOAs"
[2]: `https://ethereum.org/sw/roadmap/pectra/7702/?utm_source=chatgpt.com` "Pectra 7702 guidelines | ethereum.org"
[3]: `https://docs.fluent.xyz/developer-guides/account-abstraction/eip-7702/?utm_source=chatgpt.com` "EIP-7702 | Fluent Docs"
[4]: `https://docs.zerodev.app/sdk/plugins/session-keys?utm_source=chatgpt.com` "ZeroDev Introduction"
[5]: `https://v3-docs.zerodev.app/use-wallets/use-session-keys?utm_source=chatgpt.com` "Use session keys | ZeroDev Documentation"
[6]: `https://zerodev.app/features/key-abstraction?utm_source=chatgpt.com` "Smart Account Keys: Social Login, Session Keys | ZeroDev"
[7]: `https://eco.com/support/en/articles/10442528-what-is-eip-7702?utm_source=chatgpt.com` "What is EIP-7702? | Eco Support Center"
[8]: `https://zerodev.app/faqs?utm_source=chatgpt.com` "ZeroDev FAQs: Account Abstraction, Kernel, ERC-4337 Q&A"
[9]: `https://eips.ethereum.org/EIPS/eip-7902?utm_source=chatgpt.com` "ERC-7902: Wallet Capabilities for Account Abstraction"
[10]: `https://arxiv.org/abs/2512.12174?utm_source=chatgpt.com` "EIP-7702 Phishing Attack"
