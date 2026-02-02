# LiqX Agent Operations Guide

## Overview

The LiqX Autonomous Yield Agent is a fully automated system that monitors user positions and rebalances funds across DeFi protocols to maximize yield. Built using EIP-7702 delegation, the agent can execute gasless transactions on behalf of users while maintaining full user control.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Vercel Cron (Every 5 min)               │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              /api/agent/cron (Cron Endpoint)                │
│  • Verifies CRON_SECRET                                     │
│  • Queries active users from database                       │
│  • Processes each user sequentially                         │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│           For Each User: processUserRebalance()             │
│  1. Call optimize() to evaluate opportunities               │
│  2. Check if netGain >= user's threshold                    │
│  3. If yes → executeRebalance()                             │
│  4. If no → skip and log reason                             │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              executeRebalance() Flow                        │
│  1. Build rebalance transactions (withdraw + deposit)       │
│  2. Estimate gas costs                                      │
│  3. Simulate first transaction                              │
│  4. Execute via EIP-7702 with retry logic                   │
│  5. Log result to agent_actions table                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│          External Services Integration                      │
│  • Crossmint/Gelato: EIP-7702 execution + task tracking    │
│  • Morpho API: Yield opportunities                          │
│  • Aave/Moonwell: Alternative protocols                     │
│  • Postgres (Neon): State persistence                       │
└─────────────────────────────────────────────────────────────┘
```

## Deployment Checklist

### 1. Environment Variables

Add to Vercel environment variables (or `.env.local` for local dev):

```bash
# Required
DATABASE_URL=postgresql://...                    # Neon Postgres connection
CRON_SECRET=<generate-32-char-random-string>     # Cron authentication
LIQX_AGENT_PRIVATE_KEY=0x...                     # Agent's private key
CROSSMINT_SERVER_SIDE_API_KEY=...                # Crossmint API key

# Optional
AGENT_SIMULATION_MODE=false                      # Set to 'true' for testing
AGENT_MIN_APY_THRESHOLD=0.005                    # Global minimum (0.5%)
AGENT_GAS_PRICE_LIMIT_GWEI=50                    # Max gas price
```

**Generating CRON_SECRET:**
```bash
openssl rand -hex 32
```

### 2. Database Migrations

Ensure all tables exist:

```sql
-- Users table (should already exist)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE NOT NULL,
  auto_optimize_enabled BOOLEAN DEFAULT false,
  agent_registered BOOLEAN DEFAULT false,
  authorization_7702 JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User strategies (should already exist)
CREATE TABLE user_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  min_apy_gain_threshold DECIMAL DEFAULT 0.005,
  max_slippage_tolerance DECIMAL DEFAULT 0.005,
  risk_level TEXT DEFAULT 'medium',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agent actions (should already exist)
CREATE TABLE agent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL,
  from_protocol TEXT,
  to_protocol TEXT,
  amount_usdc DECIMAL,
  tx_hash TEXT,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_users_auto_optimize ON users(auto_optimize_enabled);
CREATE INDEX idx_agent_actions_user_id ON agent_actions(user_id);
CREATE INDEX idx_agent_actions_created_at ON agent_actions(created_at);
```

### 3. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd fintech-starter-app
vercel --prod

# Verify cron job appears in Vercel dashboard
# Navigate to: Project Settings → Cron Jobs
```

### 4. Verify Deployment

**Check Health Endpoint:**
```bash
curl https://your-domain.vercel.app/api/agent/health
```

Expected response:
```json
{
  "status": "healthy",
  "services": {
    "database": "up",
    "gelato": "up",
    "morphoApi": "up"
  },
  "metrics": {
    "activeUsers": 5,
    "rebalancesLast24h": 12,
    "successRate": 100
  }
}
```

**Trigger Manual Cron Run:**
```bash
curl -X POST https://your-domain.vercel.app/api/agent/cron \
  -H "x-cron-secret: YOUR_CRON_SECRET"
```

## Operational Procedures

### Enable/Disable Agent Globally

**Disable (Emergency Stop):**
```bash
# Set AGENT_SIMULATION_MODE=true in Vercel env vars
# This will stop real transactions but continue logging
```

