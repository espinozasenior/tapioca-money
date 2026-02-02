# Agent Testing Guide

## Overview

This guide covers testing strategies for the LiqX Autonomous Yield Agent. Since the project doesn't currently have a test framework configured, this document provides manual testing procedures and guidance for future test implementation.

## Quick Start: Manual Testing

### 1. Setup Test Environment

```bash
# Copy environment file
cp .env .env.test

# Set simulation mode
echo "AGENT_SIMULATION_MODE=true" >> .env.test

# Set test cron secret
echo "CRON_SECRET=$(openssl rand -hex 32)" >> .env.test
```

### 2. Run Development Server

```bash
pnpm dev
```

### 3. Create Test User

Use the UI to:
1. Login with test wallet (e.g., MetaMask with Base Sepolia)
2. Navigate to "Earn Yield" section
3. Click "Enable Auto-Optimize"
4. Authorize EIP-7702 delegation

### 4. Trigger Cron Manually

```bash
# Test with simulation mode
AGENT_SIMULATION_MODE=true node scripts/test-agent-cron.ts --simulation

# Test with real execution (careful!)
node scripts/test-agent-cron.ts
```

### 5. Verify Results

Check the agent dashboard in the UI for:
- Agent activity log entries
- Stats showing rebalances
- APY improvements

Or query database:
```sql
SELECT * FROM agent_actions
ORDER BY created_at DESC
LIMIT 10;
```

## Manual Test Cases

### Test Case 1: Full Rebalance Flow

**Objective**: Verify end-to-end rebalancing works correctly

**Prerequisites**:
- Test user with authorization
- User has USDC in a lower-yield protocol (e.g., Aave at 4% APY)
- Higher-yield opportunity available (e.g., Morpho at 8% APY)

**Steps**:
1. Set user's `min_apy_gain_threshold` to `0.01` (1%)
2. Trigger cron: `POST /api/agent/cron`
3. Wait 30 seconds for execution

**Expected Results**:
- ✅ Agent action logged with `status: 'success'`
- ✅ Metadata shows APY improvement >= 1%
- ✅ Transaction hash present
- ✅ User funds moved to higher-yield protocol
- ✅ Dashboard shows successful rebalance

### Test Case 2: Threshold Filtering

**Objective**: Verify rebalances are skipped when below threshold

**Prerequisites**:
- Test user with authorization
- Current APY: 6%
- Best opportunity: 7% (only 1% improvement)
- User threshold: 2%

**Steps**:
1. Set threshold: `UPDATE user_strategies SET min_apy_gain_threshold = 0.02`
2. Trigger cron

**Expected Results**:
- ✅ Agent action logged with `status: 'success'` or skipped
- ✅ No transaction executed
- ✅ Reason: "Net gain 1.00% below user threshold 2.00%"
- ✅ Cron summary shows 1 skipped

### Test Case 3: Error Handling

**Objective**: Verify errors are caught and logged correctly

**Prerequisites**:
- Test user with insufficient balance
- Or invalid authorization

**Steps**:
1. Manually set user balance to 0 in protocol
2. Trigger cron

