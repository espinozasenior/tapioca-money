# Yield Optimizer

Automated USDC yield optimization across Morpho, Aave, and Moonwell protocols on Base Sepolia using **Morpho Blue SDK**.

## Architecture

```
User → Components → useOptimizer hook → /api/optimize → lib/yield-optimizer
                                        /api/withdraw
                                                         ├── protocols/ (SDK-based)
                                                         ├── strategy/
                                                         └── executor.ts
```

## Protocol Status (Base Sepolia)

| Protocol     | Deployed | SDK Integration | Status      | Notes                                             |
| ------------ | -------- | --------------- | ----------- | ------------------------------------------------- |
| **Morpho**   | ✅ Yes   | ✅ Complete     | ✅ Ready    | Using Morpho Blue SDK with configured test market |
| **Aave**     | ❌ No    | ⚠️ Manual       | 🚫 Disabled | Not officially deployed on Base Sepolia           |
| **Moonwell** | ❌ No    | ⚠️ Manual       | 🚫 Disabled | Mainnet only                                      |

## Morpho Integration (SDK-Based) ✅

### Configuration

- **Morpho Blue Core**: `0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb`
- **USDC Token**: `0x036CBD53842c5426634E7929541eC2318f3dCF7E`
- **Adaptive Curve IRM**: `0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC`
- **Test Market**: Supply-only USDC market (configured in `config.ts`)

### SDK Integration Features

1. **Market Discovery** (`protocols/morpho.ts`):

   - Uses `Market.fetch()` from `@morpho-org/blue-sdk`
   - Automatic share-to-asset conversion
   - Live APY calculation from on-chain supply rate
   - Proper error handling with SDK types

2. **Position Tracking**:
   - Real-time position fetching with `Position.fetch()`
   - Automatic exchange rate calculation
   - Share and asset amounts tracked separately
3. **Transaction Building** (`executor.ts`):
   - Deposit: Approval + Supply (2 steps)
   - Withdrawal: Single-step exit (no approval needed)
   - Proper encoding with market params
4. **API Endpoints**:
   - `POST /api/optimize` - Build deposit transactions
   - `POST /api/withdraw` - Build withdrawal transactions
   - Full error handling and validation

### How to Use on Mainnet

When switching to Base mainnet:

1. Update `lib/yield-optimizer/config.ts`:

   ```typescript
   export const CHAIN_CONFIG = {
     chainId: 8453, // Base mainnet
     name: "Base",
     rpcUrl: "https://mainnet.base.org",
   };
   ```

2. Morpho markets will be available automatically
3. Real APY data will be fetched from markets

## Base Sepolia Test Market Setup

### Prerequisites

- Wallet with Sepolia ETH for gas (get from [Base Sepolia Faucet](https://www.base.org/faucet))
- Test USDC tokens at `0x036CBD53842c5426634E7929541eC2318f3dCF7E`
- Private key in `.env` as `DEPLOYER_PRIVATE_KEY`

### Deployment Steps

1. **Run the deployment script**:

   ```bash
   pnpm tsx scripts/deploy-morpho-market.ts
   ```

2. **Market Configuration** (already in `config.ts`):

   ```typescript
   export const MORPHO_USDC_MARKET_PARAMS = {
     loanToken: USDC_ADDRESS,
     collateralToken: USDC_ADDRESS, // Supply-only market
     oracle: "0x0000000000000000000000000000000000000000",
     irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
     lltv: 0n, // 0% = no borrowing
   };
   ```

3. **Verify market creation**:
   - Check Base Sepolia explorer for transaction
   - Test deposit in UI (should work after market creation)

### Market Type: Supply-Only

This test market is configured as **supply-only** (no borrowing):

- `lltv: 0n` - Loan-to-Value is 0%, meaning no loans allowed
- Users can only supply USDC to earn yield
- No collateral required
- Simpler testing without liquidation risks

### Testing on Testnet

Since no USDC markets exist on Base Sepolia:

**Option A**: Show UI Only (Current)

- Display estimated APYs
- Disable deposits
- Show "Coming Soon" message

**Option B**: Create Test Market

1. Deploy oracle contract
2. Deploy interest rate model
3. Create market with Morpho Blue
4. Enable deposits

**Option C**: Use Mainnet Simulation

- Fetch real APY data from Base mainnet
- Simulate transactions without execution

## Files Structure

```
lib/yield-optimizer/
├── config.ts              # Protocol addresses & config
├── types.ts               # Shared TypeScript types
├── index.ts               # Main exports
├── executor.ts            # Transaction builder (FIXED)
├── protocols/
│   ├── morpho.ts         # Market discovery + encoding (UPDATED)
│   ├── aave.ts           # Disabled on testnet
│   └── moonwell.ts       # Disabled on testnet
└── strategy/
    └── evaluator.ts      # Cost/risk evaluation
```

## Key Functions

### `buildDepositTransaction(protocol, userAddress, amount)`

Builds approval + supply transactions for a protocol.

**Fixed in this update:**

- Morpho now properly encodes supply transaction
- Checks for active markets before building
- Throws clear error if market unavailable

### `findActiveUsdcMarket()`

Queries Morpho registry for active USDC lending markets.

**Returns:**

- `{ marketId, marketParams }` if market found
- `null` if no markets available

### `buildMorphoSupplyData(marketParams, amount, userAddress)`

Encodes Morpho Blue supply transaction.

**Returns:**

- Properly encoded calldata (`0x...`)
- No longer returns empty `"0x"`

## Next Steps

1. **For Production (Mainnet)**:

   - Switch to Base mainnet
   - Markets will be available automatically
   - Enable real deposits

2. **For Testing (Testnet)**:

   - Create test market on Base Sepolia
   - Or use demo mode with simulated APYs
   - Wait for official Morpho testnet markets

3. **For Automation (GOAT)**:
   - Add GOAT SDK layer for autonomous decisions
   - Implement cron job for periodic rebalancing
   - Add delegated signing for auto-execution

## Error Messages

| Error                  | Meaning                    | Solution                     |
| ---------------------- | -------------------------- | ---------------------------- |
| "market not available" | No USDC markets on testnet | Wait or switch to mainnet    |
| "execution_reverted"   | Transaction would fail     | Check balance/market status  |
| "0x" calldata          | Empty transaction data     | **FIXED** - no longer occurs |

## Links

- [Morpho Docs](https://docs.morpho.org/)
- [Base Sepolia Explorer](https://sepolia.basescan.org/)
- [Morpho Blue Contract](https://sepolia.basescan.org/address/0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb)
