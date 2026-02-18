import React, { useState } from "react";
import Image from "next/image";
import { Info } from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import {
  YieldOpportunity,
  YieldPosition,
  useVaultExit,
  getProtocolInfo,
} from "@/hooks/useOptimizer";

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

export function PositionsList({ positions, yields, isLoading, onExitSuccess }: PositionsListProps) {
  const { wallet, isReady } = useWallet();
  const [exitingId, setExitingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const vaultExit = useVaultExit();

  // Find the yield opportunity for a position to get APY
  const getYieldForPosition = (yieldId: string) => {
    return yields.find((y) => y.id === yieldId);
  };

  const handleExit = async (position: YieldPosition) => {
    if (!wallet?.address) {
      setError("No wallet connected");
      return;
    }

    setError(null);
    setExitingId(position.id);

    try {
      await vaultExit.mutateAsync({
        vaultAddress: position.vaultAddress,
        shares: position.shares.toString(),
      });
      onExitSuccess();
    } catch (err: any) {
      console.error("[Yield] Exit error:", err);
      setError(err.message || "Failed to exit position");
    } finally {
      setExitingId(null);
    }
  };

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
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}

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
        const apy = yieldOpp?.rewardRate?.total ?? position.apy;
        const isExiting = exitingId === position.id;
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
                <p className="text-sm text-green-600">+${rewards.totalEarned} earned</p>
                {rewards.daysActive !== undefined && (
                  <p className="text-xs text-gray-400">
                    Active for {rewards.daysActive} {rewards.daysActive === 1 ? "day" : "days"}
                  </p>
                )}
              </div>
            )}

            {/* Vault description */}
            {vaultDescription && <p className="mt-2 text-xs text-gray-400">{vaultDescription}</p>}

            {/* Exit button */}
            <button
              onClick={() => handleExit(position)}
              disabled={isExiting}
              className="mt-4 w-full rounded-xl border border-gray-200 py-3 text-center text-sm font-medium text-gray-900 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isExiting ? "Exiting..." : "Exit position"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
