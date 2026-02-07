import React, { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { createWalletClient, createPublicClient, custom, http } from "viem";
import { base } from "viem/chains";
import { AmountInput } from "../common/AmountInput";
import { PrimaryButton } from "../common/PrimaryButton";
import { useBalance } from "@/hooks/useBalance";
import { YieldOpportunity } from "@/hooks/useOptimizer";
import { buildDepositTransaction } from "@/lib/yield-optimizer/executor";
import { cn } from "@/lib/utils";
import { VaultSafetyDetails } from "./VaultSafetyDetails";

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
  const [currentStep, setCurrentStep] = useState<{
    index: number;
    title: string;
    hash?: string;
    total?: number;
  } | null>(null);

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

    // Ensure wallet has required methods
    if (!wallet.getEthereumProvider) {
      setError("Wallet provider not available");
      return;
    }

    if (!isAmountValid) {
      setError("Invalid amount");
      return;
    }

    setError(null);
    setIsLoading(true);
    onProcessing();

    // Track current step locally (not via React state) so catch block has access
    let activeStep: { index: number; title: string } | null = null;

    try {
      // Get unsigned transactions from optimizer
      // For Morpho vaults, pass the vault address from the opportunity
      const vaultAddress = yieldOpportunity.metadata?.vaultAddress as `0x${string}` | undefined;

      const response = await buildDepositTransaction(
        yieldOpportunity.protocol,
        wallet.address as `0x${string}`,
        amount,
        vaultAddress // Pass vault address for ERC4626 deposits
      );
      // Sort transactions by stepIndex to ensure correct order (APPROVAL before SUPPLY)
      const sortedTransactions = [...(response.transactions || [])].sort(
        (a: any, b: any) => (a.stepIndex || 0) - (b.stepIndex || 0)
      );

      // Get Ethereum provider from Privy wallet
      const provider = await wallet.getEthereumProvider();

      // Create wallet client with the provider
      const walletClient = createWalletClient({
        account: wallet.address as `0x${string}`,
        chain: base,
        transport: custom(provider),
      });

      // Create public client for waiting transaction receipts
      const publicClient = createPublicClient({
        chain: base,
        transport: http(),
      });

      const totalSteps = sortedTransactions.length;

      // Execute each transaction through Privy wallet
      for (let i = 0; i < sortedTransactions.length; i++) {
        const tx = sortedTransactions[i];
        const unsignedTx = JSON.parse(tx.unsignedTransaction);

        activeStep = { index: i + 1, title: tx.title };

        // Update UI with current step
        setCurrentStep({
          index: i + 1,
          title: tx.title,
          total: totalSteps,
        });

        // Send the transaction through wallet client
        const hash = await walletClient.sendTransaction({
          to: unsignedTx.to as `0x${string}`,
          data: unsignedTx.data as `0x${string}`,
          value: BigInt(unsignedTx.value || "0x0"),
          ...(unsignedTx.gas && { gas: BigInt(unsignedTx.gas) }),
        });

        console.log(`[Yield] Step ${i + 1}/${totalSteps} (${tx.title}) hash:`, hash);

        // Update step with transaction hash
        setCurrentStep({
          index: i + 1,
          title: tx.title,
          hash,
          total: totalSteps,
        });

        // Wait for transaction confirmation
        const receipt = await publicClient.waitForTransactionReceipt({
          hash,
        });

        // Verify transaction succeeded
        if (receipt.status !== "success") {
          throw new Error(
            `Transaction failed: ${tx.title}. Check on Basescan: https://basescan.org/tx/${hash}`
          );
        }

        console.log(
          `[Yield] Step ${i + 1}/${totalSteps} confirmed:`,
          receipt.transactionHash
        );
      }

      // Refresh balance after successful deposit
      await refetchBalance();
      setCurrentStep(null);
      onSuccess();
    } catch (err: any) {
      console.error("[Yield] Deposit error at step", activeStep?.index, ":", err);

      // User-friendly error messages with context
      let errorMessage = err.message || "Failed to deposit. Please try again.";

      if (activeStep) {
        errorMessage = `Failed at step ${activeStep.index} (${activeStep.title}): ${errorMessage}`;
      }

      if (errorMessage.includes("market not available")) {
        errorMessage = "Morpho markets are not yet deployed on Base Sepolia testnet. Please check back later or switch to mainnet.";
      } else if (errorMessage.includes("execution_reverted")) {
        errorMessage = "Transaction would revert. This may be due to insufficient balance or market not available.";
      }

      setError(errorMessage);
      setIsLoading(false);
      setCurrentStep(null);
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

        {/* Safety Information */}
        <div className="mt-4 border-t border-primary/10 pt-4">
          <VaultSafetyDetails vault={yieldOpportunity} />
        </div>
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

      {/* Transaction Hash Display */}
      {currentStep && currentStep.hash && (
        <div className="mb-4 rounded-lg bg-blue-50 p-3 text-xs text-blue-600">
          <p className="font-medium">
            Step {currentStep.index}: {currentStep.title}
          </p>
          <p className="mt-1 break-all font-mono">
            Tx: {currentStep.hash.slice(0, 10)}...{currentStep.hash.slice(-8)}
          </p>
          <a
            href={`https://basescan.org/tx/${currentStep.hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-blue-700 underline hover:text-blue-900"
          >
            View on Basescan →
          </a>
        </div>
      )}

      {/* Deposit Button */}
      <PrimaryButton onClick={handleDeposit} disabled={!isAmountValid || isLoading}>
        {isLoading && currentStep
          ? `Step ${currentStep.index}/${currentStep.total}: ${currentStep.title}...`
          : isLoading
            ? "Processing..."
            : `Deposit ${amount || "0"} USDC`}
      </PrimaryButton>

      {/* Risk Disclaimer */}
      <p className="mt-4 text-center text-xs text-gray-400">
        By depositing, you acknowledge that DeFi protocols carry smart contract risks. Only deposit
        what you can afford to lose.
      </p>
    </div>
  );
}
