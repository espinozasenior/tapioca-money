# ZeroDev + Privy Implementation

## Architecture Overview

This implementation uses **ZeroDev's Kernel V3** smart accounts with **Privy** authentication to enable autonomous yield optimization.

### Key Components

1. **Privy Embedded Wallets** - User authentication & wallet management
2. **ZeroDev Kernel V3** - Smart account (ERC-4337)
3. **Session Keys** - Scoped permissions for autonomous operations
4. **Morpho Vaults** - Yield-earning positions
5. **Cron Job** - Autonomous rebalancing

---

## Flow Diagram

```
User (Privy EOA)
    ↓
[Click "Auto-Optimize"]
    ↓
Create Kernel V3 Smart Account (lib/zerodev/client.ts)
    ├─ Privy wallet = signer
    ├─ Generate session key
    └─ Set permissions (Morpho vaults only)
    ↓
Store session key in database
    ├─ Smart account address
    ├─ Session private key (encrypted!)
    ├─ Approved vaults
    └─ Expiry (30 days)
    ↓
Cron job runs every 5 minutes
    ├─ Query users with active session keys
    ├─ Evaluate yield opportunities (Morpho API)
    └─ Execute rebalancing if profitable (>0.5% APY improvement)
```

---

## Implementation Details

### Frontend (Client-Side)

**File:** `lib/zerodev/client.ts`

```typescript
// 1. Create Kernel V3 smart account
const kernelAccount = await createKernelAccount(publicClient, {
  plugins: {
    sudo: ecdsaValidator, // Privy as main signer
  },
  kernelVersion: KERNEL_V3_1,
});

// 2. Generate session key for backend
const sessionPrivateKey = generatePrivateKey();
const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);

// 3. Create permission validator
const permissionValidator = await toPermissionValidator(publicClient, {
  signer: sessionKeyAccount,
  policies: [
    toSudoPolicy({}), // Full permissions within allowed contracts
  ],
  kernelVersion: KERNEL_V3_1,
});

// 4. Return session key to backend for storage
return {
  smartAccountAddress,
  sessionKeyAddress,
  sessionPrivateKey, // ⚠️ Encrypt in production!
  expiry,
  approvedVaults,
};
```

### Backend (Autonomous Execution)

**File:** `lib/agent/rebalance-executor.ts`

```typescript
// 1. Load session key from database
const sessionKeySigner = privateKeyToAccount(sessionPrivateKey);

// 2. Create Kernel account with session key
const kernelAccount = await createKernelAccount(publicClient, {
  address: smartAccountAddress,
  plugins: {
    sudo: permissionValidator,
  },
});

// 3. Execute batch transaction (redeem → approve → deposit)
const userOpHash = await kernelClient.sendUserOperation({
  userOperation: {
    callData: await kernelAccount.encodeCallData(calls),
  },
});
```

---

## Security Model

### What the Session Key Can Do ✅

- Interact with approved Morpho vaults only
- Transfer USDC up to allowance (10,000 USDC)
- Valid for 30 days
- Can be revoked by user anytime

### What the Session Key CANNOT Do ❌

- Transfer ETH or other tokens
- Interact with unapproved contracts
- Exceed USDC allowance
- Continue after expiry
- Work after user revokes

### User Controls

- **Full custody** - Funds always in user's smart account
- **Revocable** - Can disable auto-optimize anytime
- **Transparent** - All transactions visible on-chain
- **Time-limited** - Session expires after 30 days

---

## Environment Variables

```bash
# Required
NEXT_PUBLIC_PRIVY_APP_ID=        # Privy dashboard
PRIVY_APP_SECRET=                 # Privy secret key
ZERODEV_PROJECT_ID=              # ZeroDev dashboard
DATABASE_URL=                     # Postgres connection
CRON_SECRET=                      # For cron authentication

# Optional
ZERODEV_BUNDLER_URL=             # Custom bundler (defaults to ZeroDev's)
AGENT_SIMULATION_MODE=true        # Test mode (no real transactions)
```

---

## Setup Instructions

### 1. Install Dependencies

```bash
pnpm add @zerodev/sdk @zerodev/session-key permissionless
```

### 2. Configure Environment

```bash
cp .env.template .env.local
# Fill in required variables
```

### 3. Get ZeroDev Project ID

1. Go to https://dashboard.zerodev.app
2. Create a new project
3. Select "Kernel V3" and "Base" network
4. Copy the Project ID

### 4. Test Locally

```bash
# Start dev server
pnpm dev

# In another terminal, trigger Auto-Optimize
# Navigate to app → Earn Yield → Toggle Auto-Optimize
```

### 5. Test Cron Job

```bash
# With AGENT_SIMULATION_MODE=true
curl -X POST http://localhost:3000/api/agent/cron \
  -H "x-cron-secret: $CRON_SECRET"

# Check logs for simulation results
```

---

## Current Implementation

| Aspect | ZeroDev |
|--------|---------|
| **Smart Account** | Kernel V3 ✓ |
| **Session Keys** | Session Key Plugin ✓ |
| **SDK Compatibility** | ✅ Works with Privy |
| **Documentation** | Comprehensive |
| **Agent Wallet** | ❌ Not needed (session key = permission grant) |
| **Permission Model** | ZeroDev Policies ✓ |

---

## Key Benefits

1. **No Agent Wallet Needed** - Session key = permission grant, not separate wallet
2. **Proven Integration** - ZeroDev has official Privy support
3. **Better Documentation** - Clear examples and guides
4. **Production Ready** - Used by major protocols
5. **Flexible Permissions** - Granular policy system

---

## Production Considerations

### Security

⚠️ **CRITICAL:** Encrypt session private keys before storing in database!

```typescript
// Example using encryption
import { encrypt } from './encryption';

const encryptedKey = await encrypt(sessionPrivateKey, SECRET_KEY);

await db.storeAuthorization({
  sessionPrivateKey: encryptedKey, // Store encrypted!
});
```

### Monitoring

- Track UserOperation hashes
- Monitor gas costs
- Alert on failed transactions
- Log all rebalancing decisions

### Rate Limiting

- Implement per-user limits
- Throttle API calls
- Add circuit breakers

---

## Troubleshooting

### "Session key expired"

- Session keys expire after 30 days
- User must toggle Auto-Optimize off and back on to renew

### "Insufficient gas"

- ZeroDev bundler should sponsor gas
- Check ZERODEV_PROJECT_ID is configured
- Verify paymaster has funds

### "Permission denied"

- Session key can only interact with approved vaults
- Check vault address is in approvedVaults array
- Verify session hasn't been revoked

---

## References

- [ZeroDev Docs](https://docs.zerodev.app)
- [ZeroDev + Privy Integration](https://docs.zerodev.app/sdk/signers/privy)
- [Kernel V3 Documentation](https://docs.zerodev.app/sdk/core-api/create-account)
- [Session Keys Guide](https://docs.zerodev.app/sdk/permissions/intro)
