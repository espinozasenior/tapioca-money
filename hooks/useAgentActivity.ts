import { useQuery } from "@tanstack/react-query";

interface AgentActivity {
  id: string;
  actionType: string;
  status: string;
  fromProtocol: string | null;
  toProtocol: string | null;
  amountUsdc: string | null;
  txHash: string | null;
  errorMessage: string | null;
  metadata: any;
  createdAt: string;
}

interface AgentStats {
  totalRebalances: number;
  successfulRebalances: number;
  failedRebalances: number;
  totalSaved: number;
}

interface AgentActivityResponse {
  activities: AgentActivity[];
  total: number;
  limit: number;
  offset: number;
  stats: AgentStats;
}

/**
 * Hook to fetch agent activity for a user
 * Refreshes every 30 seconds to show real-time updates
 */
export function useAgentActivity(
  address?: string,
  limit: number = 50,
  offset: number = 0
) {
  return useQuery<AgentActivityResponse>({
    queryKey: ['agent-activity', address, limit, offset],
    queryFn: async () => {
      if (!address) {
        throw new Error('Address is required');
      }

      const params = new URLSearchParams({
        address,
        limit: limit.toString(),
        offset: offset.toString(),
      });

      const res = await fetch(`/api/agent/activity?${params}`);

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to fetch activity');
      }

      return res.json();
    },
    enabled: !!address,
    refetchInterval: 30_000, // Refresh every 30 seconds
    staleTime: 20_000, // Consider data stale after 20 seconds
  });
}

/**
 * Hook to fetch agent gains for a user
 */
export function useAgentGains(
  address?: string,
  period: 'day' | 'week' | 'month' | 'year' | 'all' = 'all'
) {
  return useQuery({
    queryKey: ['agent-gains', address, period],
    queryFn: async () => {
      if (!address) {
        throw new Error('Address is required');
      }

      const params = new URLSearchParams({
        address,
        period,
      });

      const res = await fetch(`/api/agent/gains?${params}`);

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to fetch gains');
      }

      return res.json();
    },
    enabled: !!address,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
}