**Expected Results**:
- ✅ Agent action logged with `status: 'failed'`
- ✅ Error message captured in `error_message` field
- ✅ Other users still processed (error doesn't cascade)
- ✅ Cron summary shows 1 error

### Test Case 4: Authorization Validation

**Objective**: Verify expired authorizations are handled

**Prerequisites**:
- Test user with expired authorization (past expiry timestamp)

**Steps**:
1. Use `seedTestUserWithExpiredAuth()` helper
2. Trigger cron

**Expected Results**:
- ✅ Rebalance skipped or fails gracefully
- ✅ Error logged: "authorization expired"
- ✅ User not charged gas

### Test Case 5: Gas Estimation

**Objective**: Verify gas cost checks prevent unprofitable rebalances

**Prerequisites**:
- Very small position (e.g., $10 USDC)
- High gas prices

**Steps**:
1. Set high gas limit: `AGENT_GAS_PRICE_LIMIT_GWEI=200`
2. Trigger cron with small position

**Expected Results**:
- ✅ Rebalance skipped
- ✅ Reason: "Gas cost ($X) exceeds 10% of yearly gain ($Y)"

## API Testing

### Health Check Endpoint

```bash
curl http://localhost:3000/api/agent/health
```

Expected response:
```json
{
  "status": "healthy",
  "uptime": 123456,
  "lastCronRun": "2026-01-31T12:00:00Z",
  "metrics": {
    "activeUsers": 5,
    "rebalancesLast24h": 12,
    "successRate": 100,
    "errorRate": "0.00"
  },
  "services": {
    "database": "up",
    "gelato": "up",
    "morphoApi": "up"
  }
}
```

### Activity Endpoint

```bash
curl "http://localhost:3000/api/agent/activity?address=0x...&limit=10"
```

### Gains Endpoint

```bash
curl "http://localhost:3000/api/agent/gains?address=0x...&period=week"
```

## Database Testing

### Setup Test Data

```sql
-- Create test user
INSERT INTO users (wallet_address, auto_optimize_enabled, agent_registered, authorization_7702)
VALUES (
  '0xTEST1234567890',
  true,
  true,
  '{"chainId": 8453, "signature": "0xtest"}'::jsonb
);

-- Create strategy
INSERT INTO user_strategies (user_id, min_apy_gain_threshold)
SELECT id, 0.01 FROM users WHERE wallet_address = '0xTEST1234567890';
```

### Verify Agent Actions

```sql
-- Check recent actions
SELECT
  u.wallet_address,
  a.action_type,
  a.status,
  a.from_protocol,
  a.to_protocol,
  a.metadata->>'apyImprovement' as apy_gain
FROM agent_actions a
JOIN users u ON a.user_id = u.id
ORDER BY a.created_at DESC
LIMIT 5;
```

### Clean Up Test Data

```sql
DELETE FROM users WHERE wallet_address LIKE '0xTEST%';
```

## Integration Testing (Future Implementation)

### Install Test Framework

```bash
pnpm add -D vitest @vitest/ui
```

### Add Test Scripts to package.json

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

### Example Test Structure

```typescript
// tests/agent-integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seedTestUser, cleanupTestData } from './helpers/test-setup';

describe('Agent Cron Integration', () => {
  let testUsers: string[] = [];

  afterEach(async () => {
    await cleanupTestData(testUsers);
    testUsers = [];
  });

  it('should execute rebalance when threshold is met', async () => {
    const user = await seedTestUser('0xTEST_REBALANCE');
    testUsers.push(user.walletAddress);

    // TODO: Trigger cron and verify results
  });

  it('should skip when below threshold', async () => {
    const user = await seedTestUser('0xTEST_SKIP', true, '0.05');
    testUsers.push(user.walletAddress);

    // TODO: Trigger cron and verify skipped
  });
});
```

## Performance Testing

### Load Testing

Simulate multiple users:

```bash
# Create 100 test users
for i in {1..100}; do
  curl -X POST http://localhost:3000/api/agent/register \
    -H "Content-Type: application/json" \
    -d "{\"address\": \"0xTEST_USER_$i\", \"authorization\": {}}"
done

# Trigger cron and measure duration
time curl -X POST http://localhost:3000/api/agent/cron \
  -H "x-cron-secret: $CRON_SECRET"
```

**Expected Performance**:
- < 5 seconds for 10 users
- < 30 seconds for 100 users
- Linear scaling (O(n))

### Stress Testing

1. Create 1000 users in database
2. Trigger cron with Vercel production
3. Monitor:
   - Memory usage
   - Database connections
   - API rate limits
   - Error rates

## Security Testing

### Authorization Tests

1. **Invalid CRON_SECRET**: Should return 401
   ```bash
   curl -X POST http://localhost:3000/api/agent/cron \
     -H "x-cron-secret: WRONG_SECRET"
   ```

2. **Missing Authorization**: Should skip user
   ```sql
   UPDATE users SET authorization_7702 = NULL WHERE id = 'test-user';
   ```

3. **Expired Authorization**: Should fail gracefully
   ```sql
   UPDATE users
   SET authorization_7702 = jsonb_set(
     authorization_7702,
     '{expiry}',
     to_jsonb(extract(epoch from now() - interval '1 hour')::integer)
   );
   ```

## Monitoring in Production

### Metrics to Track

1. **Success Rate**
   ```sql
   SELECT
     COUNT(*) FILTER (WHERE status = 'success') * 100.0 / COUNT(*) as success_rate
   FROM agent_actions
   WHERE created_at >= NOW() - INTERVAL '24 hours';
   ```

2. **Average APY Improvement**
   ```sql
   SELECT AVG((metadata->>'apyImprovement')::numeric * 100) as avg_apy_gain
   FROM agent_actions
   WHERE status = 'success'
     AND created_at >= NOW() - INTERVAL '7 days';
   ```

3. **Error Distribution**
   ```sql
   SELECT error_message, COUNT(*) as count
   FROM agent_actions
   WHERE status = 'failed'
     AND created_at >= NOW() - INTERVAL '24 hours'
   GROUP BY error_message
   ORDER BY count DESC;
   ```

### Alerts to Configure

- Success rate drops below 95%
- No cron runs in 10 minutes
- Database errors > 5% of requests
- Crossmint API failures
- Gas price exceeds limit

## Troubleshooting Tests

### Test Fails: "Database connection error"

**Solution**:
```bash
# Verify DATABASE_URL is set
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1;"
```

### Test Fails: "Crossmint API error"

**Solution**:
```bash
# Check API key is valid
curl https://staging.crossmint.com/api/v1-alpha1/health \
  -H "X-API-KEY: $CROSSMINT_SERVER_SIDE_API_KEY"
```

### Test Hangs: Timeout

**Solution**:
- Check if simulation mode is enabled
- Verify Gelato relay is responding
- Check for infinite loops in code

## Best Practices

1. **Always use simulation mode** for initial testing
2. **Clean up test data** after each test run
3. **Use realistic test data** (actual protocol addresses, reasonable amounts)
4. **Test error paths** as thoroughly as happy paths
5. **Monitor gas costs** to avoid expensive test runs
6. **Document test results** for debugging
7. **Version test data** alongside code changes

## Next Steps

1. ✅ Set up test environment
2. ✅ Run manual test suite
3. ⏳ Install Vitest framework
4. ⏳ Implement automated tests
5. ⏳ Set up CI/CD pipeline
6. ⏳ Configure monitoring alerts
