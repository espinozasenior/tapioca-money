import React from "react";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { PrimaryButton } from "../common/PrimaryButton";
import { shortenAddress } from "@/utils/shortenAddress";

interface TxSuccessProps {
  amount: string;
  recipientAddress: string;
  recipientLabel?: string | null;
  txHash: string;
  feePaid?: string;
  onDone: () => void;
}

export function TxSuccess({
  amount,
  recipientAddress,
  recipientLabel,
  txHash,
  feePaid,
  onDone,
}: TxSuccessProps) {
  const displayFee = feePaid && Number(feePaid) > 0 ? `$${Number(feePaid).toFixed(4)}` : "—";
  const explorerUrl = `https://basescan.org/tx/${txHash}`;

  return (
    <div className="flex flex-1 flex-col items-center justify-between px-4 pb-4 pt-8 text-center">
      <div className="flex flex-col items-center">
        <CheckCircle2 className="mb-3 h-12 w-12 text-green-500" />
        <h3 className="mb-2 text-xl font-semibold text-gray-900">Sent!</h3>
        <p className="text-sm text-gray-600">
          ${Number(amount).toFixed(2)} USDC to{" "}
          <span className="font-medium text-gray-900">
            {recipientLabel || shortenAddress(recipientAddress)}
          </span>
        </p>

        <dl className="mt-6 w-full max-w-xs space-y-2 rounded-xl border border-gray-200 p-4 text-left text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">Network fee</dt>
            <dd className="font-medium text-gray-900">{displayFee} USDC</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Transaction</dt>
            <dd>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary inline-flex items-center gap-1 font-medium hover:underline"
              >
                {shortenAddress(txHash)}
                <ExternalLink className="h-3 w-3" />
              </a>
            </dd>
          </div>
        </dl>
      </div>

      <div className="w-full pt-6">
        <PrimaryButton onClick={onDone}>Done</PrimaryButton>
      </div>
    </div>
  );
}
