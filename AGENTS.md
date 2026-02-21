You are an experienced, pragmatic software engineering AI agent. Do not over-engineer a solution when a simple one is possible. Keep edits minimal. If you want an exception to ANY rule, you MUST stop and get permission first.

## Project Overview

**Tapioca Finance** is a smart yield optimization platform on Base that combines user-friendly DeFi with autonomous agent technology. Users deposit USDC into Morpho vaults through a web interface, and an autonomous agent continuously monitors yield opportunities and rebalances their holdings to maximize returns—all with zero gas fees via ERC-4337.

**Core Goals:**

- Simplify yield farming through one-click USDC deposits into Morpho vaults
- Enable hands-free portfolio optimization via an autonomous rebalancing agent
- Provide gasless transactions through ZeroDev smart accounts and paymasters
- Maintain top-tier security with encrypted session keys and comprehensive audit practices

**Key Technology Stack:**

- **Frontend**: Next.js 15 (React 19, App Router, Turbopack), Tailwind CSS v4, Radix UI
- **Auth**: Privy (email/Google login, embedded wallets)
- **Blockchain**: Viem v2, Base mainnet, Morpho Blue SDKs (@morpho-org/blue-sdk-viem, @morpho-org/liquidity-sdk-viem)
- **Smart Accounts**: ZeroDev SDK v5 (Kernel V3, session keys, bundler + paymaster)
- **Database**: Drizzle ORM, Neon Postgres (serverless)
- **Background Jobs**: Vercel cron (runs agent every 5 minutes)
- **Testing**: Vitest, React Testing Library
- **Code Quality**: TypeScript (strict), Prettier, ESLint
- **Encryption**: AES-256-GCM for session key storage

## Reference

### Important Code Files

