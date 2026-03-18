## What Is Tapioca?

Tapioca is a personal AI agent for DeFi yield. It autonomously moves your stablecoins across vetted vaults on Base for the best net yield — while your funds never leave your own wallet. You stay in control through scoped session keys and can revoke access at any time.

## How Does Tapioca Work?

You fund your wallet with USDC, then register your AI agent with a single toggle. The agent gets a scoped session key — permission to move funds only between pre-approved vaults. It evaluates yield opportunities hourly and rebalances when a better option covers gas and slippage costs. You can review every transaction, see where funds are allocated, and disable the agent whenever you want.

## Where Does The Yield Come From?

Tapioca routes across DeFi yield sources on Base, including Morpho vaults, Aave, Moonwell, and YO Protocol. APY shown in-app is the current rate for each vault, and your overall return depends on where your balance is allocated and how often the agent rebalances.

## Are There Fees?

Currently, Tapioca does not charge performance fees. Gas costs on Base are fully sponsored via paymaster — every transaction is gasless for you. Fees may be introduced as the platform scales, but always transparently and with clear disclosure.

## Which Stablecoins And Networks Does Tapioca Support?

Tapioca currently supports USDC on Base. Additional stablecoins and networks may be added in the future based on vault availability and user demand.

## How Do Deposits Work?

You can deposit in a few ways:

- **Deposit with card**: Use the in-app fiat on-ramp (powered by Crossmint) to buy USDC with a card or ACH transfer — funds arrive directly in your wallet.
- **Send stablecoins**: Transfer USDC on Base to your wallet address directly.
- **Deposit into vaults**: Once funded, browse available vaults sorted by APY and deposit manually, or let the AI agent handle allocation automatically.

## How Do Withdrawals Work?

You can exit any vault position from the dashboard. For most vaults (like Morpho), withdrawal is instant — USDC returns to your wallet immediately. For YO Protocol vaults, redemptions may be queued through the gateway and you can track their status in-app. Funds always go back to your own wallet.

## How Is Tapioca Secure?

Tapioca is designed so you never give up custody of your funds:

- **Your own wallet**: Funds stay in your EOA or smart wallet at all times. There are no strategy contracts or shared pools.
- **Scoped session keys**: The AI agent operates with a time-limited session key (7-day expiry) that can only call pre-approved vault functions — no arbitrary transactions.
- **Permission boundaries**: Every session key is bound by a CallPolicy (which contracts/functions), GasPolicy (spending limits), RateLimitPolicy (max operations per day), and TimestampPolicy (expiration).
- **Revoke anytime**: You can revoke the agent's access with one click. For EIP-7702 users, this removes the on-chain delegation entirely.
- **Gasless execution**: All transactions are executed as UserOps through a bundler with paymaster sponsorship — you never sign raw transactions.
