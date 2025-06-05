import { useWallet } from "@crossmint/client-sdk-react-ui";
import { useQuery } from "@tanstack/react-query";

export function useActivityFeed(walletAddress: string) {
  const { wallet } = useWallet();
  return useQuery({
    queryKey: ["walletActivity", walletAddress],
    queryFn: async () => await wallet?.experimental_activity(),
    initialData: { events: [] },
    enabled: false, // TODO: remove once activity api is live!
  });
}
