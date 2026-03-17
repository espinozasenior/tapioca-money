import { useWallet } from "./useWallet";
import { useWalletSelection } from "./useWalletSelection";
import { useQuery } from "@tanstack/react-query";
import { YieldPosition, useYieldPositions } from "./useOptimizer";

// Unified activity event type
export interface ActivityEvent {
  from_address: string;
  to_address?: string;
  timestamp: number;
  type: string;
  amount: string;
  token_symbol?: string;
}

// Transform yield position to activity event format
function yieldPositionToActivityEvent(position: YieldPosition): ActivityEvent {
  return {
    from_address: position.vaultAddress,
    timestamp: position.enteredAt,
    type: "yield-enter",
    amount: position.amountUsd || position.amount || "0",
    token_symbol: "USDC",
  };
}

export function useActivityFeed() {
  const { wallet } = useWallet();
  const { agentAddress } = useWalletSelection();

  // Fetch wallet activity
  const walletActivityQuery = useQuery({
    queryKey: ["walletActivity", wallet?.address],
    queryFn: async () => await wallet?.experimental_activity(),
    enabled: !!wallet?.address,
  });

  // Fetch yield positions - uses agentAddress (smart wallet for 4337, EOA for 7702)
  const { positions, isLoading: positionsLoading } = useYieldPositions(
    agentAddress ?? wallet?.address
  );

  // Combine and sort events
  const combinedEvents = (() => {
    // experimental_activity returns { transactions: [] }, map to events
    const walletEvents: ActivityEvent[] = (walletActivityQuery.data as any)?.events || [];

    // Transform yield positions to activity events
    const yieldEvents: ActivityEvent[] = positions.map(yieldPositionToActivityEvent);

    // Combine and sort by timestamp (most recent first)
    const allEvents = [...walletEvents, ...yieldEvents].sort((a, b) => b.timestamp - a.timestamp);

    return allEvents;
  })();

  return {
    data: { events: combinedEvents },
    isLoading: walletActivityQuery.isLoading || positionsLoading,
    error: walletActivityQuery.error,
    refetch: async () => {
      await walletActivityQuery.refetch();
    },
  };
}
