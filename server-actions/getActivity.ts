"use server";

export interface ActivityEvent {
  token_symbol: string;
  transaction_hash: string;
  to_address: string;
  from_address: string;
  timestamp: number; // Unix ms
  amount: string;
  type: string;
}

export async function getActivity(walletLocator: string): Promise<ActivityEvent[]> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_CROSSMINT_URL}/api/2022-06-09/wallets/${walletLocator}/activity?chain=${process.env.NEXT_PUBLIC_CHAIN_ID}`,
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