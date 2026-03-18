"use client";

import { useState } from "react";
import { useClaimableRewards, useClaimRewards } from "@/hooks/useYoRewards";
import { useWallet } from "@/hooks/useWallet";
import { useWalletSelection } from "@/hooks/useWalletSelection";

export function MerklRewards() {
  const { wallet } = useWallet();
  const { agentAddress } = useWalletSelection();
  const userAddress = agentAddress ?? wallet?.address;
  const { data: rewards, isLoading } = useClaimableRewards(userAddress);
  const claimMutation = useClaimRewards();
  const [confirmStep, setConfirmStep] = useState(false);

  // Don't render if loading, no address, or no claimable rewards
  if (isLoading || !userAddress || !rewards?.hasClaimable) {
    return null;
  }

  const handleClick = () => {
    if (!confirmStep) {
      setConfirmStep(true);
      return;
    }

    claimMutation.mutate(userAddress, {
      onSettled: () => setConfirmStep(false),
    });
  };

  const handleCancel = () => {
    setConfirmStep(false);
  };

  return (
    <div className="flex w-full flex-col items-start gap-2 md:w-auto">
      <span className="text-muted-foreground text-sm">Claimable Rewards</span>
      <div className="flex items-center gap-3">
        <span className="text-2xl font-semibold text-purple-600">
          {parseFloat(rewards.totalClaimableFormatted).toFixed(2)} $YO
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleClick}
            disabled={claimMutation.isPending}
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
              confirmStep
                ? "bg-purple-600 text-white hover:bg-purple-700"
                : "bg-purple-100 text-purple-700 hover:bg-purple-200"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {claimMutation.isPending
              ? "Claiming..."
              : confirmStep
                ? "Confirm Claim"
                : "Claim Rewards"}
          </button>
          {confirmStep && !claimMutation.isPending && (
            <button
              onClick={handleCancel}
              className="rounded-md px-2 py-1 text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
      {claimMutation.isSuccess && (
        <span className="text-sm text-green-600">Rewards claimed successfully!</span>
      )}
      {claimMutation.isError && (
        <span className="text-sm text-red-600">
          {claimMutation.error?.message?.includes("re-register")
            ? "Re-register your agent to enable reward claiming."
            : claimMutation.error?.message || "Failed to claim rewards"}
        </span>
      )}
    </div>
  );
}
