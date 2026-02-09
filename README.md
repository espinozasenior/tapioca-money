# Tapioca Finance

Smart yield optimization on Base. Deposit USDC, earn yield across DeFi protocols, and let an autonomous agent maximize your returns.

## Features

- **Privy Authentication** — Login with email or Google, embedded wallets auto-created
- **USDC on Base** — Deposit, send, and manage USDC on Base mainnet
- **Earn Yield** — Deposit into Morpho vaults with real-time APY and risk scoring
- **Autonomous Yield Agent** — ZeroDev session keys enable hands-free rebalancing across vaults
- **Gasless Transactions** — All operations sponsored via ZeroDev Bundler + Paymaster (ERC-4337)
- **Activity Feed** — Full transaction history and agent action timeline

## Autonomous Yield Agent

The agent continuously monitors yield opportunities and rebalances your funds automatically.

### How It Works

1. **One-Time Setup**: Register a ZeroDev Kernel V3 smart account and grant a scoped session key
2. **Continuous Monitoring**: Agent evaluates Morpho vault APYs every 5 minutes
3. **Smart Rebalancing**: When APY improvement exceeds threshold (default 0.5%), the agent moves funds
4. **Gasless Execution**: All transactions sponsored — zero gas fees for users
5. **Full Control**: Disable auto-optimize or revoke session keys anytime

### Security

- Session keys are scoped to approved Morpho vaults only (30-day expiry)
- Authorization revocable at any time
- All transactions simulated before execution
- Rate limits and safety checks prevent excessive operations

See [AGENT_OPERATIONS_GUIDE.md](./AGENT_OPERATIONS_GUIDE.md) for architecture details.

## Setup

1. Clone and install:

```bash
git clone <your-repo-url> && cd tapioca
pnpm install
```

2. Configure environment:

```bash
cp .env.template .env
```

3. Set required variables:

| Variable                   | Source                                              | Notes                                                |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| `NEXT_PUBLIC_PRIVY_APP_ID` | [Privy Dashboard](https://dashboard.privy.io)       | Public, safe to expose                               |
| `PRIVY_APP_SECRET`         | Privy Dashboard                                     | Secret, server-only                                  |
| `ZERODEV_PROJECT_ID`       | [ZeroDev Dashboard](https://dashboard.zerodev.app)  | For Kernel V3 smart accounts                         |
| `DATABASE_URL`             | [Neon Console](https://console.neon.tech)           | Use pooled connection string with `?sslmode=require` |
| `DATABASE_ENCRYPTION_KEY`  | Generate: `openssl rand -hex 32`                    | 32-byte key for AES-256 encryption of session keys   |
| `CRON_SECRET`              | Generate: `openssl rand -hex 16`                    | Authenticates cron requests                          |
| `NEXT_PUBLIC_CHAIN_ID`     | Fixed: `base`                                       | Production chain                                     |
| `NEXT_PUBLIC_USDC_MINT`    | Fixed: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Base mainnet USDC                                    |

Optional:

- `ZERODEV_BUNDLER_URL` — Custom bundler endpoint (defaults to ZeroDev's)
- `AGENT_SIMULATION_MODE` — `true` for testing without real transactions
- `AGENT_MIN_APY_THRESHOLD` — Minimum APY improvement to trigger rebalance (default: `0.005`)

4. Set up the database:

```bash
pnpm db:push
```

5. Run:

```bash
pnpm dev
```

## Deployment

Deploy to Vercel with automatic cron job support for the autonomous agent.

### Quick Deploy

```bash
# Build and verify locally
pnpm build && pnpm test:run

# Deploy
vercel deploy --prod
```

### Cron Configuration

The autonomous agent runs every 5 minutes via Vercel cron (configured in `vercel.json`):

```json
{
  "crons": [{ "path": "/api/agent/cron", "schedule": "*/5 * * * *" }]
}
```

Tuning parameters:

- `CRON_BATCH_SIZE` — Users per batch (default: 50)
- `CRON_CONCURRENCY` — Parallel user processing (default: 10)

### Health Monitoring

```bash
curl https://your-domain.vercel.app/api/agent/health
```

Returns service status for database, ZeroDev bundler, and Morpho API, plus agent metrics (active users, rebalance success rate, error rate).

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full production deployment guide including database migrations, rollback procedures, troubleshooting, and monitoring.

## Tech Stack

- Next.js 15 (React 19, App Router, Turbopack)
- Privy (auth + embedded wallets)
- ZeroDev SDK v5 (Kernel V3 smart accounts, session keys, bundler + paymaster)
- Morpho Blue (vault deposits and yield)
- Viem v2, Base mainnet
- Tailwind CSS v4, Radix UI
- Drizzle ORM + Neon Postgres

## License

This project is licensed under the **Tapioca Finance Business Source License Version 1.0**. See [LICENSE](./LICENSE) for the full terms.

### Key Points

- **Commercial Use**: Allowed, subject to the restrictions in Section 2 of the license
- **Competitive Restriction**: You may not provide this software as a service to third parties if such service competes with Tapioca Finance's commercial offerings without a separate commercial license
- **Patent Grant**: Includes the Apache 2.0 patent grant
- **Automatic Conversion**: On **February 9, 2029** (4 years from the effective date), this license automatically converts to the Apache License 2.0, and the competitive restrictions no longer apply

### Why This License?

This license model allows Tapioca Finance to:

- Generate revenue through commercial offerings
- Protect against competitors directly rehosting our software as a service
- Contribute to the open-source community by automatically converting to Apache 2.0 after 4 years

For questions about commercial licensing before the conversion date, contact licensing@tapioca.finance.

## Attribution

This project is derived from [Crossmint's fintech-starter-app](https://github.com/Crossmint/fintech-starter-app) (MIT). See [NOTICE](./NOTICE) and [THIRD_PARTY_LICENSES](./THIRD_PARTY_LICENSES).
