# Tapioca Finance - Fintech Starter App - Production Deployment Guide

This guide covers the complete deployment procedure for the fintech-starter-app on Vercel with production configuration for Base mainnet.

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Deployment Steps](#deployment-steps)
3. [Production Configuration](#production-configuration)
4. [Monitoring & Observability](#monitoring--observability)
5. [Rollback Procedure](#rollback-procedure)
6. [Troubleshooting](#troubleshooting)
7. [Post-Launch Actions](#post-launch-actions)

---

## Pre-Deployment Checklist

### Environment Variables Verification

Before deployment, verify all required environment variables are set. Use `.env.template` as reference.

**Server-Only Variables** (never exposed to browser):
- `PRIVY_APP_SECRET` - From https://dashboard.privy.io (keep confidential)
- `DATABASE_URL` - Neon Postgres connection string with connection pooling
- `DATABASE_ENCRYPTION_KEY` - 32-byte hex string for session key encryption
- `CRON_SECRET` - 32-char hex string for cron job authentication
- `ZERODEV_PROJECT_ID` - From https://dashboard.zerodev.app

**Public Variables** (safe to expose):
- `NEXT_PUBLIC_PRIVY_APP_ID` - From Privy dashboard
- `NEXT_PUBLIC_CHAIN_ID` - Must be `base` for production
- `NEXT_PUBLIC_USDC_MINT` - `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (Base mainnet)

**Optional Variables**:
- `ZERODEV_BUNDLER_URL` - Defaults to ZeroDev's bundler, only set if using custom bundler
- `AGENT_SIMULATION_MODE` - Set to `false` for production (default is `false`)
- `AGENT_MIN_APY_THRESHOLD` - Default `0.005` (0.5% APY improvement minimum)
- `CRON_BATCH_SIZE` - Default `50` (process 50 users per batch)
- `CRON_CONCURRENCY` - Default `10` (10 concurrent users per batch)

**Verification Command**:
```bash
# Check all required variables are set
grep -E "NEXT_PUBLIC_|DATABASE_|CRON_|ZERODEV_|PRIVY_" .env.prod | wc -l
# Should output at least 8 variables
```

### Database Migration Steps

**1. Backup current database** (if upgrading existing deployment):
```bash
# Via Neon console
# 1. Go to https://console.neon.tech
# 2. Select project → Branches
# 3. Create backup branch named `prod-backup-YYYY-MM-DD`
# 4. Verify schema matches production
```

**2. Run migrations locally first**:
```bash
# In fintech-starter-app directory
export DATABASE_URL="postgresql://dev:password@localhost/dev"
pnpm db:generate  # Generate any new migrations
pnpm db:push      # Push to local database for testing
```

**3. Verify schema changes**:
```bash
# Check migration files
ls -la drizzle/
# Ensure all migrations are backward compatible
```

**4. Prepare production migration**:
```bash
# Create migration summary document
cat > deployment-migrations.md << EOF
# Migration Date: $(date -u +"%Y-%m-%d %T UTC")
## Changes:
- [List all schema changes]
- [Indexes added/modified]
- [New columns with defaults]

## Rollback Plan:
- [Specify which migrations to revert]
EOF
```

### Security Audit Checklist

- [ ] All API routes have authentication/authorization checks
- [ ] Session encryption keys are properly rotated (verify DATABASE_ENCRYPTION_KEY)
- [ ] CRON_SECRET is 32+ characters and cryptographically random
- [ ] No hardcoded secrets in code (check `.env.prod` is git-ignored)
- [ ] Private key handling: session keys are encrypted at rest, never logged
- [ ] Database connection uses connection pooling (Neon is auto-pooled)
- [ ] CORS is properly configured (should only accept app domain)
- [ ] Rate limiting configured on public endpoints
- [ ] Smart account permissions are scoped to approved vaults only
- [ ] Session key expiry is set to 30 days maximum
- [ ] All external API calls (Morpho, ZeroDev) use HTTPS

**Quick Security Check**:
```bash
# Check for secrets in codebase
grep -r "sk_prod\|sk_live\|secret\|private" --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=.next app/ lib/

# Should return only safe configuration code, not actual keys
```

### Testing Requirements

Run all tests before deployment:

```bash
# Unit tests
pnpm test:run

# Integration tests
pnpm test:integration

# Type checking
pnpm build

# Code formatting check
pnpm format:check
```

**Acceptance Criteria**:
- [ ] All tests pass (`test:run` exit code 0)
- [ ] No type errors in build
- [ ] No formatting errors
- [ ] No console errors in dev mode
- [ ] Manual smoke test: Login → Register Agent → Toggle Auto-Optimize

---

## Deployment Steps

### 1. Pre-Deployment Verification

```bash
cd fintech-starter-app

# Verify clean git state
git status
# Should show "working tree clean" or only .env changes

# Verify branch is up-to-date with main
git pull origin main

# Verify all tests pass
pnpm test:run
pnpm format:check

# Build for production
pnpm build
```

### 2. Environment Setup on Vercel

**Via Vercel Dashboard**:

1. Go to https://vercel.com/dashboard
2. Select the fintech-starter-app project
3. Settings → Environment Variables
4. Add/update all variables from `.env.prod`:
   ```
   NEXT_PUBLIC_PRIVY_APP_ID=<from-privy>
   PRIVY_APP_SECRET=<from-privy>
   DATABASE_URL=<neon-connection-string>
   DATABASE_ENCRYPTION_KEY=<32-byte-hex>
   CRON_SECRET=<32-char-random>
   NEXT_PUBLIC_CHAIN_ID=base
   NEXT_PUBLIC_USDC_MINT=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
   ZERODEV_PROJECT_ID=<from-zerodev>
   AGENT_SIMULATION_MODE=false
   AGENT_MIN_APY_THRESHOLD=0.005
   CRON_BATCH_SIZE=50
   CRON_CONCURRENCY=10
   ```

5. Ensure all variables are set to "Production" environment only

**Via CLI**:
```bash
# Using Vercel CLI (requires login)
vercel env add NEXT_PUBLIC_PRIVY_APP_ID
vercel env add PRIVY_APP_SECRET
vercel env add DATABASE_URL
vercel env add DATABASE_ENCRYPTION_KEY
# ... etc for all variables

# Verify
vercel env ls
```

### 3. Database Migration

**Option A: Via Vercel CLI + Neon Console** (Recommended):

```bash
# 1. Backup database via Neon console
#    https://console.neon.tech → Select project → Create backup branch

# 2. Run migrations against production database
DATABASE_URL="postgresql://..." pnpm db:push

# 3. Verify migration succeeded
DATABASE_URL="postgresql://..." pnpm db:studio
# Check schema matches expectations
```

**Option B: Via Neon Console + SQL Editor**:

1. Go to https://console.neon.tech
2. Select project → SQL Editor
3. Connect to production branch
4. Run migrations manually (check `/drizzle/` for SQL)
5. Verify with `SELECT * FROM information_schema.tables WHERE table_schema='public';`

### 4. Deploy to Vercel

**Automatic Deployment** (Recommended):
```bash
# Push to main branch (triggers automatic deployment)
git add .
git commit -m "chore: Production deployment"
git push origin main

# Monitor deployment at https://vercel.com/dashboard
```

**Manual Deployment** (if needed):
```bash
# Using Vercel CLI
vercel deploy --prod

# Or redeploy existing build
vercel redeploy --prod
```

**Deployment Checks**:
- Vercel build completes without errors
- All environment variables are available (check build logs)
- Database migrations completed
- Next.js build output includes `/public` and `.next`

### 5. Cron Job Setup

Vercel automatically runs crons based on `vercel.json` configuration.

**Current Configuration** (in `vercel.json`):
```json
{
  "crons": [
    {
      "path": "/api/agent/cron",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

This runs the autonomous rebalancing agent every 5 minutes.

**Verify Cron Setup**:
```bash
# Check Vercel cron logs
vercel env pull  # Get latest env
curl -H "authorization: Bearer $CRON_SECRET" \
  https://your-domain.vercel.app/api/agent/cron

# Should return JSON with success=true and summary
```

### 6. Post-Deployment Verification

```bash
# 1. Check site is live
curl https://your-domain.vercel.app/

# 2. Verify environment variables loaded
curl https://your-domain.vercel.app/api/agent/health

# 3. Test authentication flow manually
# Open https://your-domain.vercel.app in browser
# - Login with email/Google
# - Verify embedded wallet appears
# - Check wallet balance loads

# 4. Check database connection
curl -H "authorization: Bearer $CRON_SECRET" \
  https://your-domain.vercel.app/api/agent/health
# Response should have "status": "healthy"

# 5. Verify cron will run
# Check Vercel dashboard for next scheduled cron time
```

---

## Production Configuration

### Required Environment Variables Reference

| Variable | Type | Source | Notes |
|----------|------|--------|-------|
| `NEXT_PUBLIC_PRIVY_APP_ID` | String | Privy Dashboard | Public, safe to expose |
| `PRIVY_APP_SECRET` | String | Privy Dashboard | Secret, server-only |
| `DATABASE_URL` | URL | Neon Console | Use connection pooling endpoint |
| `DATABASE_ENCRYPTION_KEY` | Hex String | Generate via `openssl rand -hex 32` | 32-byte key for AES-256 encryption |
| `CRON_SECRET` | Hex String | Generate via `openssl rand -hex 16` | Used to authenticate cron requests |
| `NEXT_PUBLIC_CHAIN_ID` | String | Fixed | Must be `base` for mainnet |
| `NEXT_PUBLIC_USDC_MINT` | Address | Fixed | Base mainnet USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| `ZERODEV_PROJECT_ID` | String | ZeroDev Dashboard | For Kernel V3 smart accounts |
| `ZERODEV_BUNDLER_URL` | URL | Optional | Custom bundler endpoint (defaults to ZeroDev) |
| `AGENT_SIMULATION_MODE` | Boolean | Set to `false` | For production, rebalances execute real transactions |
| `AGENT_MIN_APY_THRESHOLD` | Decimal | Default: 0.005 | Minimum APY improvement (0.5%) to trigger rebalance |
| `CRON_BATCH_SIZE` | Number | Default: 50 | Users processed per batch (tune for memory) |
| `CRON_CONCURRENCY` | Number | Default: 10 | Concurrent user processing (tune for rate limits) |

### Database Connection Pooling

**Neon Configuration** (recommended):

Neon automatically provides connection pooling. Use the pooled connection string:

```
postgresql://username:password@project-id.us-east-1.neon.tech/dbname?sslmode=require
```

**Connection Pool Settings**:
- Max connections per Vercel serverless function: 10
- Idle connection timeout: 30 seconds
- Connection reuse: Enabled by default
- SSL mode: Required (`?sslmode=require`)

**For High Traffic** (if needed):
1. Upgrade Neon plan to Unlimited connections
2. Set `DATABASE_POOL_SIZE=50` if using PgBouncer
3. Monitor connection usage in Neon dashboard

### Redis Configuration (Optional)

Currently not required, but can be added for:
- Session caching (reduce database load)
- Rate limiting (prevent abuse)
- Real-time data cache (Morpho vault APYs)

**To Add Redis**:

```bash
# 1. Provision Redis (e.g., Upstash, Redis Cloud)
# 2. Add environment variable
export REDIS_URL="redis://username:password@host:port"

# 3. Update useWallet.ts to implement caching
```

### Autonomous Agent Configuration

**Cron Schedule** (from `vercel.json`):
- Every 5 minutes: `*/5 * * * *`
- Runs independently of user sessions
- Uses session keys stored in database (encrypted)

**Batch Processing**:
```
CRON_BATCH_SIZE=50    # 50 users per batch
CRON_CONCURRENCY=10   # 10 users processed in parallel
```

For 10,000 active users:
- Batches: 200 batches of 50 users each
- Processing time: ~8 minutes total (vs 83 minutes sequential)
- Executes 5 times per hour

**Tuning for Production**:

If cron runs over 5 minutes:
```bash
# Increase batch size
export CRON_BATCH_SIZE=100
export CRON_CONCURRENCY=20

# But monitor:
# - Database connection pool exhaustion
# - ZeroDev bundler rate limits
# - Morpho API rate limits
```

If getting rate limited:
```bash
# Decrease concurrency
export CRON_CONCURRENCY=5
export CRON_BATCH_SIZE=25
```

**Session Key Management**:
- Created with 30-day expiry in `/api/agent/register`
- Encrypted and stored in `users.authorization_7702` column
- Automatically invalidated if user disables auto-optimize
- Revoked during cron if expired (skipped from processing)

---

## Monitoring & Observability

### Health Check Endpoints

**Main Health Endpoint**:
```bash
curl https://your-domain.vercel.app/api/agent/health
```

Response:
```json
{
  "status": "healthy",
  "uptime": 3600,
  "lastCronRun": "2025-02-08T14:30:00Z",
  "metrics": {
    "activeUsers": 245,
    "rebalancesLast24h": 87,
    "successRate": 98.5,
    "averageLatency": 142,
    "errorRate": "1.50"
  },
  "services": {
    "database": "up",
    "zerodev": "up",
    "morphoApi": "up"
  },
  "timestamp": "2025-02-08T14:35:12.345Z"
}
```

**Status Values**:
- `healthy` - All services operational
- `degraded` - Some services down but core functionality works
- `down` - Critical services unavailable

**Individual Service Checks**:

```bash
# Database connectivity
curl -X POST https://your-domain.vercel.app/api/agent/health \
  -H "Content-Type: application/json"

# Check database response includes:
# "services": { "database": "up" }

# ZeroDev bundler
# Check services.zerodev: "up" or "down"

# Morpho API
# Check services.morphoApi: "up" or "down"
```

### Key Metrics to Monitor

**1. Autonomous Agent Performance**:
```sql
-- Query in Neon console
SELECT
  action_type,
  status,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE status = 'success') as successful,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'success') / COUNT(*), 2) as success_rate
FROM agent_actions
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY action_type, status;
```

**2. Active Users with Auto-Optimize**:
```sql
SELECT
  COUNT(*) as active_users,
  COUNT(*) FILTER (WHERE authorization_7702 IS NOT NULL) as with_session_keys,
  COUNT(*) FILTER (WHERE authorization_7702 IS NOT NULL AND agent_registered) as fully_registered
FROM users
WHERE auto_optimize_enabled = true;
```

**3. Cron Job Execution**:
```sql
-- Last 10 cron runs
SELECT
  created_at,
  COUNT(*) as total_actions,
  COUNT(*) FILTER (WHERE status = 'success') as successful,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) as duration_seconds
FROM agent_actions
WHERE action_type = 'rebalance'
  AND created_at >= NOW() - INTERVAL '50 minutes'
GROUP BY DATE_TRUNC('5 minutes', created_at)
ORDER BY created_at DESC;
```

**4. Error Tracking**:
```sql
-- Recent errors
SELECT
  created_at,
  action_type,
  error_message,
  COUNT(*) as count
FROM agent_actions
WHERE status = 'failed'
  AND created_at >= NOW() - INTERVAL '24 hours'
GROUP BY created_at, action_type, error_message
ORDER BY created_at DESC;
```

### Alert Thresholds

Set up alerts in your monitoring tool (Vercel Analytics, DataDog, etc.):

| Metric | Threshold | Action |
|--------|-----------|--------|
| Health Status = `down` | Immediate | Page on-call engineer |
| Success Rate < 95% | 1 hour | Review cron logs for patterns |
| Database Response > 1000ms | 5 min average | Check Neon connection pool |
| Cron Runtime > 4 min 30 sec | Each execution | Adjust batch/concurrency settings |
| Active Users = 0 | Immediate | Check Privy integration |
| ZeroDev Bundler = down | 5 min | Use fallback bundler or pause deployments |
| Morpho API = down | 5 min | Pause rebalancing (cron will skip) |
| Database Encryption Key Invalid | Immediate | Verify KEY_ROTATION procedure |

### Log Aggregation

**Vercel Logs**:
- Accessible via Vercel dashboard → Deployments → Logs
- Shows all `console.log()` statements from API routes
- 24-hour retention on free tier

**Check Cron Logs**:
```bash
# Via Vercel CLI
vercel logs --prod

# Filter for cron output
vercel logs --prod | grep "Cron"
```

**Key Log Patterns to Monitor**:

```
[Cron] Starting autonomous rebalancing cycle
[Cron] Found {N} active users to process
[Cron] Cycle complete in {ms}ms:
  - processed: {N}
  - rebalanced: {N}
  - skipped: {N}
  - errors: {N}

[Cron] Processing batch {N}/{total}
[Rebalance] Executing: {vault1} → {vault2}
[Rebalance] APY: {apy1}% → {apy2}%
```

**Error Log Patterns** (investigate these):
```
[Cron] Error processing user {address}: {error}
[Cron] Unauthorized attempt - invalid secret
[Health] Database check failed
[Health] ZeroDev check failed
[Health] Morpho API check failed
```

### Performance Monitoring

**Vercel Metrics**:
1. Go to Vercel Dashboard → your-project → Analytics
2. Monitor:
   - **TTFB** (Time to First Byte): Target < 500ms
   - **FCP** (First Contentful Paint): Target < 1s
   - **LCP** (Largest Contentful Paint): Target < 2.5s

**Database Query Performance**:
```bash
# Enable query logging in Neon
# Via Neon console → Project Settings → Query Logs

# Monitor slow queries
SELECT query, calls, mean_time, max_time
FROM pg_stat_statements
WHERE query NOT LIKE 'autovacuum%'
ORDER BY mean_time DESC
LIMIT 10;
```

**API Endpoint Response Times**:
- `/api/agent/health`: Target < 500ms
- `/api/optimize`: Target < 2s (calls Morpho API)
- `/api/agent/register`: Target < 5s (creates session key)
- `/api/agent/cron`: Monitor cron duration in response

---

## Rollback Procedure

### Immediate Rollback (within 24 hours)

If critical issues arise immediately after deployment:

**Step 1: Revert Deployment**:
```bash
# Option A: Via Vercel Dashboard
# 1. Go to Vercel → Deployments
# 2. Find previous stable deployment
# 3. Click "..." → Promote to Production

# Option B: Via Vercel CLI
vercel promote <previous-deployment-id>

# Option C: Revert git and redeploy
git revert HEAD
git push origin main
# Wait for Vercel to auto-deploy
```

**Step 2: Verify Rollback**:
```bash
curl https://your-domain.vercel.app/api/agent/health
# Should return health status

git log --oneline -5
# Verify HEAD points to previous commit
```

**Step 3: Cron Cleanup** (if needed):

If cron failed mid-execution:
```bash
# Via Neon console → SQL Editor
-- Mark failed actions as rolled back
UPDATE agent_actions
SET status = 'failed', error_message = 'Rolled back due to deployment revert'
WHERE status = 'pending'
  AND created_at >= NOW() - INTERVAL '10 minutes';

-- Verify no orphaned transactions
SELECT COUNT(*) as pending_actions
FROM agent_actions
WHERE status = 'pending';
```

### Database Rollback

If database migrations caused issues:

**Option 1: Revert to Backup Branch** (Recommended):
```bash
# Via Neon console
# 1. Go to Branches
# 2. Find backup created before deployment (e.g., prod-backup-2025-02-08)
# 3. Go to Connect → copy production branch connection string
# 4. Update DATABASE_URL in Vercel to point to backup
# 5. Deploy rollback commit

# Wait for data consistency (usually 1-2 minutes)
```

**Option 2: Manual Schema Rollback**:
```bash
# Via Neon SQL Editor
-- Identify failing migration
SELECT * FROM information_schema.tables WHERE table_schema = 'public' LIMIT 5;

-- Revert problematic migration
-- (Check /drizzle/ folder for reversible SQL)
-- Example: ALTER TABLE users DROP COLUMN new_column;

-- Verify schema
\dt  -- List tables
```

**Option 3: Using Drizzle Migration**:
```bash
# Locally determine safe revert point
pnpm db:push --dry-run

# Revert to previous migration
rm drizzle/{new-migration-file}.sql

# Redeploy
DATABASE_URL="production-url" pnpm db:push
```

### Session Key Invalidation

If session keys were compromised:

```bash
# Via Neon SQL Editor
-- Invalidate all active session keys
UPDATE users
SET authorization_7702 = NULL,
    auto_optimize_enabled = false
WHERE auto_optimize_enabled = true;

-- Notify users via email (implement in user notification system)
-- Users must re-register agents to resume auto-optimize
```

### Communication Checklist

After rollback, notify:
- [ ] Team in Slack/Discord
- [ ] Users via email (if major feature rolled back)
- [ ] Post-mortem in incident tracker

**Post-Mortem Template**:
```markdown
## Incident Report

**Time**: 2025-02-08 14:30 UTC
**Duration**: 45 minutes
**Severity**: P1 (Production down) / P2 (Degraded) / P3 (Minor)

### Root Cause
[Describe what went wrong]

### Detection
[How we noticed the issue]

### Impact
- [Users affected]
- [Data impacted]
- [Rebalances failed]

### Resolution
[Steps taken to fix]

### Follow-up Actions
- [ ] [Action 1]
- [ ] [Action 2]
```

---

## Troubleshooting

### Common Issues and Solutions

#### 1. Cron Job Not Running

**Symptoms**:
- No cron logs in Vercel
- `/api/agent/health` shows old `lastCronRun` timestamp

**Debugging**:
```bash
# 1. Verify cron is configured
cat vercel.json
# Should show: "crons": [{"path": "/api/agent/cron", "schedule": "*/5 * * * *"}]

# 2. Check CRON_SECRET is set
vercel env ls | grep CRON_SECRET

# 3. Manually trigger cron
CRON_SECRET="your-secret" \
curl -X POST https://your-domain.vercel.app/api/agent/cron \
  -H "x-cron-secret: $CRON_SECRET"

# Should return JSON with "success": true
```

**Solutions**:
1. Redeploy with `vercel deploy --prod`
2. Verify `vercel.json` syntax (JSON validator)
3. Check CRON_SECRET length (must be 32+ chars)
4. Check Vercel logs: `vercel logs --prod | grep -i cron`

#### 2. Database Connection Errors

**Symptoms**:
- `/api/agent/health` returns `"database": "down"`
- `connect ECONNREFUSED` errors in logs

**Debugging**:
```bash
# 1. Verify DATABASE_URL is set
vercel env ls | grep DATABASE_URL

# 2. Test connection locally
export DATABASE_URL="production-url"
node -e "const { neon } = require('@neondatabase/serverless'); const sql = neon(process.env.DATABASE_URL); sql\`SELECT 1\`.then(r => console.log('OK')).catch(e => console.log('ERROR:', e.message));"

# 3. Check Neon dashboard for connection issues
# https://console.neon.tech → Select project → Monitoring

# 4. Verify connection pooling is enabled
# URL should contain ?sslmode=require
```

**Solutions**:
1. Reset DATABASE_URL in Vercel env with pooled connection string:
   ```
   postgresql://user:pass@project.us-east-1.neon.tech/db?sslmode=require
   ```
2. Check Neon plan has available connections (upgrade if needed)
3. Reduce CRON_CONCURRENCY to lower connection pool pressure
4. Clear connection pool: restart Neon branch in console

#### 3. Session Key Expired

**Symptoms**:
- Cron logs show many "Session key expired" skipped actions
- Users complain rebalancing stopped

**Debugging**:
```bash
# Check session expiry in database
DATABASE_URL="prod-url" psql << EOF
SELECT
  wallet_address,
  (authorization_7702->>'expiry')::bigint * 1000 as expiry_ms,
  TO_TIMESTAMP((authorization_7702->>'expiry')::bigint) as expiry_datetime,
  NOW() > TO_TIMESTAMP((authorization_7702->>'expiry')::bigint) as is_expired
FROM users
WHERE auto_optimize_enabled = true
  AND authorization_7702 IS NOT NULL
LIMIT 10;
EOF
```

**Solutions**:
1. Users must manually re-register agents via UI
2. Implement automated renewal: extend expiry 7 days before actual expiry
3. Batch refresh: create endpoint `/api/agent/refresh-session` that users call

#### 4. Morpho API Unreachable

**Symptoms**:
- `/api/agent/health` returns `"morphoApi": "down"`
- Cron logs show Morpho API failures
- Decision engine returns empty vault lists

**Debugging**:
```bash
# 1. Check API availability
curl -X POST https://blue-api.morpho.org/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __typename }"}'

# 2. Check query logs
grep -i "morpho" vercel logs --prod

# 3. Verify API rate limit not exceeded
# Morpho API rate limit: 1000 requests/minute
```

**Solutions**:
1. Increase CRON_BATCH_SIZE to reduce API calls
2. Implement caching: store vault data in Redis with 5-minute TTL
3. Add retry logic with exponential backoff
4. Fallback to cached data if API unreachable

#### 5. ZeroDev Bundler Failures

**Symptoms**:
- Transaction failures: `ZeroDev bundler rejected transaction`
- `/api/agent/health` returns `"zerodev": "down"`
- Rebalance attempts fail with no on-chain transaction

**Debugging**:
```bash
# 1. Check bundler status
ZERODEV_PROJECT_ID="your-id" \
curl -X POST https://rpc.zerodev.app/api/v2/bundler/$ZERODEV_PROJECT_ID \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "eth_chainId", "params": []}'

# 2. Check ZeroDev dashboard for rate limits
# https://dashboard.zerodev.app → Project settings → Metrics

# 3. Review transaction rejection reasons in logs
vercel logs --prod | grep -i "bundler\|zerodev"
```

**Solutions**:
1. Set `ZERODEV_BUNDLER_URL` to fallback bundler if available
2. Reduce CRON_CONCURRENCY to lower bundler load
3. Implement transaction retry with exponential backoff
4. Increase session key sudo scope if permissions too restrictive

#### 6. High Database Load / Slow Queries

**Symptoms**:
- Cron takes > 5 minutes (hits next cron start)
- Database response > 1s
- Vercel timeout errors

**Debugging**:
```bash
# 1. Check slow queries in Neon
# Via Neon console → Monitoring → Slow Queries
SELECT query, calls, mean_time FROM pg_stat_statements
ORDER BY mean_time DESC LIMIT 10;

# 2. Analyze cron batch timing
vercel logs --prod | grep "Processing batch"
# Look for increasing duration per batch

# 3. Check active connections
SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;
```

**Solutions**:
1. Add database index (if not exists):
   ```sql
   CREATE INDEX IF NOT EXISTS idx_users_cron_query
   ON users(auto_optimize_enabled, agent_registered, created_at);
   ```
2. Reduce CRON_BATCH_SIZE (e.g., from 50 to 25)
3. Reduce CRON_CONCURRENCY (e.g., from 10 to 5)
4. Partition users table if > 100k users
5. Archive old `agent_actions` records (> 90 days) to cold storage

#### 7. Privy Authentication Issues

**Symptoms**:
- Login modal not appearing
- "NEXT_PUBLIC_PRIVY_APP_ID is not set" error
- Embedded wallet not created after login

**Debugging**:
```bash
# 1. Check Privy app ID is set
vercel env ls | grep NEXT_PUBLIC_PRIVY_APP_ID

# 2. Verify Privy app is active
# https://dashboard.privy.io → Apps → verify status

# 3. Check browser console for errors
# Open DevTools → Console tab → reload page

# 4. Check Privy dashboard for API errors
# https://dashboard.privy.io → Logs tab
```

**Solutions**:
1. Verify `NEXT_PUBLIC_PRIVY_APP_ID` in Vercel env
2. Redeploy to invalidate old app ID: `vercel deploy --prod`
3. Clear browser cache: Cmd+Shift+Delete (Chrome)
4. Check Privy app isn't rate-limited (upgrade plan if needed)

### Debug Endpoints

**Health Check with Detailed Output**:
```bash
curl https://your-domain.vercel.app/api/agent/health?verbose=1 -s | jq .
```

**Cron Manual Trigger** (for testing):
```bash
curl -X POST https://your-domain.vercel.app/api/agent/cron \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "Content-Type: application/json" | jq .
```

**Database Query Test**:
```bash
# In /app/api/debug/route.ts
export async function GET() {
  try {
    const result = await sql`SELECT NOW() as timestamp`;
    return Response.json({ database: 'up', timestamp: result[0].timestamp });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
```

**Log Inspection Procedures**:

```bash
# 1. Real-time logs
vercel logs --follow --prod

# 2. Specific service logs
vercel logs --prod | grep "Agent\|Cron\|Database" | tail -50

# 3. Error logs
vercel logs --prod | grep -i "error\|fail" | tail -30

# 4. Export logs for analysis
vercel logs --prod > deployment-logs.txt
# Analyze in external tools (DataDog, Splunk, etc.)
```

---

## Post-Launch Actions

### First 24-Hour Monitoring Checklist

**Every 15 minutes (first 2 hours)**:
- [ ] Check `/api/agent/health` status (should be `healthy`)
- [ ] Verify no new error patterns in logs
- [ ] Monitor Vercel real-time metrics

**Every hour (first 24 hours)**:
- [ ] Check active user count (should grow)
- [ ] Verify cron runs every 5 minutes
- [ ] Monitor database connection pool (should be < 50%)
- [ ] Verify no session key expiry issues

**After 24 hours**:
- [ ] Review first 24-hour metrics
- [ ] Analyze rebalance success rate (target > 95%)
- [ ] Check for any errors that need addressing
- [ ] Calculate actual vs estimated gas costs

**Metrics to Track**:
```sql
-- Successful rebalances in first 24h
SELECT
  COUNT(*) as total_rebalances,
  COUNT(*) FILTER (WHERE status = 'success') as successful,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'success') / COUNT(*), 2) as success_rate,
  COUNT(DISTINCT user_id) as unique_users
FROM agent_actions
WHERE action_type = 'rebalance'
  AND created_at >= NOW() - INTERVAL '24 hours';

-- Average APY improvement
SELECT
  AVG(CAST(metadata->>'apyImprovement' as DECIMAL)) as avg_apy_improvement,
  AVG(CAST(metadata->>'estimatedAnnualGain' as DECIMAL)) as avg_annual_gain,
  COUNT(*) as rebalances
FROM agent_actions
WHERE action_type = 'rebalance'
  AND status = 'success'
  AND created_at >= NOW() - INTERVAL '24 hours';
```

### Weekly Health Checks

**Every Monday (or chosen day)**:

```bash
# 1. Review metrics
curl https://your-domain.vercel.app/api/agent/health | jq .metrics

# 2. Database health
DATABASE_URL="prod-url" psql << EOF
-- Check for long-running queries
SELECT
  pid, usename, state, query, state_change
FROM pg_stat_activity
WHERE state != 'idle'
  AND query NOT LIKE '%pg_stat_activity%'
ORDER BY state_change DESC;

-- Check table bloat
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
EOF

# 3. Review error logs
vercel logs --prod | grep -i error | tail -50

# 4. Check recent deployments
vercel deployments list --prod | head -10

# 5. Run security audit
npm audit  # Check for new vulnerabilities
```

**Weekly Actions**:
- [ ] Run `pnpm format:check` and `pnpm test:run` on main
- [ ] Review Vercel analytics for performance regressions
- [ ] Check Neon backup status
- [ ] Verify no security alerts in GitHub/npm
- [ ] Review Morpho vault changes (new high-APY vaults?)

### Monthly Review Items

**First of month** (or chosen date):

1. **Operational Review**:
   - Total active users with auto-optimize
   - Total rebalances executed
   - Total gas costs vs savings
   - User growth rate

2. **Financial Analysis**:
   ```sql
   SELECT
     COUNT(DISTINCT user_id) as active_users,
     COUNT(*) as total_rebalances,
     SUM(CAST(metadata->>'estimatedAnnualGain' as DECIMAL)) as total_annual_savings,
     AVG(CAST(metadata->>'estimatedAnnualGain' as DECIMAL)) as avg_gain_per_rebalance
   FROM agent_actions
   WHERE action_type = 'rebalance'
     AND status = 'success'
     AND created_at >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
     AND created_at < DATE_TRUNC('month', NOW());
   ```

3. **Performance Review**:
   - Cron average execution time
   - Cron success rate
   - Database query performance
   - API endpoint response times

4. **Security Review**:
   - Session key rotation (verify expiry < 30 days)
   - No unauthorized access attempts
   - Database encryption key rotation schedule
   - Environment variable audit

5. **Cost Optimization**:
   - Vercel compute costs (check for runaway crons)
   - Neon database costs (connection pool sizing)
   - ZeroDev bundler costs (transaction volume)
   - Potential savings for users

6. **Feature Planning**:
   - User feedback from support
   - Morpho protocol updates
   - New vault opportunities
   - Performance improvements needed

**Monthly Checklist**:
- [ ] Database backups successful (check Neon)
- [ ] No deprecated dependencies
- [ ] All alerts configured properly
- [ ] Team trained on runbook
- [ ] Disaster recovery tested (if applicable)

### Escalation Procedures

**For Critical Incidents** (production down):

1. **Immediate** (0-5 min):
   - Alert on-call engineer
   - Check `/api/agent/health` to determine scope
   - Check Vercel status page for platform issues

2. **Triage** (5-15 min):
   - Review recent deployments/changes
   - Check external service status (Neon, ZeroDev, Morpho)
   - Review error logs

3. **Resolution** (15+ min):
   - Follow troubleshooting guide above
   - Execute rollback if needed
   - Notify affected users

**For Degraded Performance**:

1. Review metrics and logs
2. Check if rate-limited (Morpho API, ZeroDev bundler)
3. Check database performance
4. Adjust CRON settings if needed
5. Monitor for improvement

**For Data Integrity Issues**:

1. Stop cron (disable in vercel.json temporarily)
2. Investigate root cause
3. Determine scope of affected data
4. Implement fix
5. Test thoroughly before resuming

---

## Additional Resources

- **Vercel Docs**: https://vercel.com/docs
- **Neon Database**: https://neon.tech/docs
- **Privy Documentation**: https://docs.privy.io
- **ZeroDev Documentation**: https://docs.zerodev.app
- **Morpho Blue API**: https://blue-api.morpho.org/graphql
- **Next.js Deployment**: https://nextjs.org/docs/app/building-your-application/deploying

## Support

For deployment issues, contact:
- **Infrastructure**: [DevOps team email]
- **Smart Contracts**: [Contracts team email]
- **Frontend**: [Frontend team email]

Last Updated: 2025-02-08
