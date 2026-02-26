import React, { useReducer, useCallback } from "react";
import { useWallet } from "@/hooks/useWallet";
import { usePrivy } from "@privy-io/react-auth";
import { AmountInput } from "../common/AmountInput";
import { PrimaryButton } from "../common/PrimaryButton";
import { useBalance } from "@/hooks/useBalance";
import { YieldOpportunity, useAgent } from "@/hooks/useOptimizer";
import { cn } from "@/lib/utils";
import { VaultSafetyDetails } from "./VaultSafetyDetails";
import { AlertTriangle } from "lucide-react";

interface DepositYieldProps {
  yieldOpportunity: YieldOpportunity;
  onSuccess: () => void;
  onProcessing: () => void;
}

// Format APY for display
const formatApy = (apy: number) => {
  return `${(apy * 100).toFixed(2)}%`;
};

interface DepositState {
  amount: string;
  error: string | null;
  isVaultNotApproved: boolean;
  isLoading: boolean;
  txHash: string | null;
}

type DepositAction =
  | { type: "SET_AMOUNT"; value: string }
  | { type: "START_DEPOSIT" }
  | { type: "DEPOSIT_SUCCESS"; txHash: string }
  | { type: "DEPOSIT_ERROR"; error: string; isVaultNotApproved?: boolean }
  | { type: "SET_ERROR"; error: string | null };

const initialState: DepositState = {
  amount: "",
  error: null,
  isVaultNotApproved: false,
  isLoading: false,
  txHash: null,
};

function depositReducer(state: DepositState, action: DepositAction): DepositState {
  switch (action.type) {
    case "SET_AMOUNT":
      return { ...state, amount: action.value };
    case "START_DEPOSIT":
      return { ...state, error: null, isVaultNotApproved: false, isLoading: true, txHash: null };
    case "DEPOSIT_SUCCESS":
      return { ...state, txHash: action.txHash };
    case "DEPOSIT_ERROR":
      return {
        ...state,
        error: action.error,
        isVaultNotApproved: action.isVaultNotApproved ?? false,
        isLoading: false,
        txHash: null,
      };
    case "SET_ERROR":
      return { ...state, error: action.error };
  }
}

