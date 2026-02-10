import React, { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { usePrivy } from "@privy-io/react-auth";
import { AmountInput } from "../common/AmountInput";
import { PrimaryButton } from "../common/PrimaryButton";
import { useBalance } from "@/hooks/useBalance";
import { YieldOpportunity } from "@/hooks/useOptimizer";
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
  const { getAccessToken } = usePrivy();
  const { displayableBalance, refetch: refetchBalance } = useBalance();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

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

    const vaultAddress = yieldOpportunity.metadata?.vaultAddress as string | undefined;
    if (!vaultAddress) {
      setError("Vault address not available for this opportunity");
      return;
    }

    setError(null);
    setIsLoading(true);
    setTxHash(null);
    onProcessing();

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("Failed to get access token. Please try logging in again.");
      }

      const res = await fetch("/api/vault/deposit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ vaultAddress, amount }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to deposit");
      }

      console.log("[Yield] Gasless deposit success:", data.txHash);
      setTxHash(data.txHash);

      // Refresh balance after successful deposit
      await refetchBalance();
      onSuccess();
    } catch (err: any) {
      console.error("[Yield] Deposit error:", err);

      let errorMessage = err.message || "Failed to deposit. Please try again.";

      if (errorMessage.includes("Agent not registered")) {
        errorMessage = "Please register your agent first to enable gasless deposits.";
      } else if (errorMessage.includes("Session key expired")) {
        errorMessage = "Your session has expired. Please re-register your agent.";
      } else if (errorMessage.includes("Vault not approved")) {
        errorMessage = "This vault is not approved. Please re-register your agent with updated vault permissions.";
      }

      setError(errorMessage);
      setIsLoading(false);
      setTxHash(null);
    }
  };

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
      {txHash && (
        <div className="mb-4 rounded-lg bg-blue-50 p-3 text-xs text-blue-600">
          <p className="font-medium">Deposit confirmed</p>
          <p className="mt-1 break-all font-mono">
            Tx: {txHash.slice(0, 10)}...{txHash.slice(-8)}
          </p>
          <a
            href={`https://basescan.org/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-blue-700 underline hover:text-blue-900"
          >
            View on Basescan
          </a>
        </div>
      )}

      {/* Deposit Button */}
      <PrimaryButton onClick={handleDeposit} disabled={!isAmountValid || isLoading}>
        {isLoading
          ? "Processing deposit..."
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
