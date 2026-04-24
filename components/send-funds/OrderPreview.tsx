import React from "react";
import { Details } from "../common/Details";
import { PrimaryButton } from "../common/PrimaryButton";
import { shortenAddress } from "@/utils/shortenAddress";
import { FEE_DISPLAY_USDC } from "@/lib/config";

interface OrderPreviewProps {
  userEmail: string;
  /** Human-readable recipient label (ENS/Basename). Falls back to shortened address. */
  recipientLabel: string | null;
  recipientAddress: string;
  amount: string;
  error: string | null;
  isLoading: boolean;
  onConfirm: () => void;
}

export function OrderPreview({
  userEmail,
  recipientLabel,
  recipientAddress,
  amount,
  error,
  isLoading,
  onConfirm,
}: OrderPreviewProps) {
  const numericAmount = Number(amount || "0");
  const feeDisplay = Number(FEE_DISPLAY_USDC);
  const total = (numericAmount + feeDisplay).toFixed(2);
  const shortAddr = shortenAddress(recipientAddress);
  const recipientValue = recipientLabel ? `${recipientLabel} (${shortAddr})` : shortAddr;

  return (
    <div className="flex w-full flex-grow flex-col justify-between">
      <div>
        <div className="text-foreground mt-6 text-sm font-semibold uppercase">Details</div>
        <Details
          values={[
            { label: "From", value: userEmail },
            { label: "To", value: recipientValue },
            { label: "Amount", value: `$${numericAmount.toFixed(2)}` },
            {
              label: "Network fee",
              value: `~$${feeDisplay.toFixed(2)} USDC`,
            },
            { label: "Total", value: `$${total}` },
          ]}
        />
        <p className="text-muted-foreground mt-3 text-center text-xs">
          Network fees are paid in USDC and deducted at confirmation.
        </p>
        {error && <div className="mt-3 text-center text-sm text-red-500">{error}</div>}
      </div>
      <div>
        <PrimaryButton onClick={onConfirm} disabled={isLoading}>
          {isLoading ? "Sending..." : `Send $${numericAmount.toFixed(2)}`}
        </PrimaryButton>
      </div>
    </div>
  );
}
