import React from "react";
import { Details } from "./Details";

interface OrderPreviewProps {
  userEmail: string;
  recipient: string;
  amount: string;
  error: string | null;
  txnHash: string | null;
  isLoading: boolean;
  onBack: () => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function OrderPreview({
  userEmail,
  recipient,
  amount,
  error,
  txnHash,
  isLoading,
  onBack,
  onConfirm,
  onClose,
}: OrderPreviewProps) {
  return (
    <div className="w-full flex justify-between flex-grow flex-col">
      <div>
        <div className="text-lg font-semibold mb-6 mt-2 text-center">
          Order Confirmation
        </div>
        <div className="uppercase text-sm font-semibold text-[#020617]">
          Details
        </div>
        <Details
          values={[
            { label: "From", value: userEmail },
            { label: "To", value: recipient },
          ]}
        />
        <Details values={[{ label: "Amount", value: `$ ${amount}` }]} />
        {error && (
          <div className="text-red-500 text-center mb-2">{error}</div>
        )}
        {txnHash && (
          <a
            href={txnHash}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-blue-600 underline mt-2 mb-2"
          >
            View on Explorer
          </a>
        )}
      </div>
      <div>
        <button
          className={`w-full font-semibold rounded-full py-3 text-lg mt-2 transition ${
            isLoading
              ? "bg-gray-200 text-gray-500 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
          type="button"
          onClick={txnHash ? onClose : onConfirm}
          disabled={isLoading}
        >
          {isLoading ? "Sending..." : txnHash ? "Done" : "Confirm"}
        </button>
      </div>
    </div>
  );
} 