- **app/page.tsx** — Main dashboard landing page
- **app/api/** — All API routes, including agent cron jobs
  - `app/api/agent/cron/route.ts` — Autonomous agent execution loop (runs every 5 minutes)
  - `app/api/agent/register/route.ts` — Session key registration
  - `app/api/agent/generate-session-key/route.ts` — Session key generation
  - `app/api/yield/` — Deposit/redeem vault operations
  - `app/api/auth/` — Privy authentication helpers
- **lib/agent/** — Core agent logic
  - `lib/agent/rebalance-executor.ts` — Evaluates and executes vault rebalancing
  - `lib/agent/vault-evaluator.ts` — APY/risk scoring logic
- **lib/zerodev/** — ZeroDev integration
  - `lib/zerodev/client-secure.ts` — Secure server-side client (private key never exposed)
  - `lib/zerodev/constants.ts` — Chain IDs, addresses, contract ABIs
  - `lib/zerodev/session-key.ts` — Session key lifecycle management
- **lib/morpho/** — Morpho vault interaction
  - `lib/morpho/api.ts` — Morpho API queries (APYs, vault states)
  - `lib/morpho/vault-evaluator.ts` — Risk scoring and vault analysis
- **lib/security/** — Security utilities
  - `lib/security/encryption.ts` — AES-256-GCM key encryption/decryption
- **lib/yield-optimizer/** — Legacy yield optimization (mostly deprecated in favor of agent)
- **db/schema.ts** — Drizzle schema (users, session keys, activity logs)
- **scripts/** — Utility scripts for migration, testing, deployment

### Directory Structure

```
├── app/                    # Next.js App Router
│   ├── api/               # API routes (auth, yield, agent, health)
│   └── [pages]            # Page routes
├── components/            # React components (forms, cards, modals)
├── db/                    # Drizzle ORM schema
├── drizzle/               # Drizzle migrations
├── hooks/                 # Custom React hooks
├── lib/
│   ├── agent/            # Agent rebalancing logic
│   ├── auth/             # Auth helpers
│   ├── morpho/           # Morpho vault integration
│   ├── redis/            # Redis client and caching
│   ├── security/         # Encryption, auth validation
│   ├── yield-optimizer/  # Legacy optimization (mostly unused)
│   └── zerodev/          # ZeroDev SDK integration
├── providers/             # React context providers
├── public/                # Static assets
├── scripts/               # One-off utilities
├── server-actions/        # Next.js server actions
├── tests/                 # Vitest test suites
│   ├── integration/      # Integration tests
│   ├── mocks/            # MSW mocks
│   └── helpers/          # Test utilities
└── utils/                 # General utilities

```

### Architecture Overview

**User Flow:**

1. User logs in via Privy (email/Google) → gets embedded wallet
2. User deposits USDC → calls `/api/yield/deposit` → transfers to vault
3. User enables auto-optimize → registers session key → grants agent permission
4. Agent cron job (`/api/agent/cron`) runs every 5 minutes via Vercel
5. Agent evaluates Morpho vaults → if APY improvement > 0.5%, executes rebalance
6. All transactions sponsored via ZeroDev paymaster (zero gas fees)

**Agent Security Model:**

- Session keys are **scoped** to specific Morpho vaults only
- Default **30-day expiry** (enforced at registration)
- Private keys **AES-256-GCM encrypted** in database
- Agent **simulates transactions before execution** (via Morpho SDK)
- **Rate limiting** and operation caps prevent excessive rebalancing

**Key Infrastructure:**

- Neon Postgres — stores users, session keys, activity logs
- Redis (via ioredis) — rate limiting, caching vault data
- ZeroDev Bundler — ERC-4337 operation bundling and sponsorship
- Morpho Blue API — real-time vault data (APYs, TVL, risk metrics)
- Vercel Cron — triggers agent every 5 minutes (no external scheduler)

## Essential Commands

### Development

```bash
# Install dependencies
pnpm install

# Start dev server (with Turbopack)
pnpm dev

# Open in browser
open http://localhost:3000
```

### Building & Testing

```bash
# Build for production
pnpm build

# Run all tests once
pnpm test:run

# Watch mode (re-run on file change)
pnpm test:watch

# Run only integration tests
pnpm test:integration

# Run with UI dashboard
pnpm test:ui

# Generate coverage report
pnpm test:coverage
```

### Code Quality

```bash
# Check formatting
pnpm format:check

# Auto-fix formatting
pnpm format

# Database operations
pnpm db:generate   # Generate migration files
pnpm db:push       # Push schema to database
pnpm db:migrate    # Run pending migrations
pnpm db:studio     # Open Drizzle Studio web UI
```

### Useful Scripts

```bash
# Check user session key status
node scripts/check-user-status.js <user-id>

# Test agent cron manually
npx ts-node scripts/test-agent-cron.ts

# Check database schema
node scripts/check-schema.js

# Test encryption/decryption
npx ts-node scripts/test-encryption.ts

# Migrate encrypted session keys (production)
npx ts-node scripts/migrate-encrypt-keys.ts
```

### Deployment

```bash
# Build and test locally
pnpm build && pnpm test:run

# Deploy to Vercel (requires Vercel CLI)
vercel deploy --prod

# Check agent health
curl https://your-domain.vercel.app/api/agent/health
```

## Patterns

### 1. Secure ZeroDev Client (Server-Only)

**Pattern**: Private keys **never** stored or transmitted to the browser.

```typescript
// lib/zerodev/client-secure.ts
import { createKernelAccountClient } from "@zerodev/sdk";

export async function getSecureZeroDevClient(privateKey: string, owner: `0x${string}`) {
  // 1. Decrypt private key from database
  // 2. Create smart account on server
  // 3. Return client WITHOUT exposing key
  // 4. Private key only exists in Node.js runtime
}
```

**When to use**: Any operation requiring private key access (rebalancing, signing transactions). Always decrypt on server, execute on server, never send key to client.

### 2. Session Key Registration & Lifecycle

**Pattern**: Multi-step registration with scoped permissions and expiry.

```typescript
// app/api/agent/register/route.ts
// 1. User grants permission in UI
// 2. Server generates session key
// 3. Server encrypts private key (AES-256-GCM)
// 4. Server stores encrypted key + metadata (30-day expiry)
// 5. Server configures Kernel V3 with scoped permissions
```

**Key points**:

- Scoped to **specific vault addresses only** (not all contracts)
- Hard 30-day expiry (enforced in schema, checked before use)
- User can **revoke anytime** via `/api/agent/revoke`
- Expiry checked on every agent execution

### 3. Autonomous Agent Rebalancing

**Pattern**: Periodic evaluation, lazy trigger, safety simulation.

```typescript
// lib/agent/rebalance-executor.ts
async function executeRebalance(userId: string) {
  // 1. Fetch active session key for user
  // 2. Evaluate all approved vaults (APY + risk)
  // 3. If improvement > threshold (default 0.5%), simulate txn
  // 4. If simulation succeeds, execute via ZeroDev bundler
  // 5. Log result (success/failure/skip)
}
```

**When to use**: Agent cron job (runs every 5 minutes). **Never** rebalance on demand without user permission.

### 4. Database Encryption for Sensitive Data

**Pattern**: Encrypt at-rest using AES-256-GCM with per-record nonce.

```typescript
// lib/security/encryption.ts
import * as crypto from "crypto";

function encrypt(
  plaintext: string,
  key: Buffer
): {
  ciphertext: string;
  nonce: string;
} {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
  const encrypted = cipher.update(plaintext, "utf-8", "hex");
  const tag = cipher.final("hex") + cipher.getAuthTag().toString("hex");
  return {
    ciphertext: encrypted + tag,
    nonce: nonce.toString("hex"),
  };
}
```

**When to use**: Session keys, API secrets, any PII. Always use `DATABASE_ENCRYPTION_KEY` from environment.

### 5. Rate Limiting & Operation Caps

**Pattern**: Redis-backed rate limiting to prevent abuse.

```typescript
// lib/rate-limiter.ts
export async function checkRateLimit(userId: string): Promise<boolean> {
  // Increment counter for user
  // Return false if limit exceeded
}
```

**Limits enforced**:

- Max 5 rebalances per hour per user
- Max 20 rebalances per day per user
- Global queue: 50 users per batch, 10 concurrent

### 6. Vault Evaluation & Risk Scoring

**Pattern**: Multi-factor APY and risk analysis.

```typescript
// lib/morpho/vault-evaluator.ts
export interface VaultScore {
  apyPercent: number;
  riskScore: number; // 0-100 (0=lowest risk, 100=highest)
  tvl: bigint;
  isRecommended: boolean;
}

function evaluateVault(vault: MorphoVault): VaultScore {
  // 1. APY (from Morpho API)
  // 2. Risk (collateral, LTV, liquidation risk)
  // 3. TVL (prefer diversification)
  // 4. Returns composite score
}
```

**Risk factors**:

- Collateral volatility (stable vs. volatile)
- LTV ratio (higher = riskier)
- Oracle dependency (single vs. multiple)
- Liquidation distance

### 7. Testing Patterns

**Unit tests**: Test logic functions (evaluators, encryption, rate limiting)

```typescript
// tests/unit/lib/morpho/vault-evaluator.test.ts
import { describe, it, expect } from "vitest";
import { evaluateVault } from "@/lib/morpho/vault-evaluator";

describe("evaluateVault", () => {
  it("should score stable collateral vaults higher", () => {
    const vault = {
      /* ... */
    };
    const score = evaluateVault(vault);
    expect(score.riskScore).toBeLessThan(50);
  });
});
```

**Integration tests**: Test API routes with mocked external dependencies

```typescript
// tests/integration/api/yield/deposit.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { rest } from "msw";
import { server } from "@/tests/mocks/server";

