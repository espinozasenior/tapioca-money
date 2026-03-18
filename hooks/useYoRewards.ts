"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import type { YoClaimableRewards } from "@/lib/yo/types";

export function useClaimableRewards(userAddress?: string) {
  return useQuery<YoClaimableRewards | null>({
    queryKey: ["yo-rewards", userAddress],
    queryFn: async () => {
      if (!userAddress) return null;
      const res = await fetch(`/api/yo/rewards?address=${userAddress}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.rewards ?? null;
    },
    enabled: !!userAddress,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useClaimRewards() {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (address: string) => {
      const token = await getAccessToken();
      const res = await fetch("/api/yo/rewards/claim", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to claim rewards");
      }
      return res.json();
    },
    onSuccess: (_, address) => {
      queryClient.invalidateQueries({ queryKey: ["yo-rewards", address] });
      queryClient.invalidateQueries({ queryKey: ["optimizer"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
    },
  });
}
