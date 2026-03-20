import { useYieldPositions } from "../../hooks/useOptimizer";
import { useWalletSelection } from "@/hooks/useWalletSelection";
import { MerklRewards } from "./MerklRewards";

export function RewardsBalance() {
  const { agentAddress } = useWalletSelection();
  const { positions, isLoading } = useYieldPositions(agentAddress ?? undefined);

  // Calculate total rewards across all positions
  const totalRewards = positions.reduce((sum, position) => {
    if (position.rewards?.totalEarned) {
      return sum + parseFloat(position.rewards.totalEarned);
    }
    return sum;
  }, 0);

  const positionCount = positions.length;

  if (isLoading || positionCount === 0) {
    return null; // Don't show if loading or no positions
  }

  return (
    <div className="flex w-full flex-col gap-3 md:w-auto">
      <div className="flex flex-col items-start">
        <span className="text-muted-foreground text-sm">Rewards Earned</span>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold text-blue-600">${totalRewards.toFixed(2)}</span>
          <span className="text-sm text-gray-500">
            across {positionCount} {positionCount === 1 ? "vault" : "vaults"}
          </span>
        </div>
      </div>
      <MerklRewards />
    </div>
  );
}
