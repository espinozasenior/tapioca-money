import React, { useReducer, useCallback } from "react";
import { useWallet } from "@/hooks/useWallet";
import { usePrivy } from "@privy-io/react-auth";
import { useWalletSelection } from "@/hooks/useWalletSelection";
import { AmountInput } from "../common/AmountInput";

import { useBalance } from "@/hooks/useBalance";
import { YieldOpportunity, useAgent, useYieldPositions } from "@/hooks/useOptimizer";
import { cn } from "@/lib/utils";
import { VaultInfoCard } from "./VaultInfoCard";
import { AlertTriangle } from "lucide-react";
import { formatUserError } from "@/lib/yo/error-messages";

interface DepositYieldProps {
  yieldOpportunity: YieldOpportunity;
  onSuccess: () => void;
  onProcessing: () => void;
  onViewPositions?: () => void;
}

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

export function DepositYield({
  yieldOpportunity,
  onSuccess,
  onProcessing,
  onViewPositions,
}: DepositYieldProps) {
  const { wallet, isSolanaWallet } = useWallet();
  const { getAccessToken } = usePrivy();
  // Pass the vault's underlying token to useBalance for multi-asset support
  const underlyingToken = yieldOpportunity.underlying;
  const { displayableBalance, refetch: refetchBalance } = useBalance(
    underlyingToken
      ? {
          tokenAddress: underlyingToken.address as `0x${string}`,
          tokenDecimals: underlyingToken.decimals,
        }
      : undefined
  );
  const {
    isRegistered,
    hasAuthorization,
    isLoading: isAgentLoading,
    register,
    isRegistering,
  } = useAgent();
  const { activeWallet, supportsEip7702, agentAddress, supportsSmartAccount } =
    useWalletSelection();
  const { positions } = useYieldPositions(agentAddress ?? undefined);
  const isExternalWallet =
    activeWallet?.walletClientType !== "privy" && activeWallet?.chainType === "ethereum";
  // User can register if they have EVM wallet support (7702 or 4337 fallback)
  const canRegister = supportsSmartAccount;
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
        body: JSON.stringify({
          vaultAddress,
          amount: state.amount,
          protocol: yieldOpportunity.protocol,
        }),
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
      const rawError = err instanceof Error ? err.message : String(err);
      const errorMessage = formatUserError(err);
      const isVaultNotApproved = rawError.toLowerCase().includes("vault not approved");

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

  if (yieldOpportunity.paused) {
    const vaultAddr = yieldOpportunity.metadata?.vaultAddress ?? yieldOpportunity.address;
    const hasPosition = positions.some(
      (p) =>
        p.vaultAddress.toLowerCase() === vaultAddr?.toLowerCase() &&
        parseFloat(p.amountUsd || p.amount || "0") > 0
    );

    return (
      <div className="mt-4 flex w-full flex-col items-center">
        <div className="ios-shadow w-full rounded-[20px] border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-500" />
          <p className="mb-2 text-lg font-bold text-[var(--pearl)]">Vault Paused</p>
          <p className="text-[var(--pearl)]/50 text-sm font-medium">
            {hasPosition
              ? "This vault has been temporarily paused by the protocol. New deposits are not available, but you can withdraw your existing position."
              : "This vault has been temporarily paused by the protocol. Deposits are not available right now. Please check back later or choose a different vault."}
          </p>
          {hasPosition && onViewPositions && (
            <button
              onClick={onViewPositions}
              className="bg-primary hover:bg-primary-hover mt-4 rounded-full px-6 py-2.5 text-sm font-semibold text-white transition"
            >
              View Position & Withdraw
            </button>
          )}
        </div>
      </div>
    );
  }

  if (isSolanaWallet) {
    return (
      <div className="mt-4 flex w-full flex-col items-center">
        <div className="ios-shadow border-[var(--pearl)]/5 w-full rounded-[20px] border bg-white p-6 text-center">
          <AlertTriangle className="text-[var(--pearl)]/40 mx-auto mb-3 h-8 w-8" />
          <p className="mb-2 text-lg font-bold text-[var(--pearl)]">Requires an Ethereum Wallet</p>
          <p className="text-[var(--pearl)]/50 text-sm font-medium">
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
        <div className="border-[var(--pearl)]/10 h-8 w-8 animate-spin rounded-full border-4 border-t-[var(--matcha)]" />
        <p className="text-[var(--pearl)]/40 mt-3 text-xs font-bold">Checking agent status...</p>
      </div>
    );
  }

  if (!isRegistered || !hasAuthorization) {
    return (
      <div className="mt-4 flex w-full flex-col items-center">
        <div className="ios-shadow border-[var(--pearl)]/5 mb-6 w-full rounded-[20px] border bg-white p-6 text-center">
          <p className="mb-2 text-lg font-bold text-[var(--pearl)]">Agent Registration Required</p>
          <p className="text-[var(--pearl)]/50 mb-4 text-sm font-medium">
            {!isRegistered
              ? "You need to register your agent before making deposits. This enables gasless transactions on your behalf."
              : "Your agent session has expired. Please re-register to continue making deposits."}
          </p>
          {isExternalWallet && !canRegister && (
            <p className="text-[var(--pearl)]/50 mb-4 text-sm font-medium">
              Your wallet doesn&apos;t support agent registration yet. Please switch to your Privy
              embedded wallet or re-login.
            </p>
          )}
          {isExternalWallet && canRegister && !supportsEip7702 && (
            <p className="mb-4 text-sm font-medium text-[var(--matcha)]">
              Your agent will use a smart wallet. After registration, your agent address will be
              shown in the dashboard.
            </p>
          )}
          <button
            onClick={() => register()}
            disabled={isRegistering || !canRegister}
            className="mt-2 w-full rounded-full bg-[var(--pearl)] py-3 text-sm font-bold text-[var(--matcha)] transition-all hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isRegistering
              ? "Registering..."
              : !canRegister
                ? "Wallet Not Supported"
                : "Register Agent"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 flex w-full flex-col">
      {/* Yield Info Card — dark pearl card (matches Active Agent card) */}
      <VaultInfoCard yieldOpportunity={yieldOpportunity} />

      {/* Amount Input */}
      <div className="mb-4 flex w-full flex-col items-center">
        <AmountInput
          amount={state.amount}
          onChange={(v) => dispatch({ type: "SET_AMOUNT", value: v })}
        />
        <div
          className={cn(
            "mt-1 text-sm font-bold",
            Number(state.amount) > Number(displayableBalance)
              ? "text-red-500"
              : "text-[var(--pearl)]/40"
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
            className="border-[var(--pearl)]/10 text-[var(--pearl)]/60 hover:bg-[var(--matcha)]/10 rounded-full border px-4 py-1.5 text-xs font-bold transition-all hover:border-[var(--matcha)] hover:text-[var(--pearl)] active:scale-95"
          >
            {percent}%
          </button>
        ))}
      </div>

      {/* Estimated Earnings */}
      {isAmountValid && (
        <div className="ios-shadow border-[var(--pearl)]/5 mb-6 rounded-[20px] border bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-[var(--pearl)]/40 text-xs font-bold uppercase tracking-wider">
              Est. yearly earnings
            </span>
            <span className="font-black text-[var(--matcha)]">
              ${estimatedYearlyEarnings} {yieldOpportunity.asset}
            </span>
          </div>
          <p className="text-[var(--pearl)]/30 mt-1 text-[10px] font-medium">
            Based on current APY. Actual earnings may vary.
          </p>
        </div>
      )}

      {/* Error Display */}
      {state.error && (
        <div className="mb-4 rounded-[20px] border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          <p className="font-bold">{state.error}</p>
          {state.isVaultNotApproved && (
            <>
              {!canRegister && (
                <p className="mt-2 text-xs text-red-500">
                  Switch to your Privy embedded wallet or re-login to re-register.
                </p>
              )}
              <button
                onClick={() => register()}
                disabled={isRegistering || !canRegister}
                className="mt-3 w-full rounded-full bg-[var(--pearl)] py-3 text-sm font-bold text-[var(--matcha)] transition-transform hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isRegistering ? "Registering..." : "Re-Register Agent"}
              </button>
            </>
          )}
        </div>
      )}

      {/* Transaction Hash Display */}
      {state.txHash && (
        <div className="ios-shadow border-[var(--matcha)]/20 bg-[var(--matcha)]/10 mb-4 rounded-[20px] border p-4 text-xs">
          <p className="font-bold text-[var(--pearl)]">Deposit confirmed</p>
          <p className="text-[var(--pearl)]/60 mt-1 break-all font-mono">
            Tx: {state.txHash.slice(0, 10)}...{state.txHash.slice(-8)}
          </p>
          <a
            href={`https://basescan.org/tx/${state.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block font-bold text-[var(--pearl)] underline hover:text-[var(--matcha)]"
          >
            View on Basescan
          </a>
        </div>
      )}

      {/* Deposit Button — pearl pill with matcha text */}
      <button
        onClick={handleDeposit}
        disabled={!isAmountValid || state.isLoading}
        className="disabled:bg-[var(--pearl)]/20 disabled:text-[var(--pearl)]/30 mt-4 w-full rounded-full bg-[var(--pearl)] py-4 text-base font-bold text-[var(--matcha)] shadow-lg transition-all hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:shadow-none"
      >
        {state.isLoading
          ? "Processing deposit..."
          : `Deposit ${state.amount || "0"} ${yieldOpportunity.asset}`}
      </button>

      {/* Risk Disclaimer */}
      <p className="text-[var(--pearl)]/25 mt-4 text-center text-[10px] font-bold">
        By depositing, you acknowledge that DeFi protocols carry smart contract risks. Only deposit
        what you can afford to lose.
      </p>
    </div>
  );
}
