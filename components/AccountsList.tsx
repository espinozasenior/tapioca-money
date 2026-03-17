import { useWallet } from "@/hooks/useWallet";
import { useYields, useYieldPositions, YieldOpportunity } from "@/hooks/useOptimizer";
import { AccountCard } from "./AccountCard";

interface AccountsListProps {
  onDepositToVault: (vault: YieldOpportunity) => void;
}

export function AccountsList({ onDepositToVault }: AccountsListProps) {
  const { wallet } = useWallet();
  const { yields } = useYields();
  const { positions } = useYieldPositions(wallet?.address);

  // Find best USDC yield opportunity, preferring YO protocol
  const usdcYields = yields.filter((y) => y.asset === "USDC");
  const bestUsdcYield =
    usdcYields.find((y) => y.protocol === "yo") ??
    usdcYields.sort((a, b) => b.apy - a.apy)[0] ??
    null;

  // Find user's position in the matched vault
  const matchedPosition = bestUsdcYield
    ? positions.find((p) => p.yieldId === bestUsdcYield.id)
    : null;

  // Compute display values — only show vault position, not wallet balance
  // Use `amount` (human-readable, decimal-adjusted) not `assets` (raw on-chain value)
  const positionUsdc = matchedPosition ? parseFloat(matchedPosition.amount) : 0;
  const balanceUsd = positionUsdc > 0 ? `$${positionUsdc.toFixed(2)}` : "$0.00";
  const balanceToken = positionUsdc > 0 ? positionUsdc.toFixed(2) : "0";
  const apy = bestUsdcYield?.apy ?? 0;

  return (
    <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
      <AccountCard
        name="USD Coin"
        ticker="USDC"
        icon="/usdc.svg"
        iconBg="bg-blue-100"
        balanceUsd={balanceUsd}
        balanceToken={balanceToken}
        apy={apy}
        onDeposit={() => bestUsdcYield && onDepositToVault(bestUsdcYield)}
      />
    </div>
  );
}
