# Phase 4 Implementation Guide: Gelato Relay SDK Integration

**Quick Start Guide for Adding Gasless Transactions to LiqX**

---

## Prerequisites

- ✅ Phase 2 completed (wallet detection bug fixed)
- ✅ Privy authentication working
- ✅ Base network connectivity confirmed

---

## Step 1: Install Dependencies

```bash
cd fintech-starter-app
npm install @gelatonetwork/relay-sdk
```

---

## Step 2: Get Gelato API Key

1. Visit [Gelato App Dashboard](https://app.gelato.network/)
2. Sign up / Log in
3. Navigate to **Paymaster & Bundler** section
4. Generate a new API key
5. Add to `.env`:

```bash
# Add to fintech-starter-app/.env
GELATO_API_KEY="your_gelato_api_key_here"
```

---

## Step 3: Create Gelato Relay Module

**File:** `fintech-starter-app/lib/gelato/relay.ts`

```typescript
import { GelatoRelay } from "@gelatonetwork/relay-sdk";
import { encodeFunctionData, parseUnits, type Hex } from "viem";
import { base } from "viem/chains";

const relay = new GelatoRelay();
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

const erc20Abi = [
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export async function sendGaslessUSDC({
  to,
  amount,
  userAddress,
}: {
  to: string;
  amount: string;
  userAddress: string;
}) {
  console.log('[Gelato] Preparing gasless USDC transfer:', {
    to,
    amount,
    from: userAddress,
  });

  // Encode USDC transfer call
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [to as Hex, parseUnits(amount, 6)],
  });

  try {
    // Execute via Gelato Relay with sponsored gas
    const response = await relay.sponsoredCallERC2771(
      {
        chainId: base.id,
        target: USDC_ADDRESS,
        data,
        user: userAddress,
      },
      process.env.GELATO_API_KEY!
    );

    console.log('[Gelato] Transaction submitted:', response.taskId);

    return {
      taskId: response.taskId,
      status: "pending" as const,
    };
  } catch (error) {
    console.error('[Gelato] Failed to send gasless transaction:', error);
    throw error;
  }
}

/**
 * Check the status of a Gelato relay task
 */
export async function checkTaskStatus(taskId: string) {
  try {
    const response = await fetch(
      `https://api.gelato.digital/tasks/status/${taskId}`
    );
    const data = await response.json();

    return {
      taskId: data.taskId,
      status: data.taskState, // "pending" | "success" | "cancelled" | "failed"
      transactionHash: data.transactionHash,
      blockNumber: data.blockNumber,
    };
  } catch (error) {
    console.error('[Gelato] Failed to check task status:', error);
    throw error;
  }
}
```

---

## Step 4: Update useWallet Hook

**File:** `fintech-starter-app/hooks/useWallet.ts`

Add the `sendSponsored()` method to the wallet object:

```typescript
// Add import at top of file
import { sendGaslessUSDC, checkTaskStatus } from "@/lib/gelato/relay";

// Inside the walletObject return (around line 56), add this method after send():

      /**
       * Send tokens gaslessly (Gelato sponsored)
       * No gas fees required from user
       */
      async sendSponsored(to: string, asset: string, amount: string) {
        if (!wallet) throw new Error("Wallet not ready");
        if (!address) throw new Error("Wallet address not yet available");

        if (asset.toLowerCase() === "usdc") {
          // Execute gasless USDC transfer via Gelato
          const result = await sendGaslessUSDC({
            to,
            amount,
            userAddress: address,
          });

          return {
            hash: result.taskId, // Return taskId as hash for now
            taskId: result.taskId,
            checkStatus: () => checkTaskStatus(result.taskId),
          };
        }

        throw new Error(`Gasless transfers for ${asset} not supported yet`);
      },
```

Update the TypeScript interface to include the new method. The complete wallet object should now have both `send()` and `sendSponsored()`.

---

## Step 5: Update Send Funds Modal

**File:** `fintech-starter-app/components/send-funds/SendFundsModal.tsx`

Add a gasless transaction toggle:

```typescript
// Add state for gasless toggle
const [useGasless, setUseGasless] = useState(true);

// In the form, add the toggle (before the submit button):

<div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
  <div className="flex flex-col">
    <label className="text-sm font-medium text-gray-900">
      Gasless Transaction
    </label>
    <p className="text-xs text-gray-500">
      No ETH needed - Gelato sponsors gas fees
    </p>
  </div>
  <button
    type="button"
    onClick={() => setUseGasless(!useGasless)}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
      useGasless ? 'bg-blue-600' : 'bg-gray-300'
    }`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
        useGasless ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
</div>

// Update the send transaction logic:

const handleSend = async () => {
  try {
    setIsSending(true);

    if (useGasless) {
      // Gasless transaction via Gelato
      const result = await wallet.sendSponsored(recipientAddress, 'usdc', amount);
      console.log('[SendFunds] Gasless tx submitted:', result.taskId);

      // Poll for status
      const finalStatus = await result.checkStatus();
      console.log('[SendFunds] Gasless tx completed:', finalStatus);
    } else {
      // Regular transaction (user pays gas)
      const result = await wallet.send(recipientAddress, 'usdc', amount);
      console.log('[SendFunds] Regular tx submitted:', result.hash);
    }

    onClose();
    // Optionally show success toast
  } catch (error) {
    console.error('[SendFunds] Transaction failed:', error);
    // Show error message to user
  } finally {
    setIsSending(false);
  }
};
```

