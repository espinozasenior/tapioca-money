# Quick Start Guide - Autonomous Yield Optimization

> **Note:** This guide covers the current Gelato-based architecture (EIP-7702 + ERC-7715).
> For legacy Phase 5 documentation, see [`PHASE5_IMPLEMENTATION_SUMMARY.md`](./PHASE5_IMPLEMENTATION_SUMMARY.md) (deprecated).

## 🚀 Get Started in 5 Minutes

### Step 1: Configure Environment
```bash
# Copy environment template
cp .env.template .env.local

# Add required variables
nano .env.local
```

Required variables:
```bash
DATABASE_URL=postgresql://...                    # Your Neon database URL
NEXT_PUBLIC_GELATO_API_KEY=...                  # From Gelato console
CRON_SECRET=$(openssl rand -hex 32)             # Generate random secret
LIQX_AGENT_ADDRESS=0x...                        # Agent wallet address
AGENT_SIMULATION_MODE=true                      # Start with simulation
NEXT_PUBLIC_PRIVY_APP_ID=...                    # From Privy console
PRIVY_APP_SECRET=...                            # From Privy console
```

### Step 3: Test Locally
```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# In another terminal, test the cron
node scripts/test-agent-cron.ts --simulation
```

Expected output:
```
✅ Cron execution successful!
📊 Summary:
   • Processed:  0 users
   • Rebalanced: 0 users
   • Skipped:    0 users
   • Errors:     0 users
```

### Step 4: Create Test User

1. Open http://localhost:3000
2. Login with test wallet
3. Navigate to "Earn Yield"
4. Click "Enable Auto-Optimize"
5. Authorize EIP-7702 delegation

### Step 5: Trigger Agent

```bash
# Trigger cron manually
node scripts/test-agent-cron.ts --simulation

# Check logs for "[SIMULATION] Would execute rebalance"
```

### Step 6: Verify Dashboard

1. Navigate to agent dashboard in UI
2. Check for activity logs
3. Verify stats are displaying correctly

### Step 7: Deploy to Vercel

```bash
# Add environment variables to Vercel
vercel env add DATABASE_URL production
vercel env add CROSSMINT_SERVER_SIDE_API_KEY production
vercel env add CRON_SECRET production
vercel env add LIQX_AGENT_PRIVATE_KEY production
vercel env add AGENT_SIMULATION_MODE production

# Deploy
vercel --prod

# Monitor logs
vercel logs --follow
```

### Step 8: Monitor in Production

Check these endpoints:

1. **Health Check**: `https://your-domain.vercel.app/api/agent/health`
   - Should return `"status": "healthy"`

2. **Activity**: `https://your-domain.vercel.app/api/agent/activity?address=0x...`
   - Should return agent actions

3. **Vercel Dashboard**: Check "Cron Jobs" tab
   - Verify cron is scheduled and running

---

## 📚 Key Documentation

- **Operations**: See [AGENT_OPERATIONS_GUIDE.md](./AGENT_OPERATIONS_GUIDE.md)
- **Testing**: See [tests/TESTING_GUIDE.md](./tests/TESTING_GUIDE.md)
- **Implementation**: See [PHASE5_IMPLEMENTATION_SUMMARY.md](./PHASE5_IMPLEMENTATION_SUMMARY.md)

---

## 🐛 Common Issues

**Issue**: "Unauthorized" when triggering cron
**Fix**: Check CRON_SECRET matches between .env and request

**Issue**: "Missing Crossmint API Key"
**Fix**: Verify CROSSMINT_SERVER_SIDE_API_KEY is set in Vercel

**Issue**: No users processed
**Fix**: Ensure test user has `auto_optimize_enabled=true` and `authorization_7702` set

---

## 📞 Need Help?

1. Check [AGENT_OPERATIONS_GUIDE.md](./AGENT_OPERATIONS_GUIDE.md) troubleshooting section
2. Review [tests/TESTING_GUIDE.md](./tests/TESTING_GUIDE.md) for testing tips
3. Check [CLAUDE.md](../CLAUDE.md) for architecture documentation
4. Review agent logs: `curl http://localhost:3000/api/agent/cron -H "x-cron-secret: $CRON_SECRET"`

---

**Ready to deploy?** Follow Step 7 above and monitor for 24 hours! 🎉