**Re-enable:**
```bash
# Set AGENT_SIMULATION_MODE=false
```

### Adjust Cron Frequency

Edit `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/agent/cron",
    "schedule": "*/10 * * * *"  // Every 10 minutes instead of 5
  }]
}
```

Then redeploy:
```bash
vercel --prod
```

### Monitor Agent Activity

**View Recent Logs:**
```bash
vercel logs --follow
```

**Query Database:**
```sql
-- Recent rebalances
SELECT
  u.wallet_address,
  a.status,
  a.from_protocol,
  a.to_protocol,
  a.amount_usdc,
  a.metadata->>'apyImprovement' as apy_gain,
  a.created_at
FROM agent_actions a
JOIN users u ON a.user_id = u.id
WHERE a.action_type = 'rebalance'
ORDER BY a.created_at DESC
LIMIT 20;

-- Success rate per user
SELECT
  u.wallet_address,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE a.status = 'success') as successful,
  ROUND(100.0 * COUNT(*) FILTER (WHERE a.status = 'success') / COUNT(*), 2) as success_rate
FROM agent_actions a
JOIN users u ON a.user_id = u.id
WHERE a.action_type = 'rebalance'
GROUP BY u.wallet_address;
```

### User Management

**Disable Agent for Specific User:**
```sql
UPDATE users
SET auto_optimize_enabled = false
WHERE wallet_address = '0x...';
```

**Check User Status:**
```bash
curl "https://your-domain.vercel.app/api/agent/register?address=0x..."
```

## Troubleshooting

### Issue: Cron Not Executing

**Symptoms:**
- No entries in `agent_actions` table
- Vercel logs show no cron invocations

**Solutions:**
1. Check Vercel dashboard → Cron Jobs tab
2. Verify `vercel.json` is in project root
3. Ensure cron endpoint returns 200 status
4. Check CRON_SECRET is set correctly

### Issue: All Rebalances Failing

**Symptoms:**
- All actions have status='failed'
- Error: "Missing Crossmint API Key or Agent Private Key"

**Solutions:**
1. Verify env vars in Vercel:
   ```bash
   vercel env ls
   ```
2. Check agent private key format (must start with 0x)
3. Validate Crossmint API key is active

### Issue: Gas Cost Exceeds Gain

**Symptoms:**
- Logs show: "Gas cost exceeds 10% of yearly gain"
- Many skipped rebalances

**Solutions:**
1. Check current Base network gas prices
2. Increase `AGENT_GAS_PRICE_LIMIT_GWEI`
3. Raise user's `min_apy_gain_threshold`

### Issue: Authorization Expired

**Symptoms:**
- Error: "authorization expired"
- Rebalances fail after working previously

**Solutions:**
1. Users need to re-authorize in the UI
2. Check authorization expiry in database:
   ```sql
   SELECT wallet_address, authorization_7702
   FROM users
   WHERE auto_optimize_enabled = true;
   ```
3. Prompt users to re-register agent

### Issue: Simulation Failures

**Symptoms:**
- Error: "Simulation failed"
- Status remains 'pending'

**Solutions:**
1. Check user has sufficient balance
2. Verify protocol contracts are operational
3. Review Morpho/Aave API status
4. Check for protocol upgrades or deprecations

## Monitoring & Alerts

### Key Metrics to Track

1. **Success Rate**: Should be > 95%
   ```sql
   SELECT
     ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'success') / COUNT(*), 2) as success_rate
   FROM agent_actions
   WHERE action_type = 'rebalance'
     AND created_at >= NOW() - INTERVAL '24 hours';
   ```

2. **Average Execution Time**: Should be < 30s
   ```sql
   SELECT AVG(EXTRACT(EPOCH FROM (created_at - created_at))) as avg_seconds
   FROM agent_actions
   WHERE action_type = 'rebalance'
     AND created_at >= NOW() - INTERVAL '24 hours';
   ```

3. **Error Rate**: Should be < 1%
   ```sql
   SELECT
     COUNT(*) FILTER (WHERE status = 'failed') as errors,
     COUNT(*) as total,
     ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'failed') / COUNT(*), 2) as error_rate
   FROM agent_actions
   WHERE created_at >= NOW() - INTERVAL '24 hours';
   ```

