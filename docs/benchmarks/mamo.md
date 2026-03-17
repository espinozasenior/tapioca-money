## Who Mamo Helps

Mamo is built for the many, not the few. It is for people who want to grow their wealth without the complexity that usually comes with it.

You do not need financial expertise. You do not need to monitor markets. You only need the desire for calm, steady progress and the willingness to start a simple habit.

Mamo meets you where you are today and grows alongside you, one quiet step at a time.

## Mamo is here for:

### 🐣 The just-getting-started

You have some funds set aside and are wondering what comes next. Mamo helps you take that first meaningful step toward smart growth, with no complicated onboarding and no financial jargon. Just a simple path to start building.

### 📈 The growing saver

You have been saving and now you are ready to put your money to work. Mamo finds safe, smart opportunities and manages the details so you can focus on other things.

### 🧘 The financial minimalist

You want your money to grow without spreadsheets, stress, or decision fatigue. Mamo runs quietly in the background, keeping your money productive while you focus on what matters most in your life.

### 🌍 Those overlooked by traditional finance

No credit history? No bank account?

All you need is a phone and an internet connection. Mamo helps you begin your wealth journey without the usual barriers, because compounding should be for everyone.

### 🤔 The curious but cautious

You are interested in growing your money but are not sure where to begin. With Mamo, you learn as you earn. Each step comes with clear context that builds understanding without overwhelming you.

---

## **In short:**

Mamo is for people who want their wealth to grow steadily without the noise that usually surrounds it.

No hype. No complex dashboards. No pressure to become a financial expert overnight. Just steady wins through smart, thoughtful habits. You stay in control while Mamo does the heavy lifting.

## System Flow

1. Mamo Backend whitelists a strategy implementation.
2. User requests Mamo to deploy a strategy for them.
3. Mamo deploys a strategy and calls `addStrategy` to register the strategy for the user.
4. User deposits funds directly into their strategy.
5. Mamo Backend calls updatePosition if it identifies a better yield in a determined market/vault.
6. Mamo Backend (or anyone) claims rewards on behalf of the strategy.
7. When rewards are claimed, the reward token balance for the strategy contract increases, so bots can swap rewards for the underlying token on behalf of the user using CowSwap:
   - The user must first call `approveCowSwap` to approve the reward token for the vault relayer
   - Cow Swap calls the isValidSignature function on the strategy contract to validate orders
   - The strategy verifies the order parameters and checks that the price matches the Chainlink price within the set slippage tolerance using the SlippagePriceChecker
   - Any bot can fulfill the order as long as the price is valid according to the SlippagePriceChecker
8. Backend (or anyone) can call depositIdleTokens to deposit any underlying funds currently in the contract into the strategies based on the split.
9. Users can withdraw funds directly from the strategy whenever they want.
10. If Mamo wants to upgrade a strategy (for example, to deposit tokens into a new protocol), it can whitelist the new implementation and ask users to upgrade through the MamoStrategyRegistry contract. Users can only upgrade to the latest implementation of the same strategy type.

## Security Considerations & Assumptions

1. Implementation whitelist ensures that only trusted and audited implementations can be used.
2. Strategy implementations can be upgraded, but only to whitelisted implementations of the same strategy type and the upgrade must be initiated by the user.
3. The Mamo Strategy Registry is not upgradeable and the backend can't remove a user strategy. This ensures strategies can always call the Registry to find its owner, and the owner will always be the only address allowed to upgrade a strategy.
4. Strategy contracts have clear ownership semantics, with only the user registered in the Mamo Strategy Registry able to deposit and withdraw funds, while only the backend address from the Mamo Strategy Registry can update positions.
5. Reward token can't be the strategy token.
6. Mamo Registry admin role is a multisig with a timelock.
7. Guardian is a multisig without a timelock.
8. The strategy integrates with Cow Swap through the isValidSignature function, which validates orders according to EIP-1271. Any bot can fulfill orders as long as the price matches the Chainlink price within the set slippage tolerance, as verified by the SlippagePriceChecker contract.
9. The system does not support fee-on-transfer tokens. Using such tokens would result in deposit and withdrawal failures due to balance discrepancies, as the contracts assume that the exact amount of tokens specified is transferred.

## What is the USDC Account?

The Mamo USDC Account gives your stablecoins a clear purpose. You deposit USDC and Mamo puts it to work. Earnings come from borrower interest and market rewards, then flow back into your balance as more USDC. The process runs continuously without manual actions or ongoing decisions.

