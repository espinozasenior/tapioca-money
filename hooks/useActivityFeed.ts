import { useQuery } from "@tanstack/react-query";

export interface ActivityEvent {
  token_symbol: string;
  transaction_hash: string;
  to_address: string;
  from_address: string;
  timestamp: number; // Unix ms
  amount: string;
  type: string;
}

async function fetchWalletActivity(walletLocator: string): Promise<ActivityEvent[]> {
  const res = await fetch(
    `https://staging.crossmint.com/api/2022-06-09/wallets/${walletLocator}/activity?chain=base-sepolia`,
    {
      headers: {
        "X-API-Key": process.env.NEXT_PUBLIC_CROSSMINT_SERVER_API_KEY!,
        accept: "application/json",
      },
    }
  );
  if (!res.ok) throw new Error("Failed to fetch wallet activity");
  const data = await res.json();
  return data.events || [];
}

export function useActivityFeed(walletAddress: string) {
  return useQuery({
    queryKey: ["walletActivity", walletAddress],
    queryFn: () => fetchWalletActivity(walletAddress),
    enabled: !!walletAddress,
  });
}
