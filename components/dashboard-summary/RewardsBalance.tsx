import { useYieldPositions } from "../../hooks/useOptimizer";
import { useWallet } from "@/hooks/useWallet";

export function RewardsBalance() {
  const { wallet } = useWallet();
  const { positions, isLoading } = useYieldPositions(wallet?.address);

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
    <div className="flex w-full flex-col items-start md:w-auto">
      <span className="text-muted-foreground text-sm">Rewards Earned</span>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold text-blue-600">
          ${totalRewards.toFixed(2)}
        </span>
        <span className="text-sm text-gray-500">
          across {positionCount} {positionCount === 1 ? "vault" : "vaults"}
        </span>
      </div>
    </div>
  );
}
