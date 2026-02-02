# Gelato Smart Wallet Integration with Crossmint

## Overview

This implementation bridges **Crossmint** (for user authentication) with **Gelato Smart Wallet SDK** (for EIP-7702 delegation and account abstraction), solving the problem that Crossmint doesn't natively support EIP-7702.

## Architecture

```
┌─────────────────┐
│   User Login    │
│  (Crossmint)    │  ← Email/Social Auth
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  EOA Wallet     │  ← Standard Ethereum Account
│  (Crossmint)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Gelato Smart   │  ← EIP-7702 Delegation
│  Wallet SDK     │     + Gas Sponsorship
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Agent Contract │  ← Auto-optimize logic
└─────────────────┘
```

## How It Works

### 1. User Onboarding (Crossmint)
- User logs in with email/social login via Crossmint
- Gets a standard EOA (Externally Owned Account)
- No smart contract features yet

### 2. Smart Wallet Upgrade (Gelato)
- When user enables auto-optimize, we:
  1. Get the Crossmint wallet provider
  2. Create a viem `WalletClient` from it
  3. Upgrade to Gelato Smart Wallet using `createGelatoSmartWalletClient`
  4. Gelato handles EIP-7702 delegation automatically

### 3. Agent Delegation
- The smart wallet delegates execution to the LiqX Agent contract
- Agent can now execute optimizations on user's behalf
- User maintains full control and can revoke anytime

## Key Components

### `lib/gelato/crossmint-gelato.ts`

Main integration module with these key functions:

#### `createCrossmintGelatoClient()`
Creates a Gelato Smart Wallet from a Crossmint wallet:
```typescript
const gelatoClient = await createCrossmintGelatoClient({
  wallet: crossmintWallet,
  address: userAddress,
  apiKey: gelatoApiKey  // Optional, for gas sponsorship
});
```

#### `registerAgentWithGelato()`
Registers the agent with EIP-7702 delegation:
```typescript
const { smartAccountAddress } = await registerAgentWithGelato({
  wallet: crossmintWallet,
  address: userAddress,
  agentContractAddress: "0x...",
  apiKey: gelatoApiKey
});
```

#### `executeTransaction()`
Executes transactions with gas sponsorship:
```typescript
await executeTransaction(gelatoClient, [
  { to: "0x...", data: "0x...", value: 0n }
], "sponsored");  // or "native" or { token: "0x..." }
```

### Updated Registration Flow

**Before (Direct EIP-7702 - Didn't work with Crossmint):**
```typescript
// ❌ Crossmint doesn't support experimental_signAuthorization
const authorization = await client.experimental_signAuthorization({
  contractAddress: agentContract
});
```

**After (Gelato Integration - Works with Crossmint):**
```typescript
// ✅ Gelato handles EIP-7702 internally
const { smartAccountAddress } = await registerAgentWithGelato({
  wallet: crossmintWallet,
  address: userAddress,
  agentContractAddress,
  apiKey: gelatoApiKey
});
```

## Environment Setup

### Required Environment Variables

Add to your `.env` file:

```bash
# Gelato Smart Wallet SDK
NEXT_PUBLIC_GELATO_API_KEY=your_gelato_api_key

# Get your API key from:
# https://app.gelato.network/
```

### Get Gelato API Key

1. Go to [Gelato App](https://app.gelato.network/)
2. Sign up / Log in
3. Create a new project
4. Copy your API key
5. Add to `.env` file

## Benefits

### ✅ EIP-7702 Support
- Social login users can delegate to smart contracts
- Maintains EOA compatibility
- No complex account creation

### ✅ Gas Sponsorship
- Sponsor user transactions
- Users don't need native tokens
- Seamless onboarding experience

### ✅ Batch Transactions
- Execute multiple operations atomically
- Reduces gas costs
- Better UX

### ✅ ERC-20 Gas Payments
- Let users pay gas with USDC/stablecoins
- No need to hold native tokens
- More flexible payment options

## Usage Example

```typescript
import { createCrossmintGelatoClient, executeTransaction, sponsored } from "@/lib/gelato/crossmint-gelato";

// 1. Create Gelato client from Crossmint wallet
const gelatoClient = await createCrossmintGelatoClient({
  wallet: crossmintWallet,
  address: userAddress,
  apiKey: process.env.NEXT_PUBLIC_GELATO_API_KEY
});

// 2. Execute sponsored transaction
const response = await executeTransaction(
  gelatoClient,
  [
    {
      to: morphoVaultAddress,
      data: depositCalldata,
      value: 0n
    }
  ],
  "sponsored"  // Gelato sponsors the gas
);

console.log("Task ID:", response.taskId);
```

## Testing

1. **Check Database Schema**
   ```bash
   node --env-file=.env scripts/check-schema.js
   ```

2. **Check User Status**
   ```bash
   node --env-file=.env scripts/check-user-status.js <wallet_address>
   ```

3. **Try Auto-Optimize Toggle**
   - Log in with Crossmint (email/social)
   - Click the auto-optimize toggle
   - Check browser console for detailed logs
   - Should see: `[Gelato-Crossmint]` log messages

## Debugging

### Browser Console Logs

When registration runs, you'll see detailed logs:

```
[Agent Registration] Starting registration flow
[Agent Registration] Wallet status: connected
[Gelato-Crossmint] Getting provider from Crossmint wallet...
[Gelato-Crossmint] ✅ Got provider via evmWallet.getProvider()
[Gelato-Crossmint] Creating viem wallet client...
[Gelato-Crossmint] ✅ viem wallet client created
[Gelato-Crossmint] Upgrading to Gelato Smart Wallet...
[Gelato-Crossmint] ✅ Gelato Smart Wallet client created!
[Gelato-Crossmint] Smart Account Address: 0x...
```

### Common Issues

**Issue: "No signing provider found"**
- Solution: Wallet session expired, log out and back in

**Issue: "Gelato API key required"**
- Solution: Add `NEXT_PUBLIC_GELATO_API_KEY` to `.env`

**Issue: "Failed to create smart wallet"**
- Check Gelato API key is valid
- Ensure chain is supported (Base is supported)
- Check browser console for detailed error

## Resources

- [Gelato Smart Wallet SDK Docs](https://docs.gelato.cloud/smart-wallets)
- [Gelato EIP-7702 Guide](https://docs.gelato.cloud/smart-wallet-sdk/introduction/understanding-eip-7702)
- [Crossmint Docs](https://docs.crossmint.com/)
- [@gelatonetwork/smartwallet on npm](https://www.npmjs.com/package/@gelatonetwork/smartwallet)

## Migration Notes

### What Changed

1. **Removed**: Direct EIP-7702 authorization via viem
2. **Added**: Gelato Smart Wallet SDK integration
3. **Updated**: Registration flow in `useOptimizer.ts`
4. **Created**: `lib/gelato/crossmint-gelato.ts` module

### Database Changes

The `authorization_7702` field now stores:
```json
{
  "type": "gelato",
  "smartAccountAddress": "0x...",
  "agentContractAddress": "0x...",
  "timestamp": 1706659200000
}
```

Instead of the raw EIP-7702 authorization signature.

## Next Steps

1. ✅ Get Gelato API key
2. ✅ Add to `.env` file
3. ✅ Test with social login
4. ⏭️ Implement actual agent logic
5. ⏭️ Add transaction monitoring
6. ⏭️ Handle revocation flow

## Support

- **Gelato Discord**: [https://discord.gg/gelato](https://discord.gg/gelato)
- **Crossmint Discord**: [https://discord.gg/crossmint](https://discord.gg/crossmint)
- **GitHub Issues**: Report issues in your repo