### Setting Up Alerts

**Vercel Integration (Recommended):**
- Navigate to Vercel Dashboard → Integrations
- Add monitoring service (Datadog, Sentry, etc.)

**Custom Alerts:**
Create a new endpoint `/api/agent/alerts` that:
1. Queries metrics from database
2. Compares against thresholds
3. Sends notifications (email, Slack, etc.) if thresholds exceeded

**Example Alert Conditions:**
- Success rate drops below 90%
- No cron runs in last 10 minutes
- Error rate exceeds 5%
- Database connection failures

## Security Considerations

1. **CRON_SECRET**: Rotate monthly
   ```bash
   # Generate new secret
   openssl rand -hex 32

   # Update in Vercel
   vercel env add CRON_SECRET production
   ```

2. **Agent Private Key**: Store in secure vault
   - Never commit to git
   - Rotate if compromised
   - Monitor for unauthorized transactions

3. **User Authorization**: Validate expiry
   - EIP-7702 authorizations can expire
   - Prompt users to re-authorize
   - Log all authorization changes

4. **Rate Limiting**: Implement per-user limits
   - Max 1 rebalance per user per hour
   - Prevent excessive gas usage

## Performance Optimization

### Database Indexes

Ensure these indexes exist:
```sql
CREATE INDEX IF NOT EXISTS idx_users_auto_optimize ON users(auto_optimize_enabled);
CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_agent_actions_user ON agent_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_actions_status ON agent_actions(status);
CREATE INDEX IF NOT EXISTS idx_agent_actions_created ON agent_actions(created_at DESC);
```

### Caching Strategy

- Cache Morpho vault data for 5 minutes
- Cache protocol APYs for 1 minute
- Use React Query for frontend caching

### Parallel Processing

Currently, users are processed sequentially. For scale, consider:
```typescript
// Process users in batches
const batchSize = 10;
for (let i = 0; i < activeUsers.length; i += batchSize) {
  const batch = activeUsers.slice(i, i + batchSize);
  await Promise.all(batch.map(user => processUserRebalance(user, summary)));
}
```

## Disaster Recovery

### Rollback Procedure

If critical bug detected:

1. **Immediate**: Set `AGENT_SIMULATION_MODE=true`
2. **Identify**: Query failed transactions
3. **Notify**: Alert affected users
4. **Fix**: Deploy hotfix
5. **Test**: Run in simulation mode for 1 hour
6. **Resume**: Set `AGENT_SIMULATION_MODE=false`

### Backup Strategy

1. **Database**: Neon has automatic backups
2. **Code**: Git repository with tags
3. **Env Vars**: Document in 1Password/Vault

## Support & Escalation

**Tier 1 Issues** (User-level):
- Authorization expired → User re-authorizes
- Low APY gain → Expected behavior
- Single failed transaction → Retry automatically

**Tier 2 Issues** (System-level):
- Multiple users failing → Check health endpoint
- Cron not running → Restart Vercel deployment
- API rate limits → Implement backoff

**Tier 3 Issues** (Critical):
- Database down → Contact Neon support
- Crossmint API down → Switch to fallback
- Smart contract bug → Emergency shutdown

## Appendix: Common SQL Queries

```sql
-- Active users count
SELECT COUNT(*) FROM users
WHERE auto_optimize_enabled = true
  AND authorization_7702 IS NOT NULL;

-- Total value managed by agent
SELECT SUM(CAST(amount_usdc AS DECIMAL)) as total_usdc
FROM agent_actions
WHERE action_type = 'rebalance'
  AND status = 'success'
  AND created_at >= NOW() - INTERVAL '30 days';

-- Protocol distribution
SELECT
  to_protocol,
  COUNT(*) as rebalances,
  SUM(CAST(amount_usdc AS DECIMAL)) as total_volume
FROM agent_actions
WHERE action_type = 'rebalance'
  AND status = 'success'
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY to_protocol
ORDER BY total_volume DESC;

-- Error breakdown
SELECT
  error_message,
  COUNT(*) as occurrences
FROM agent_actions
WHERE status = 'failed'
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY error_message
ORDER BY occurrences DESC;
```
