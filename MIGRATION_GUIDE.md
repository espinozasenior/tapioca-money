# Migration Guide: Crossmint → Privy + Gelato

This document guides you through the final steps to complete the migration from Crossmint to Privy + Gelato.

## ✅ Completed Steps

1. ✅ Installed Privy and Gelato SDKs
2. ✅ Created new providers setup with Gelato + Privy
3. ✅ Created wallet and auth hook adapters
4. ✅ Updated all components to use new hooks
5. ✅ Removed most Crossmint dependencies (kept checkout for payments)

## 🔧 Required Configuration

### Step 1: Get Privy App ID

1. Go to [Privy Dashboard](https://dashboard.privy.io/)
2. Create a new app or select existing app
3. Copy your App ID
4. Add to your `.env` file:

```bash
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id_here
```

### Step 2: Get Gelato API Key

1. Go to [Gelato Network](https://app.gelato.network/)
2. Create an account and get your API key
3. Add to your `.env` file:

```bash
NEXT_PUBLIC_GELATO_API_KEY=your_gelato_api_key_here
```

### Step 3: Configure Chain

Add the chain configuration to your `.env`:

```bash
NEXT_PUBLIC_CHAIN_ID=base
```

### Step 4: (Optional) Keep Crossmint for Checkout

If you want to keep using Crossmint's embedded checkout for payments:

```bash
NEXT_PUBLIC_CROSSMINT_CLIENT_API_KEY=your_crossmint_key_here
```

## 📋 Environment Variables Summary

Your `.env` file should have at minimum:

```bash
# Required for Privy + Gelato
NEXT_PUBLIC_PRIVY_APP_ID=clxxxxxxxxxxxxx
NEXT_PUBLIC_GELATO_API_KEY=your_gelato_api_key
NEXT_PUBLIC_CHAIN_ID=base

# Optional: Keep for payment gateway
NEXT_PUBLIC_CROSSMINT_CLIENT_API_KEY=your_crossmint_key
```

## 🚀 Start the Application

After configuring environment variables:

```bash
pnpm dev
```

## 🧪 Testing Checklist

After starting the app, test the following:

- [ ] User can login with email
- [ ] User can login with Google
- [ ] Wallet address displays correctly in UI
- [ ] USDC balance loads
- [ ] Can send USDC transactions
- [ ] Can deposit to yield protocols
- [ ] Auto-optimize toggle works
- [ ] Transaction history loads
- [ ] Can logout
- [ ] State persists across page refresh

## 🏗️ Architecture Changes

### Before (Crossmint + Gelato)
```
User Login (Crossmint)
    ↓
Crossmint EOA: 0x532AC... ← User's visible wallet
    ↓
Gelato Smart Account: 0xDiff... ← Second address
    ↓
User must transfer funds between wallets
```

### After (Privy + Gelato)
```
User Login (Privy - email/social)
    ↓
Gelato Smart Wallet: 0xOnly... ← Single address
    ↓
No transfers needed - clean architecture
```

## ✨ Benefits

1. **Single Wallet Address**: No more confusing dual addresses
2. **No Fund Transfers**: Users don't need to move funds between wallets
3. **Better UX**: Cleaner, simpler interface
4. **EIP-7702 Ready**: Native support when Base enables it
5. **Gas Sponsorship**: Users don't pay gas fees

## 🐛 Troubleshooting

### "NEXT_PUBLIC_PRIVY_APP_ID is not set"

Make sure you've added the Privy App ID to your `.env` file and restarted the dev server.

### "Gelato client not ready"

The Gelato client takes a moment to initialize. Make sure:
1. User is logged in with Privy
2. Wallet is connected
3. Check browser console for any errors

### "Cannot read properties of undefined (reading 'balances')"

This means the wallet hasn't finished initializing. The `useWallet` hook includes an `isReady` flag you can check:

```typescript
const { wallet, isReady } = useWallet();

if (!isReady) {
  return <div>Loading wallet...</div>;
}
```

## 📚 Additional Resources

- [Privy Documentation](https://docs.privy.io/)
- [Gelato Network Documentation](https://docs.gelato.network/)
- [EIP-7702 Specification](https://eips.ethereum.org/EIPS/eip-7702)

## 🗑️ Clean Up (Optional)

Once you've tested and everything works, you can:

1. Remove unused Crossmint packages:
```bash
pnpm remove @crossmint/client-sdk-react-ui
```

2. Delete the old Gelato-Crossmint bridge:
```bash
rm fintech-starter-app/lib/gelato/crossmint-gelato.ts
```

3. Remove Crossmint environment variables from `.env` if not using checkout

## 📞 Need Help?

If you encounter issues during migration:
1. Check the browser console for errors
2. Verify all environment variables are set correctly
3. Make sure you're using the latest versions of Privy and Gelato SDKs
