import { useQuery } from "@tanstack/react-query";
import { getActivity } from "@/server-actions/getActivity";

export function useActivityFeed(walletAddress: string) {
  return useQuery({
    queryKey: ["walletActivity", walletAddress],
    queryFn: () => getActivity(walletAddress),
    enabled: !!walletAddress,
  });
}
