import React from "react";
import { useQuery } from "@tanstack/react-query";
import { shortenAddress } from "@/utils/shortenAddress";

interface RecipientRow {
  recipientAddress: string;
  recipientLabel: string | null;
  createdAt: string;
}

interface RecentRecipientsProps {
  address?: string;
  onPick: (recipient: { address: string; label: string | null }) => void;
}

export function RecentRecipients({ address, onPick }: RecentRecipientsProps) {
  const { data } = useQuery({
    queryKey: ["transfer-history", "recent", address],
    queryFn: async (): Promise<RecipientRow[]> => {
      if (!address) return [];
      const res = await fetch(
        `/api/transfer/history?address=${address}&limit=3&unique=recipient`
      );
      const body = await res.json();
      return body?.history ?? [];
    },
    enabled: !!address,
    staleTime: 60 * 1000,
  });

  const rows = data ?? [];
  if (rows.length === 0) return null;

  return (
    <div className="mb-3 w-full">
      <div className="mb-2 text-xs font-medium text-gray-500">Recent</div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {rows.map((row) => {
          const label = row.recipientLabel || shortenAddress(row.recipientAddress);
          const initial = (row.recipientLabel || row.recipientAddress).slice(0, 2).toUpperCase();
          return (
            <button
              key={row.recipientAddress}
              type="button"
              onClick={() =>
                onPick({ address: row.recipientAddress, label: row.recipientLabel })
              }
              className="flex min-w-[72px] shrink-0 flex-col items-center rounded-xl border border-gray-200 px-3 py-2 hover:border-gray-300"
            >
              <div className="mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700">
                {initial}
              </div>
              <div className="max-w-[80px] truncate text-xs text-gray-700">{label}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
