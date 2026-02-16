import React, { useCallback, useState, lazy, Suspense } from "react";
import { useAuth } from "@/hooks/useWallet";
import { AmountInput } from "../common/AmountInput";
import { Dialog, DialogContent, DialogTitle, DialogClose } from "../common/Dialog";
import { useActivityFeed } from "../../hooks/useActivityFeed";
import { useBalance } from "@/hooks/useBalance";

const CrossmintWrapper = lazy(() => import("./CrossmintWrapper"));

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

  const handleProcessingPayment = useCallback(() => {
    setStep("processing");
  }, []);

  const showCloseButton = step === "options";

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="flex max-h-[85vh] min-h-[580px] flex-col overflow-y-auto rounded-3xl bg-white sm:max-w-md">
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
        <div className="flex w-full flex-grow flex-col">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-8">
                <div className="border-primary mx-auto h-8 w-8 animate-spin rounded-full border-b-2" />
              </div>
            }
          >
            <CrossmintWrapper
              amount={amount}
              isAmountValid={Number(amount) >= MIN_AMOUNT && Number(amount) <= MAX_AMOUNT}
              walletAddress={walletAddress}
              onPaymentCompleted={handlePaymentCompleted}
              receiptEmail={receiptEmail || ""}
              onProcessingPayment={handleProcessingPayment}
              step={step}
              goBack={restartFlow}
            />
          </Suspense>
        </div>
      </DialogContent>
    </Dialog>
  );
}
