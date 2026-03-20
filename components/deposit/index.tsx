import React, { useState, useCallback } from "react";
import { useAuth } from "@/hooks/useWallet";
import { AmountInput } from "../common/AmountInput";
import { Dialog, DialogContent, DialogTitle, DialogClose } from "../common/Dialog";
import { useActivityFeed } from "../../hooks/useActivityFeed";
import { useBalance } from "@/hooks/useBalance";

interface DepositModalProps {
  open: boolean;
  onClose: () => void;
  walletAddress: string;
}

const MIN_AMOUNT = 1; // Min amount in USD
const MAX_AMOUNT = 50; // Max amount in USD allowed in staging

export function DepositModal({ open, onClose, walletAddress }: DepositModalProps) {
  const [step, setStep] = useState<"options" | "processing" | "completed">("options");
  const { user } = useAuth();
  const receiptEmail = user?.email;
  const [amount, setAmount] = useState("");
  const { refetch: refetchActivityFeed } = useActivityFeed();
  const { refetch: refetchBalance } = useBalance();

  const restartFlow = () => {
    setStep("options");
    setAmount("");
  };

  const handleDone = () => {
    restartFlow();
    onClose();
  };

  const handlePaymentCompleted = useCallback(() => {
    refetchActivityFeed();
    refetchBalance();
    handleDone();
  }, [refetchActivityFeed]);

  const showCloseButton = step === "options";

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="flex flex-col overflow-y-auto rounded-3xl bg-white sm:max-w-md">
        {showCloseButton && <DialogClose />}
        <DialogTitle className="text-center">Deposit</DialogTitle>
        {step === "options" && (
          <div className="mb-6 flex w-full flex-col items-center">
            <AmountInput amount={amount} onChange={setAmount} />
            {Number(amount) > 0 && Number(amount) < MIN_AMOUNT && (
              <div className="mt-1 text-center text-red-600">
                Minimum deposit amount is ${MIN_AMOUNT}
              </div>
            )}
            {Number(amount) > MAX_AMOUNT && (
              <div className="mt-1 text-center text-red-600">
                Transaction amount exceeds the maximum allowed deposit limit of ${MAX_AMOUNT}
              </div>
            )}
          </div>
        )}
        <div className="flex w-full flex-grow flex-col items-center justify-center py-8 text-center">
          <div className="mb-3 rounded-full bg-gray-100 p-3">
            <svg
              className="h-6 w-6 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <p className="text-gray-600">Fiat on-ramp coming soon</p>
          <p className="mt-1 text-sm text-gray-400">
            Deposit USDC directly from your bank account or card
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