export function DepositYield({ yieldOpportunity, onSuccess, onProcessing }: DepositYieldProps) {
  const { wallet, isSolanaWallet } = useWallet();
  const { getAccessToken } = usePrivy();
  const { displayableBalance, refetch: refetchBalance } = useBalance();
  const {
    isRegistered,
    hasAuthorization,
    isLoading: isAgentLoading,
    register,
    isRegistering,
  } = useAgent();
  const [state, dispatch] = useReducer(depositReducer, initialState);

  const isAmountValid =
    !!state.amount &&
    !Number.isNaN(Number(state.amount)) &&
    Number(state.amount) > 0 &&
    Number(state.amount) <= Number(displayableBalance);

  // Calculate estimated yearly earnings
  const estimatedYearlyEarnings = isAmountValid
    ? (Number(state.amount) * yieldOpportunity.apy).toFixed(2)
    : "0.00";

  const handleDeposit = useCallback(async () => {
    if (!wallet?.address) {
      dispatch({ type: "SET_ERROR", error: "No wallet connected" });
      return;
    }

    if (!isAmountValid) {
      dispatch({ type: "SET_ERROR", error: "Invalid amount" });
      return;
    }

    const vaultAddress = yieldOpportunity.metadata?.vaultAddress as string | undefined;
    if (!vaultAddress) {
      dispatch({ type: "SET_ERROR", error: "Vault address not available for this opportunity" });
      return;
    }

    dispatch({ type: "START_DEPOSIT" });
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
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ vaultAddress, amount: state.amount, protocol: yieldOpportunity.protocol }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to deposit");
      }

      console.log("[Yield] Gasless deposit success:", data.txHash);
      dispatch({ type: "DEPOSIT_SUCCESS", txHash: data.txHash });

      // Refresh balance after successful deposit
      await refetchBalance();
      onSuccess();
    } catch (err: any) {
      console.error("[Yield] Deposit error:", err);

      let errorMessage = err.message || "Failed to deposit. Please try again.";
      let isVaultNotApproved = false;

      if (
        errorMessage.includes("Agent not registered") ||
        errorMessage.includes("User not found")
      ) {
        errorMessage = "Please register your agent first to enable gasless deposits.";
      } else if (errorMessage.includes("Session key expired")) {
        errorMessage = "Your session has expired. Please re-register your agent.";
      } else if (errorMessage.includes("Vault not approved")) {
        errorMessage =
          "This vault is not in your approved list. Re-register your agent to update permissions.";
        isVaultNotApproved = true;
      }

      dispatch({ type: "DEPOSIT_ERROR", error: errorMessage, isVaultNotApproved });
    }
  }, [
    wallet,
    isAmountValid,
    yieldOpportunity.metadata?.vaultAddress,
    yieldOpportunity.protocol,
    state.amount,
    getAccessToken,
    refetchBalance,
    onProcessing,
    onSuccess,
  ]);

  if (isSolanaWallet) {
    return (
      <div className="mt-4 flex w-full flex-col items-center">
        <div className="w-full rounded-xl bg-yellow-50 p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-yellow-500" />
          <p className="mb-2 text-lg font-semibold text-yellow-800">Requires an Ethereum Wallet</p>
          <p className="text-sm text-yellow-700">
            Vault deposits use EVM smart accounts and are only available with Ethereum wallets.
            Please switch to an EVM wallet to deposit.
          </p>
        </div>
      </div>
    );
  }

  if (isAgentLoading) {
    return (
      <div className="mt-4 flex w-full flex-col items-center justify-center py-12">
        <p className="text-sm text-gray-500">Checking agent status...</p>
      </div>
    );
  }

  if (!isRegistered || !hasAuthorization) {
    return (
      <div className="mt-4 flex w-full flex-col items-center">
        <div className="mb-6 w-full rounded-xl bg-yellow-50 p-6 text-center">
          <p className="mb-2 text-lg font-semibold text-yellow-800">Agent Registration Required</p>
          <p className="mb-4 text-sm text-yellow-700">
            {!isRegistered
              ? "You need to register your agent before making deposits. This enables gasless transactions on your behalf."
              : "Your agent session has expired. Please re-register to continue making deposits."}
          </p>
          <PrimaryButton onClick={() => register()} disabled={isRegistering}>
            {isRegistering ? "Registering..." : "Register Agent"}
          </PrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 flex w-full flex-col">
      {/* Yield Info Card */}
      <div className="from-primary/5 to-primary/10 mb-6 rounded-xl bg-gradient-to-br p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">Current APY</p>
            <p className="text-primary text-2xl font-bold">{formatApy(yieldOpportunity.apy)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Protocol</p>
            <p className="font-semibold text-gray-900">
              {yieldOpportunity.protocol.charAt(0).toUpperCase() +
                yieldOpportunity.protocol.slice(1)}
            </p>
          </div>
        </div>

        {yieldOpportunity.metadata.description && (
          <p className="mt-3 text-xs text-gray-500">{yieldOpportunity.metadata.description}</p>
        )}

        {/* Safety Information */}
        <div className="border-primary/10 mt-4 border-t pt-4">
          <VaultSafetyDetails vault={yieldOpportunity} />
        </div>
      </div>

      {/* Amount Input */}
      <div className="mb-4 flex w-full flex-col items-center">
        <AmountInput
          amount={state.amount}
          onChange={(v) => dispatch({ type: "SET_AMOUNT", value: v })}
        />
        <div
          className={cn(
            "mt-1 text-sm",
            Number(state.amount) > Number(displayableBalance) ? "text-red-600" : "text-gray-400"
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
              dispatch({ type: "SET_AMOUNT", value: newAmount });
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
      {state.error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          <p>{state.error}</p>
          {state.isVaultNotApproved && (
            <PrimaryButton
              onClick={() => register()}
              disabled={isRegistering}
              className="mt-3 w-full"
            >
              {isRegistering ? "Registering..." : "Re-Register Agent"}
            </PrimaryButton>
          )}
        </div>
      )}

      {/* Transaction Hash Display */}
      {state.txHash && (
        <div className="mb-4 rounded-lg bg-blue-50 p-3 text-xs text-blue-600">
          <p className="font-medium">Deposit confirmed</p>
          <p className="mt-1 break-all font-mono">
            Tx: {state.txHash.slice(0, 10)}...{state.txHash.slice(-8)}
          </p>
          <a
            href={`https://basescan.org/tx/${state.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-blue-700 underline hover:text-blue-900"
          >
            View on Basescan
          </a>
        </div>
      )}

      {/* Deposit Button */}
      <PrimaryButton onClick={handleDeposit} disabled={!isAmountValid || state.isLoading}>
        {state.isLoading ? "Processing deposit..." : `Deposit ${state.amount || "0"} USDC`}
      </PrimaryButton>

      {/* Risk Disclaimer */}
      <p className="mt-4 text-center text-xs text-gray-400">
        By depositing, you acknowledge that DeFi protocols carry smart contract risks. Only deposit
        what you can afford to lose.
      </p>
    </div>
  );
}