describe("POST /api/yield/deposit", () => {
  it("should deposit USDC to vault", async () => {
    // Mock Morpho API response
    server.use(
      rest.get("https://api.morpho.org/vaults", (req, res, ctx) => {
        return res(
          ctx.json([
            {
              /* vault data */
            },
          ])
        );
      })
    );

    const response = await fetch("/api/yield/deposit", {
      method: "POST",
      body: JSON.stringify({ vaultId: "0x...", amount: "1000000000" }),
    });

    expect(response.status).toBe(200);
  });
});
```

**Mocking external services**: Use MSW (Mock Service Worker)

```typescript
// tests/mocks/server.ts
import { setupServer } from "msw/node";
import { rest } from "msw";

export const server = setupServer(
  rest.get("https://api.morpho.org/vaults", (req, res, ctx) => {
    return res(
      ctx.json([
        {
          /* default vault */
        },
      ])
    );
  })
);
```

### 8. GraphQL Type Generation

**Pattern**: Auto-generate TypeScript types from GraphQL queries to ensure type safety.

```typescript
// codegen.ts
const config: CodegenConfig = {
  schema: "https://api.morpho.org/graphql",
  documents: "lib/morpho/queries.ts",
  generates: {
    "lib/morpho/graphql-types.ts": {
      plugins: ["typescript", "typescript-operations"],
    },
  },
};
```

**When to use**: Whenever you modify `lib/morpho/queries.ts`. Run `pnpm graphql-codegen` to update types.

## Anti-patterns

### ❌ Don't store private keys in localStorage or send to frontend

**Why**: XSS vulnerability exposes user funds.  
**Do instead**: Keep private keys on server only. Use session keys for agent operations.

### ❌ Don't execute agent operations without session key expiry check

**Why**: Expired session keys should not execute transactions.  
**Do instead**: Check `expiresAt < now()` before any agent operation. Fail gracefully if expired.

### ❌ Don't rebalance without simulation

**Why**: Simulated failures cause real fund loss (failed txn = wasted gas + wrong state).  
**Do instead**: Always call Morpho SDK `simulateTransaction()` before execution.

### ❌ Don't trust Morpho API data without validation

**Why**: Network errors or stale data cause incorrect scoring.  
**Do instead**: Cache API responses in Redis with TTL, validate field presence, use fallback values.

### ❌ Don't allow unlimited session key permissions

**Why**: Malicious agent code could drain all user funds.  
**Do instead**: Scope session keys to specific vault addresses only. Enforce 30-day max expiry.

### ❌ Don't perform DB operations on the client

**Why**: Exposes database structure, enables injection attacks.  
**Do instead**: Use server actions or API routes. Validate all inputs on server.

### ❌ Don't log sensitive data (private keys, encrypted keys)

**Why**: Logs may be exposed; sensitive data is at risk.  
**Do instead**: Log only non-sensitive identifiers (userId, vaultId, operation type). Mask amounts.

### ❌ Don't use `http()` without an explicit RPC URL

**Why**: `http()` without a URL defaults to a rate-limited public RPC endpoint, causing 429 errors and unreliable behavior. It also bypasses the project's Alchemy RPC.
**Do instead**: Always pass the configured RPC URL: `http(CHAIN_CONFIG.rpcUrl)`. Never use bare `http()` or interact with public RPCs when an Alchemy endpoint is available.

### ❌ Don't deploy without running tests

**Why**: Tests catch breaking changes and security issues.  
**Do instead**: Always run `pnpm test:run` before `vercel deploy`.

### ❌ Don't modify database schema via raw SQL

**Why**: Manual SQL changes bypass version control and migration tracking, leading to schema drift and deployment failures.
**Do instead**: Always use Drizzle ORM (`db/schema.ts`) and generate migrations via `pnpm db:generate`.

### ❌ Don't use raw ABIs for Morpho interaction

**Why**: Manually encoding function data is error-prone and brittle to contract upgrades.
**Do instead**: Use `@morpho-org/blue-sdk-viem` and `Market` entity methods (e.g., `market.supply(...)`).

## Code Style

**Style Guide**: [Prettier config](./.prettierrc)

**Key rules**:

- **Semicolons**: Required (`;`)
- **Quotes**: Double quotes (`"`) for strings
- **Trailing comma**: ES5 style (objects/arrays, not function params)
- **Line width**: 100 characters
- **Tab width**: 2 spaces
- **Tailwind class ordering**: Automatic (via prettier-plugin-tailwindcss)

