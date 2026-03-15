import React, { useMemo, useState } from "react";
import Image from "next/image";
import { AlertCircle, CheckCircle2, Info, Loader2 } from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { useWalletSelection } from "@/hooks/useWalletSelection";
import {
  YieldOpportunity,
  YieldPosition,
  usePendingRedeems,
  useVaultExit,
  getProtocolInfo,
} from "@/hooks/useOptimizer";
import { formatUserError } from "@/lib/yo/error-messages";

interface PositionsListProps {
  positions: YieldPosition[];
  yields: YieldOpportunity[];
  isLoading: boolean;
  onExitSuccess: () => void;
}

// Format USD amount for display
const formatUsdAmount = (amountUsd: string | undefined, amount: string | undefined) => {
  // Prefer amountUsd if available, otherwise use amount
  if (amountUsd) {
    const num = Number(amountUsd);
    if (!isNaN(num)) {
      return num.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
  }
  if (amount) {
    const num = Number(amount);
    if (!isNaN(num)) {
      return num.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
  }
  return "0.00";
};

// Format APY for display
const formatApy = (apy: number) => {
  return `${(apy * 100).toFixed(2)}%`;
};

// Format earned amount — show 4 decimals for sub-cent amounts, 2 otherwise
export const formatEarned = (earned: string): string => {
  const num = parseFloat(earned);
  if (isNaN(num) || num === 0) return "0.00";
  if (num < 0.01) return num.toFixed(4);
  return num.toFixed(2);
};

type ExitState = "idle" | "confirming" | "loading" | "success" | "failed";

interface PositionExitState {
  state: ExitState;
  percentage: 25 | 50 | 75 | 100;
  error: string | null;
  redeemStatus: "instant" | "queued" | null;
}

const DEFAULT_EXIT_STATE: PositionExitState = {
  state: "idle",
  percentage: 100,
  error: null,
  redeemStatus: null,
};

export function PositionsList({ positions, yields, isLoading, onExitSuccess }: PositionsListProps) {
  const { wallet, isReady } = useWallet();
  const { agentAddress } = useWalletSelection();
  const [positionStates, setPositionStates] = useState<Record<string, PositionExitState>>({});
  const vaultExit = useVaultExit();
  const pendingQueryAddress = (agentAddress ?? wallet?.address) as `0x${string}` | undefined;
  const pendingRedeems = usePendingRedeems(pendingQueryAddress);

  // Find the yield opportunity for a position to get APY
  const getYieldForPosition = (yieldId: string) => {
    return yields.find((y) => y.id === yieldId);
  };

  const getPositionState = (positionId: string): PositionExitState => {
    return positionStates[positionId] || DEFAULT_EXIT_STATE;
  };

  const setPositionState = (positionId: string, state: PositionExitState) => {
    setPositionStates((prev) => ({ ...prev, [positionId]: state }));
  };

  const handleExit = async (position: YieldPosition) => {
    if (!wallet?.address) {
      setPositionState(position.id, {
        ...getPositionState(position.id),
        state: "failed",
        error: "No wallet connected",
      });
      return;
    }

    const currentState = getPositionState(position.id);
    const totalShares = BigInt(position.shares);
    const sharesToRedeem = (totalShares * BigInt(currentState.percentage)) / 100n;

    if (sharesToRedeem <= 0n) {
      setPositionState(position.id, {
        ...currentState,
        state: "failed",
        error: "Withdrawal amount is too small.",
      });
      return;
    }

    setPositionState(position.id, {
      ...currentState,
      state: "loading",
      error: null,
      redeemStatus: null,
    });

    try {
      const response = await vaultExit.mutateAsync({
        vaultAddress: position.vaultAddress,
        shares: sharesToRedeem.toString(),
        protocol: position.protocol,
      });

      setPositionState(position.id, {
        ...currentState,
        state: "success",
        error: null,
        redeemStatus: response.redeemStatus || "instant",
      });
      onExitSuccess();
    } catch (err: any) {
      console.error("[Yield] Exit error:", err);
      setPositionState(position.id, {
        ...currentState,
        state: "failed",
        error: formatUserError(err),
        redeemStatus: null,
      });
    }
  };

  const pendingVaults = useMemo(() => {
    const set = new Set<string>();
    for (const entry of pendingRedeems.data?.pendingRedeems || []) {
      const hasPendingAssets = BigInt(entry.pendingAssets) > 0n;
      const hasPendingShares = BigInt(entry.pendingShares) > 0n;
      if (hasPendingAssets || hasPendingShares) {
        set.add(entry.vaultAddress.toLowerCase());
      }
    }
    return set;
  }, [pendingRedeems.data?.pendingRedeems]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <div className="border-t-primary mb-3 h-8 w-8 animate-spin rounded-full border-4 border-gray-200" />
        <p className="text-sm text-gray-500">Loading your positions...</p>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="mb-3 rounded-full bg-gray-100 p-3">
          <svg
            className="h-6 w-6 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <p className="text-gray-600">No active yield positions</p>
        <p className="mt-1 text-sm text-gray-400">
          Deposit USDC into a yield opportunity to start earning
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Testnet disclaimer */}
      <div className="rounded-xl bg-blue-50 p-4">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-500" />
          <p className="text-xs text-blue-700">
            <strong>Demo Mode:</strong> This wallet uses testnet tokens to interact with mainnet
            yield protocols. Testnet deposits won&apos;t actually earn yield — this is for
            demonstration purposes only.
          </p>
        </div>
      </div>

      {positions.map((position) => {
        const yieldOpp = getYieldForPosition(position.yieldId);
        const apy = position.apy;
        const positionState = getPositionState(position.id);
        const isPendingWithdrawal = pendingVaults.has(position.vaultAddress.toLowerCase());
        const displayAmount = formatUsdAmount(position.amountUsd, position.amount);
        const protocolInfo = getProtocolInfo(position.protocol);
        const vaultName = position.vaultName ?? yieldOpp?.metadata?.name ?? protocolInfo.name;
        const vaultDescription = position.vaultDescription ?? yieldOpp?.metadata?.description;
        const rewards = position.rewards;

        // Calculate estimated yearly earnings
        const estimatedYearlyEarnings = apy
          ? (Number(position.amountUsd || position.amount || 0) * apy).toFixed(2)
          : null;

        return (
          <div key={position.id} className="rounded-xl border border-gray-200 bg-white p-4">
            {/* Main content row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Image src={"/usdc.svg"} alt={vaultName} width={40} height={40} unoptimized />

                {/* Position info */}
                <div>
                  <p className="font-semibold text-gray-900">${displayAmount} USDC</p>
                  <p className="text-sm text-gray-700">{vaultName}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                      style={{ backgroundColor: protocolInfo.color }}
                    >
                      {protocolInfo.name}
                    </span>
                    {isPendingWithdrawal && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Pending Withdrawal
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Earnings & APY */}
              <div className="text-right">
                {apy !== undefined && apy > 0 && (
                  <p className="font-semibold text-green-500">{formatApy(apy)} APY</p>
                )}
                {estimatedYearlyEarnings && (
                  <p className="text-sm text-gray-400">+${estimatedYearlyEarnings}/year</p>
                )}
              </div>
            </div>

            {/* Rewards & activity info */}
            {rewards && (
              <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                <p className="text-sm text-green-600">
                  +${formatEarned(rewards.totalEarned)} earned
                </p>
                {rewards.daysActive !== undefined && (
                  <p className="text-xs text-gray-400">
                    Active for {rewards.daysActive} {rewards.daysActive === 1 ? "day" : "days"}
                  </p>
                )}
              </div>
            )}

            {/* Vault description */}
            {vaultDescription && <p className="mt-2 text-xs text-gray-400">{vaultDescription}</p>}

            {positionState.state === "confirming" && (
              <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
                <p className="text-sm font-medium text-gray-900">Select withdrawal amount</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[25, 50, 75, 100].map((percent) => (
                    <button
                      key={percent}
                      onClick={() =>
                        setPositionState(position.id, {
                          ...positionState,
                          percentage: percent as 25 | 50 | 75 | 100,
                        })
                      }
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        positionState.percentage === percent
                          ? "border-primary text-primary bg-primary/10"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {percent}%
                    </button>
                  ))}
                </div>
                <div className="mt-3 space-y-1 text-xs text-gray-600">
                  <p>
                    Principal: $
                    {(
                      Number(position.amountUsd || position.amount || "0") *
                      (positionState.percentage / 100)
                    ).toFixed(2)}
                  </p>
                  <p>
                    Estimated yield: $
                    {(
                      Number(rewards?.totalEarned || "0") *
                      (positionState.percentage / 100)
                    ).toFixed(2)}
                  </p>
                </div>
              </div>
            )}

            {positionState.state === "loading" && (
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing withdrawal...
              </div>
            )}

            {positionState.state === "success" && (
              <div
                className={`mt-4 flex items-center gap-2 rounded-lg p-3 text-sm ${
                  positionState.redeemStatus === "queued"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-green-50 text-green-700"
                }`}
              >
                <CheckCircle2 className="h-4 w-4" />
                {positionState.redeemStatus === "queued"
                  ? "Withdrawal Queued"
                  : "Withdrawal Confirmed"}
              </div>
            )}

            {positionState.state === "failed" && positionState.error && (
              <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <p>{positionState.error}</p>
                </div>
              </div>
            )}

            {/* Exit button */}
            <button
              onClick={() => {
                if (positionState.state === "idle") {
                  setPositionState(position.id, {
                    ...positionState,
                    state: "confirming",
                    error: null,
                  });
                  return;
                }

                if (positionState.state === "confirming") {
                  void handleExit(position);
                  return;
                }

                if (positionState.state === "failed") {
                  setPositionState(position.id, {
                    ...positionState,
                    state: "confirming",
                    error: null,
                  });
                }
              }}
              disabled={positionState.state === "loading" || positionState.state === "success"}
              className="mt-4 w-full rounded-xl border border-gray-200 py-3 text-center text-sm font-medium text-gray-900 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {positionState.state === "idle" && "Exit position"}
              {positionState.state === "confirming" &&
                `Confirm withdrawal (${positionState.percentage}%)`}
              {positionState.state === "loading" && "Processing withdrawal..."}
              {positionState.state === "success" &&
                (positionState.redeemStatus === "queued"
                  ? "Withdrawal Queued"
                  : "Withdrawal Confirmed")}
              {positionState.state === "failed" && "Try Again"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
