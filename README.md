# Tapioca Money

Smart yield optimization on Base. Deposit USDC, earn yield across DeFi protocols, and let an autonomous agent maximize your returns.

## Features

- **Privy Authentication** — Login with email or Google, embedded wallets auto-created
- **USDC on Base** — Deposit, send, and manage USDC on Base mainnet
- **Earn Yield** — Deposit into Morpho and YO Protocol vaults with real-time APY and risk scoring
- **Autonomous Yield Agent** — ZeroDev session keys enable hands-free rebalancing across vaults
- **Gasless Transactions** — All operations sponsored via ZeroDev Bundler + Paymaster
- **Dual Wallet Support** — EIP-7702 for embedded wallets, ERC-4337 for external wallets (MetaMask, Coinbase, etc.)
- **Activity Feed** — Full transaction history and agent action timeline

## Autonomous Yield Agent

The agent monitors yield opportunities and rebalances your funds automatically.

### How It Works

1. **One-Time Setup**: Register a ZeroDev Kernel V3 smart account and grant a scoped session key
2. **Daily Monitoring**: Agent evaluates vault APYs across Morpho and YO Protocol
3. **Smart Rebalancing**: When APY improvement exceeds threshold, the agent moves funds
4. **Gasless Execution**: All transactions sponsored — zero gas fees for users
5. **Full Control**: Disable auto-optimize or revoke session keys anytime

### Security

- Session keys are scoped to approved Morpho + YO vaults only (7-day expiry)
- All API endpoints require Privy JWT authentication
- Authorization revocable at any time
- All transactions simulated before execution
- Rate limits (Redis-backed) and safety checks prevent excessive operations
- AES-256-GCM encryption for session key storage

See [AGENT_OPERATIONS_GUIDE.md](./AGENT_OPERATIONS_GUIDE.md) for architecture details.

## Setup

1. Clone and install:

```bash
git clone <your-repo-url> && cd tapioca
pnpm install
```

2. Configure environment:

```bash
cp .env.example .env.local
```

3. Set required variables:

| Variable                   | Source                                             | Notes                                                |
| -------------------------- | -------------------------------------------------- | ---------------------------------------------------- |
| `NEXT_PUBLIC_PRIVY_APP_ID` | [Privy Dashboard](https://dashboard.privy.io)      | Public, safe to expose                               |
| `PRIVY_APP_SECRET`         | Privy Dashboard                                    | Secret, server-only                                  |
| `ZERODEV_PROJECT_ID`       | [ZeroDev Dashboard](https://dashboard.zerodev.app) | For Kernel V3 smart accounts                         |
| `DATABASE_URL`             | [Neon Console](https://console.neon.tech)          | Use pooled connection string with `?sslmode=require` |
| `DATABASE_ENCRYPTION_KEY`  | Generate: `openssl rand -hex 32`                   | 64-char hex key for AES-256-GCM encryption           |
| `NEXT_PUBLIC_BASE_RPC_URL` | Alchemy / Infura                                   | Base mainnet RPC URL                                 |
| `REDIS_URL`                | Upstash / Redis Cloud                              | Required for rate limiting in production             |
| `CRON_SECRET`              | Generate: `openssl rand -hex 16`                   | Authenticates cron requests                          |
| `RELAYER_PRIVATE_KEY`      | Generate dedicated EOA                             | For EIP-7702 undelegation relayer                    |

Optional:

- `ZERODEV_BUNDLER_URL` — Custom bundler endpoint (defaults to ZeroDev's)
- `AGENT_SIMULATION_MODE` — `true` for testing without real transactions
- `NEXT_PUBLIC_ENABLE_ERC4337_FALLBACK` — Enable ERC-4337 path for external wallets (default: `true`)

See [.env.example](./.env.example) for the full list of environment variables.

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

The autonomous agent runs daily via Vercel cron (configured in `vercel.json`):

```json
{
  "crons": [{ "path": "/api/agent/cron", "schedule": "0 12 * * *" }]
}
```

Tuning parameters:

- `CRON_BATCH_SIZE` — Users per batch (default: 50)
- `CRON_CONCURRENCY` — Parallel user processing (default: 10)

### Health Monitoring

```bash
curl -H "x-cron-secret: $CRON_SECRET" https://your-domain.vercel.app/api/agent/health
```

Returns service status for database, ZeroDev bundler, and vault APIs, plus agent metrics (active users, rebalance success rate, error rate).

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full production deployment guide including database migrations, rollback procedures, troubleshooting, and monitoring.

## Tech Stack

- Next.js 15 (React 19, App Router, Turbopack)
- Privy (auth + embedded wallets)
- ZeroDev SDK v5 (Kernel V3.3 smart accounts, session keys, EIP-7702 + ERC-4337)
- Morpho (vault deposits and yield)
- YO Protocol (vault deposits and yield)
- Viem v2, Base mainnet
- Tailwind CSS v4, Radix UI
- Drizzle ORM + Neon Postgres
- Redis (rate limiting, session blacklisting, distributed locks)
- Vitest (testing)

## License

This project is licensed under the **Tapioca Money Business Source License Version 1.0**. See [LICENSE](./LICENSE) for the full terms.

### Key Points

- **Commercial Use**: Allowed, subject to the restrictions in Section 2 of the license
- **Competitive Restriction**: You may not provide this software as a service to third parties if such service competes with Tapioca Money's commercial offerings without a separate commercial license
- **Patent Grant**: Includes the Apache 2.0 patent grant
- **Automatic Conversion**: On **February 9, 2029** (4 years from the effective date), this license automatically converts to the Apache License 2.0, and the competitive restrictions no longer apply

### Why This License?

This license model allows Tapioca Money to:

- Generate revenue through commercial offerings
- Protect against competitors directly rehosting our software as a service
- Contribute to the open-source community by automatically converting to Apache 2.0 after 4 years

For questions about commercial licensing before the conversion date, contact licensing@tapioca.money.

## Attribution

This project is derived from [Crossmint's fintech-starter-app](https://github.com/Crossmint/fintech-starter-app) (MIT). See [NOTICE](./NOTICE) and [THIRD_PARTY_LICENSES](./THIRD_PARTY_LICENSES).