**TypeScript**:

- **Strict mode**: Enabled (`strict: true`)
- **Path aliases**: `@/*` refers to project root
- **Target**: ES2020
- Module resolution: Bundler (for Next.js)

**React/JSX**:

- Prefer functional components
- Use React hooks (no class components)
- Avoid prop drilling — use context or server actions for shared state
- Label interactive elements for accessibility

**Naming conventions**:

- Components: PascalCase (`UserDashboard.tsx`)
- Utilities: camelCase (`encryptionUtils.ts`)
- Constants: UPPER_CASE (`MORPHO_BASE_URL`)
- Database tables: snake_case (`user_session_keys`)
- Environment variables: UPPER_SNAKE_CASE (mix of public/private prefixes)

## Commit and Pull Request Guidelines

### Pre-Commit Checklist

Before committing any changes, run:

```bash
# 1. Format code
pnpm format

# 2. Lint (type check)
pnpm build

# 3. Run tests
pnpm test:run

# 4. Run integration tests
pnpm test:integration

# 5. Check for console.log, debugger statements
git diff --staged | grep -E "console\.|debugger"  # Should return nothing
```

### Commit Message Convention

Use the **type: message** format:

```
type: Short imperative description (50 chars max)

Optional longer explanation (72 chars max per line).
- Bullet points okay
- Reference issues: fixes #123
```

**Types**:

- `feat:` — New feature
- `fix:` — Bug fix
- `refactor:` — Code reorganization (no behavior change)
- `docs:` — Documentation only
- `test:` — Test additions/changes
- `chore:` — Build, deps, config (no code logic change)
- `security:` — Security-related fix

**Examples**:

```
feat: Add vault risk scoring to Morpho evaluator

- Implement multi-factor risk scoring (LTV, collateral, oracle)
- Cache scores in Redis for 5-minute TTL
- Display risk badges in vault selection UI
fixes #45

---

fix: Prevent agent rebalance without session key expiry check

Expired keys should not execute transactions. Added validation
in executeRebalance() to fail gracefully if expiry < now().
```

### Pull Request Description

Use this template:

```markdown
## What

Brief description of changes.

## Why

Motivation / context / issue reference.

## How

- Key implementation detail 1
- Key implementation detail 2

## Testing

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed
- [ ] No breaking changes

## Security

- [ ] No new secrets/keys in code
- [ ] Encryption used for sensitive data
- [ ] Session keys still scoped/expiring correctly
- [ ] Rate limiting not bypassed
```

### Pre-Merge Verification

- All tests pass (`pnpm test:run`)
- TypeScript strict mode passes (`pnpm build`)
- Code is formatted (`pnpm format:check`)
- Commit messages follow convention
- Security checklist completed
- No TODO/FIXME left behind without issue reference
