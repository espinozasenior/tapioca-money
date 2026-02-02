# Quick Start: Testing the Migration

## 🚀 Get Started in 3 Steps

### Step 1: Configure Environment Variables

1. **Get Privy App ID**
   - Go to https://dashboard.privy.io/
   - Sign up or log in
   - Create a new app
   - Copy your App ID

2. **Get Gelato API Key**
   - Go to https://app.gelato.network/
   - Sign up or log in
   - Navigate to API Keys
   - Create and copy an API key

3. **Update `.env` file**

Create or update your `.env` file in the root directory:

```bash
# Copy from .env.example if you haven't
cp .env.example .env
```

Then add these values:

```bash
NEXT_PUBLIC_PRIVY_APP_ID=clxxxxxxxxxxxxx  # From Privy Dashboard
NEXT_PUBLIC_GELATO_API_KEY=your_gelato_key_here  # From Gelato
NEXT_PUBLIC_CHAIN_ID=base
```

### Step 2: Install Dependencies (if not done)

```bash
pnpm install
```

### Step 3: Start the App

The fintech-starter-app is configured to run from the root directory:

```bash
# Make sure you're in the root directory (LiqX/)
pnpm dev
```

The app will automatically use the fintech-starter-app configuration.

Visit http://localhost:3000

## ✅ Quick Test Checklist

1. **Login Test**
   - [ ] Click "Login" button
   - [ ] Try email login
   - [ ] Try Google login
   - [ ] Verify you see your wallet address

2. **Wallet Test**
   - [ ] Check if USDC balance loads
   - [ ] Verify wallet address is displayed
   - [ ] Confirm it's a single address (not two)

3. **Features Test**
   - [ ] Test deposit functionality
   - [ ] Test send funds
   - [ ] Test yield optimizer
   - [ ] Toggle auto-optimize on/off

4. **Persistence Test**
   - [ ] Refresh the page
   - [ ] Verify you stay logged in
   - [ ] Check wallet state persists

## 🐛 Common Issues

### "NEXT_PUBLIC_PRIVY_APP_ID is not set"
**Solution**: Make sure your `.env` file is in the root directory and contains the Privy App ID. Restart the dev server.

### "Cannot connect wallet"
**Solution**:
1. Check browser console for errors
2. Make sure Gelato API key is valid
3. Try logging out and back in

### "Balance shows 0"
**Solution**: This is expected if it's a new wallet. Try the deposit flow to add test funds.

## 📊 What Changed?

| Before (Crossmint) | After (Privy + Gelato) |
|-------------------|------------------------|
| Two wallet addresses | One wallet address |
| Manual fund transfers | No transfers needed |
| Complex setup | Simple setup |
| Crossmint EOA + Gelato Smart Wallet | Unified Gelato Smart Wallet |

## 📚 More Information

- **Full Migration Details**: See `MIGRATION_COMPLETE.md`
- **Detailed Guide**: See `fintech-starter-app/MIGRATION_GUIDE.md`
- **Troubleshooting**: Check browser console and migration guide

## 💡 Tips

1. **Use Test Mode**: Both Privy and Gelato have test modes - use these during development
2. **Gas Sponsorship**: Gelato can sponsor gas - make sure your API key is configured for this
3. **Browser Console**: Check for any warnings or errors in the console
4. **Network**: Ensure you're on the Base network (configured via NEXT_PUBLIC_CHAIN_ID)

## ✨ Expected Behavior

After successful login with Privy:
- You'll see a single wallet address
- No need to transfer funds between wallets
- Gas fees can be sponsored by Gelato
- All existing features work the same way

## 📝 Feedback

If you encounter any issues:
1. Check the browser console
2. Review the environment variables
3. Consult the detailed migration guide
4. Check that all dependencies installed correctly

---

**Ready to Test?** Follow the 3 steps above and run through the checklist! 🚀