{% hint style="info" %}
[**USDC**](https://www.circle.com/usdc) (USD Coin) is a regulated stablecoin by [**Circle**](https://www.circle.com/usdc). Each USDC maintains a 1:1 value with the US dollar and is fully backed by cash or cash equivalents. This makes USDC easy to hold, easy to move, and predictable in value.
{% endhint %}

## How your money grows

When you deposit USDC, Mamo allocates it across two trusted destinations on [**Base**](https://www.base.org/)**,** [**Moonwell**](https://moonwell.fi/) and [**Morpho**](https://morpho.org/). Borrowers access USDC liquidity from these platforms and pay interest in return. That interest becomes your earnings.

Mamo monitors both destinations continuously and shifts USDC toward the option paying more. Allocation updates follow rate changes, not fixed schedules. You do not manage positions or compare rates yourself. Mamo handles that for you, automatically.

| Mamo USDC Account                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="../.gitbook/assets/moonwell-logo (1).svg" alt="" data-size="line"> [**Moonwell**](https://moonwell.fi/) **—** [**Moonwell USDC Core Market**](https://moonwell.fi/markets/supply/base/usdc) **(**[**Base**](https://www.base.org/)**)**   |
| <img src="../.gitbook/assets/image (1) (1) (1).png" alt="" data-size="line"> [**Morpho**](https://morpho.org/) **—** [**Moonwell USDC Flagship Vault**](https://moonwell.fi/vaults/deposit/base/mwusdc) **(**[**Base**](https://www.base.org/)**)** |

<figure><img src="../.gitbook/assets/Twitter post - 23.png" alt=""><figcaption><p>Mamo USDC Account</p></figcaption></figure>

## What you earn

Your USDC balance grows through borrower interest and reward tokens.

Borrower interest accrues directly to your USDC balance as long as funds remain deposited. This provides steady, predictable growth tied to borrowing demand.

You also receive WELL and MORPHO rewards from the underlying market and vault. Once you earn reward of $5 dollars in value, Mamo will convert them into USDC and adds them to your balance. Rewards never require claiming. Everything becomes more USDC.

## How compounding works

Interest and converted rewards automatically reinvest into your USDC balance. Each increase earns alongside your original deposit. Growth compounds continuously without input from you.

Mamo tracks real time rates across the market and vault and reallocates only when conditions increase or decrease. This keeps your Bitcoin positioned where earnings stay higher without constant movement or tuning.

## How reward conversions are handled

WELL and MORPHO reward tokens convert into USDC using verified market price checks to keep conversions aligned with fair market value before compounding. Converted USDC flows straight back into your balance and continues earning.

## Security and control

Your USDC stays under your control from start to finish. Mamo never takes custody. Funds move into a personal smart contract vault controlled by you.

You decide when to add funds, pause deposits, or withdraw. No lockups apply.

## Access anytime

Withdraw USDC at any time. No waiting periods. No penalties. Pause or resume based on your schedule.

---

## At a glance

- Deposit USDC.
- Mamo allocates your funds to where it earns the most.
- Interest and rewards increase your balance.
- Rewards convert into USDC automatically.
- Control stays with you.

Your USDC, earning steadily in the background.

# 🛠️ How It Works

Mamo is built to feel simple. That simplicity is intentional. It comes from smart, automated systems working quietly in the background to keep your money safe, productive, and always within your control.

Whether you’re growing stablecoins in the USDC Account or building your Bitcoin stack with cbBTC, Mamo takes care of the complexity so you can focus on the bigger picture.

## How Mamo Works

1. **Account creation**\
   When you open a Mamo Account (USDC, cbBTC, MAMO), Mamo deploys dedicated smart contracts linked directly to your wallet. You keep full control of your funds. Mamo never takes custody, and only you can move them.
2. **Funds put to work**\
   Mamo allocates your USDC or cbBTC to Moonwell or Morpho, automatically selecting the market or vault with the highest available rate. If you deposit MAMO, your balance continues to earn a share of platform revenue each week through reward distributions.
3. **Earning begins**\
   You earn interest from borrowers in USDC or cbBTC, plus extra rewards like WELL and MORPHO tokens. Mamo quietly collects it all for you.
4. **Smart conversion**\
   When rewards reach about $5, Mamo converts them into more of your deposited asset using CowSwap, with prices verified by Chainlink oracles. This ensures fair pricing and avoids small, inefficient swaps.
5. **Auto-compounding**\
   Interest and converted rewards are folded back into your balance automatically. Your earnings generate more earnings — no manual steps, no spreadsheets.
6. **Always accessible**\
   Withdraw anytime. Your funds go straight to your wallet instantly, even if Mamo is offline. You can add, pause, or withdraw without lockups or waiting periods.
7. **Updates with permission**\
   If Mamo ships an upgrade, you’ll get a clear prompt and must approve any changes before they happen. No surprise migrations, you stay in control.

# 🛡️ Security and Risk

## **Your money, your control. Our promise.**

Mamo is simple on the surface and secure at the core. It was built so security never gets in the way of calm, steady growth. While you practice good financial habits such as regular deposits and long-term thinking, we protect your funds with systems designed to keep you in control from start to finish.

There are no confusing rules, only thoughtful security that works quietly in the background.

### 🛡️ Self-custody, no exceptions

When you deposit into Mamo, funds do not go into a communal pool or an opaque account. They flow directly into a personal smart contract vault that belongs to your wallet alone, similar to a safe deposit box where only your key works.

Mamo can guide your funds but never take them. Every action, whether it is a deposit, withdrawal, or strategy change, requires your signature.

Your money remains accessible at all times. If Mamo is ever offline, you can still access your funds directly through any standard wallet or block explorer. There is no scenario where Mamo holds your funds. We build the rails and you steer the train.

### 🔐 Security by design

Security is built into every part of Mamo’s systems, not added as an afterthought.

- **Independent audits**\
  Trust comes from proof, not promises. Mamo has been independently audited by leading security firms, including [Certora](https://www.certora.com) and [Halborn Security](https://halborn.com). You can review the results in our Audits section.
- **$250K bug bounty**\
  Our [Code4rena](https://code4rena.com) bug bounty program pays up to $250,000 to white-hat hackers who responsibly disclose vulnerabilities before bad actors can exploit them. Continuous incentives mean continuous scrutiny and stronger safety over time.
- **Permissioned upgrades**\
  No silent contract migrations. Any upgrade requires your explicit approval. If you choose not to approve, nothing changes. No hidden moves, no surprises.
- **Fail-safe access**\
  Your vault is a transparent smart contract on the Base network. Even if Mamo were to go offline, you would retain 100% control of your balance using any Ethereum-compatible wallet.

### 👀 Transparency

Financial stress often comes from hidden rules and unclear terms. Mamo keeps things clear:

- No hidden fees in fine print
- No lockups preventing withdrawals
- No unexpected changes disrupting your progress

### 🧠 Smart protection for your earnings

Earning yield is valuable, but keeping it safe is even more important. When Mamo converts bonus tokens such as WELL or MORPHO back into USDC or cbBTC, three layers of safety are applied:

1. [**CowSwap**](https://swap.cow.fi/) **batch auctions** prevent front-running and “sandwich” attacks
2. [**Chainlink**](https://chain.link/) **oracles** act as independent price feeds, halting any swap when market prices deviate from fair value
3. **Tight slippage limits** ensure you do not lose value during volatile price swings. If conditions are not right, Mamo waits before converting your rewards

### ⚖️ Honest about risk

All investing carries risk. Mamo is upfront about what those risks are:

- **Variable APY**: Interest rates change with borrower demand. A 12% rate today may be 8% tomorrow or even in the next hour. Mamo always seeks the best available rate, but the number will change.
- **Smart contract risk**: Independent audits and bug bounties reduce the chance of vulnerabilities, but no code is perfect.
- **Protocol risk**: Mamo routes funds to Moonwell and Morpho on Base. These platforms have strong track records and multiple audits, but they are not backed by government insurance.

Our role is to minimise risk, communicate it clearly, and ensure you can adjust your position at any time.

## Audits

Only you can withdraw your funds from your dedicated Mamo account.

Mamo has been independently audited by Certora and Halborn Security, and is backed by a bug bounty program with Code4rena — offering up to $250,000 for the discovery of vulnerabilities. Because real trust comes from transparency, not assumptions.

## Earning

Rewards are sourced from trading fees on @AerodromeFi, not through token printing or incentive programs.

he MAMO token is paired with many of the best assets on @AerodromeFi
on Base, including @DefinitiveFi’s EDGE.

Every time someone trades between EDGE and MAMO on Aerodrome, Mamo earns a fee. With EDGE now listed on @upbitglobal and @BithumbOfficial
, trading volume is up.

More volume means more fees. And 100% of what Mamo earns will be distributed to MAMO depositors

- Solidity contracts
  https://github.com/moonwell-fi/mamo-contracts

- website
  https://mamo.bot/
