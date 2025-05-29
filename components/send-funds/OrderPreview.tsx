import React from "react";
import { Details } from "./Details";
import { PrimaryButton } from "../common/PrimaryButton";

interface OrderPreviewProps {
  userEmail: string;
  recipient: string;
  amount: string;
  error: string | null;
  isLoading: boolean;
  onConfirm: () => void;
}

export function OrderPreview({
  userEmail,
  recipient,
  amount,
  error,
  isLoading,
  onConfirm,
}: OrderPreviewProps) {
  return (
    <div className="flex w-full flex-grow flex-col justify-between">
      <div>
        <div className="mt-6 text-sm font-semibold uppercase text-[#020617]">Details</div>
        <Details
          values={[
            { label: "From", value: userEmail },
            { label: "To", value: recipient },
            { label: "Amount", value: `$ ${amount}` },
          ]}
        />
        {error && <div className="mb-2 text-center text-red-500">{error}</div>}
      </div>
      <div>
        <PrimaryButton onClick={onConfirm} disabled={isLoading}>
          {isLoading ? "Sending..." : `Send $ ${amount}`}
        </PrimaryButton>
      </div>
    </div>
  );
}