---

## Step 6: Test on Base Sepolia

Before testing on mainnet, test on Base Sepolia testnet:

1. **Get Test USDC on Base Sepolia**
   - Use a faucet or testnet bridge
   - Fund your Privy wallet address

2. **Test Regular Transaction**
   - Disable gasless toggle
   - Send small amount of USDC
   - Verify it works with user-paid gas

3. **Test Gasless Transaction**
   - Enable gasless toggle
   - Send small amount of USDC
   - Verify no ETH is deducted
   - Check Gelato dashboard for task status

4. **Monitor Gelato Dashboard**
   - Go to [Gelato App](https://app.gelato.network/relay)
   - View relay tasks
   - Check success/failure rates
   - Monitor Gas Tank balance

---

## Step 7: Configure for Production

Once testing is successful:

1. **Update Environment Variables**
   ```bash
   # Production .env
   GELATO_API_KEY="your_production_api_key"
   ```

2. **Set Up Gas Tank**
   - Fund your Gelato Gas Tank
   - Set up auto-reload if needed
   - Configure spending limits

3. **Enable Autoscale**
   - Prevent service interruptions
   - Handle traffic spikes
   - Set budget limits

4. **Add Error Handling**
   - Fallback to regular transaction if Gelato fails
   - Show user-friendly error messages
   - Log errors for monitoring

---

## Step 8: Deploy to Production

```bash
# Build and deploy
cd fintech-starter-app
npm run build
npm run start

# Or deploy to Vercel
vercel deploy --prod
```

---

## Optional: Advanced Features

### Feature 1: Hybrid Gas Payment Model

Let users pay gas in USDC instead of requiring ETH:

```typescript
// Use callWithSyncFeeERC2771 instead of sponsoredCallERC2771
const response = await relay.callWithSyncFeeERC2771(
  {
    chainId: base.id,
    target: USDC_ADDRESS,
    data,
    user: userAddress,
    feeToken: USDC_ADDRESS, // User pays gas in USDC
  },
  process.env.GELATO_API_KEY!
);
```

### Feature 2: Transaction Status Polling

Add real-time status updates in the UI:

```typescript
import { useEffect, useState } from 'react';

function useGelatoTaskStatus(taskId: string | null) {
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) return;

    const interval = setInterval(async () => {
      const result = await checkTaskStatus(taskId);
      setStatus(result.status);

      // Stop polling when complete
      if (result.status === 'success' || result.status === 'failed') {
        clearInterval(interval);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [taskId]);

  return status;
}
```

### Feature 3: Gas Savings Display

Show users how much they're saving:

```typescript
// Estimate gas cost for regular transaction
const gasPrice = await publicClient.getGasPrice();
const gasLimit = 50000n; // Approx for ERC20 transfer
const gasCostWei = gasPrice * gasLimit;
const gasCostUSD = calculateUSDValue(gasCostWei);

// Show in UI
<div className="text-sm text-green-600">
  💰 Saving ${gasCostUSD.toFixed(2)} in gas fees
</div>
```

---

## Troubleshooting

### Issue: "API key invalid"
- Verify API key is correct in .env
- Check if key has proper permissions
- Regenerate key if needed

### Issue: "Insufficient balance in Gas Tank"
- Fund your Gelato Gas Tank
- Check balance at [Gelato Dashboard](https://app.gelato.network/)

### Issue: "Transaction stuck pending"
- Check Gelato task status API
- Verify network connectivity
- Check if Base network is experiencing issues

### Issue: "Transaction reverted"
- Check if USDC balance is sufficient
- Verify recipient address is valid
- Check if USDC contract is correct

---

## Success Criteria

✅ Gasless toggle appears in Send Funds modal
✅ Can send USDC without ETH for gas
✅ Transaction appears in Gelato dashboard
✅ Transaction completes successfully on-chain
✅ No errors in browser console
✅ Balance updates correctly after transaction

---

## Estimated Timeline

- **Step 1-3** (Setup): 30 minutes
- **Step 4-5** (Integration): 2-3 hours
- **Step 6** (Testing): 1-2 hours
- **Step 7-8** (Production): 1 hour

**Total:** ~1 day for basic implementation

---

## Next: Phase 5

Once Phase 4 is complete and tested, you can proceed to Phase 5 (Autonomous Agent with EIP-7702). See the main plan document for details.

---

**Happy Building! 🚀**

For questions or issues, refer to:
- [Gelato Documentation](https://docs.gelato.cloud/)
- [Gelato Discord](https://discord.gg/gelato)
- GELATO_RESEARCH_REPORT.md (in this repo)
