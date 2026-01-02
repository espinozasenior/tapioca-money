import React, { useState } from "react";
import { EVMWallet, useWallet } from "@crossmint/client-sdk-react-ui";
import { AmountInput } from "../common/AmountInput";
import { PrimaryButton } from "../common/PrimaryButton";
import { useBalance } from "@/hooks/useBalance";
import { YieldOpportunity } from "@/hooks/useOptimizer";
import { buildDepositTransaction } from "@/lib/yield-optimizer/executor";
import { cn } from "@/lib/utils";

interface DepositYieldProps {
  yieldOpportunity: YieldOpportunity;
  onSuccess: () => void;
  onProcessing: () => void;
}

// Format APY for display
const formatApy = (apy: number) => {
  return `${(apy * 100).toFixed(2)}%`;
};

export function DepositYield({ yieldOpportunity, onSuccess, onProcessing }: DepositYieldProps) {
  const { wallet } = useWallet();
  const { displayableBalance, refetch: refetchBalance } = useBalance();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isAmountValid =
    !!amount &&
    !Number.isNaN(Number(amount)) &&
    Number(amount) > 0 &&
    Number(amount) <= Number(displayableBalance);

  // Calculate estimated yearly earnings
  const estimatedYearlyEarnings = isAmountValid
    ? (Number(amount) * (yieldOpportunity.rewardRate?.total || 0)).toFixed(2)
    : "0.00";

  const handleDeposit = async () => {
    if (!wallet?.address) {
      setError("No wallet connected");
      return;
    }

    if (!isAmountValid) {
      setError("Invalid amount");
      return;
    }

    setError(null);
    setIsLoading(true);
    onProcessing();

    try {
      // Get unsigned transactions from optimizer
      const response = await buildDepositTransaction(
        yieldOpportunity.protocol,
        wallet.address as `0x${string}`,
        amount
      );
      // Sort transactions by stepIndex to ensure correct order (APPROVAL before SUPPLY)
      const sortedTransactions = [...(response.transactions || [])].sort(
        (a: any, b: any) => (a.stepIndex || 0) - (b.stepIndex || 0)
      );

      // Execute each transaction through Crossmint wallet
      const evmWallet = EVMWallet.from(wallet);

      for (let i = 0; i < sortedTransactions.length; i++) {
        const tx = sortedTransactions[i];
        const unsignedTx = JSON.parse(tx.unsignedTransaction);

        // Send the transaction with all relevant parameters
        const txResult = await evmWallet.sendTransaction({
          to: unsignedTx.to,
          data: unsignedTx.data,
          value: unsignedTx.value || "0x0",
          // Include gas parameters if available
          ...(unsignedTx.gasLimit && { gas: unsignedTx.gasLimit }),
        });

        // Small delay between transactions to allow state to update
        if (i < sortedTransactions.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      // Refresh balance after successful deposit
      await refetchBalance();
      onSuccess();
    } catch (err: any) {
      console.error("[Yield] Deposit error:", err);
      
      // User-friendly error messages
      let errorMessage = err.message || "Failed to deposit. Please try again.";
      
      if (errorMessage.includes("market not available")) {
        errorMessage = "Morpho markets are not yet deployed on Base Sepolia testnet. Please check back later or switch to mainnet.";
      } else if (errorMessage.includes("execution_reverted")) {
        errorMessage = "Transaction would revert. This may be due to insufficient balance or market not available.";
      }
      
      setError(errorMessage);
      setIsLoading(false);
    }
  };

  // Demo mode handler (when API key is not configured)
  const handleDemoDeposit = () => {
    if (!isAmountValid) {
      setError("Invalid amount");
      return;
    }

    setError(null);
    onProcessing();

    // Simulate transaction processing
    setTimeout(() => {
      onSuccess();
    }, 2000);
  };

  // Always enabled - no API key needed for direct protocol integration
  const isEnabled = true;

  return (
    <div className="mt-4 flex w-full flex-col">
      {/* Yield Info Card */}
      <div className="from-primary/5 to-primary/10 mb-6 rounded-xl bg-gradient-to-br p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">Current APY</p>
            <p className="text-primary text-2xl font-bold">
              {formatApy(yieldOpportunity.rewardRate?.total || 0)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Protocol</p>
            <p className="font-semibold text-gray-900">
              {yieldOpportunity.providerId
                ? yieldOpportunity.providerId.charAt(0).toUpperCase() +
                  yieldOpportunity.providerId.slice(1)
                : "Unknown"}
            </p>
          </div>
        </div>

        {yieldOpportunity.metadata.description && (
          <p className="mt-3 text-xs text-gray-500">{yieldOpportunity.metadata.description}</p>
        )}
      </div>

      {/* Amount Input */}
      <div className="mb-4 flex w-full flex-col items-center">
        <AmountInput amount={amount} onChange={setAmount} />
        <div
          className={cn(
            "mt-1 text-sm",
            Number(amount) > Number(displayableBalance) ? "text-red-600" : "text-gray-400"
          )}
        >
          ${displayableBalance} available
        </div>
      </div>

      {/* Quick amount buttons */}
      <div className="mb-6 flex justify-center gap-2">
        {[25, 50, 75, 100].map((percent) => (
          <button
            key={percent}
            onClick={() => {
              const newAmount = ((Number(displayableBalance) * percent) / 100).toFixed(2);
              setAmount(newAmount);
            }}
            className="hover:border-primary hover:text-primary rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 transition"
          >
            {percent}%
          </button>
        ))}
      </div>

      {/* Estimated Earnings */}
      {isAmountValid && (
        <div className="mb-6 rounded-lg bg-gray-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Estimated yearly earnings</span>
            <span className="text-primary font-semibold">${estimatedYearlyEarnings} USDC</span>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Based on current APY. Actual earnings may vary.
          </p>
        </div>
      )}

      {/* Error Display */}
      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {/* Deposit Button */}
      <PrimaryButton onClick={handleDeposit} disabled={!isAmountValid || isLoading}>
        {isLoading ? "Processing..." : `Deposit ${amount || "0"} USDC`}
      </PrimaryButton>

      {/* Risk Disclaimer */}
      <p className="mt-4 text-center text-xs text-gray-400">
        By depositing, you acknowledge that DeFi protocols carry smart contract risks. Only deposit
        what you can afford to lose.
      </p>
    </div>
  );
}
