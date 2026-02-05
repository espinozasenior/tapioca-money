import React, { useState, useEffect } from "react";
import { useAuth, useWallet } from "@/hooks/useWallet";
import { AmountInput } from "../common/AmountInput";
import { OrderPreview } from "./OrderPreview";
import { RecipientInput } from "./RecipientInput";
import { useBalance } from "@/hooks/useBalance";
import { Dialog, DialogContent, DialogTitle, DialogClose } from "../common/Dialog";
import { useActivityFeed } from "@/hooks/useActivityFeed";
import { isEmail, isValidAddress } from "@/lib/utils";
import { ArrowLeft, X, Zap } from "lucide-react";

interface SendFundsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SendFundsModal({ open, onClose }: SendFundsModalProps) {
  const { wallet } = useWallet();
  const { user } = useAuth();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useGasless, setUseGasless] = useState(false);
  const [gaslessEnabled, setGaslessEnabled] = useState(false);
  const [gaslessLoading, setGaslessLoading] = useState(false);
  const [sessionExpiry, setSessionExpiry] = useState<number | null>(null);
  const { displayableBalance, refetch: refetchBalance } = useBalance();
  const { refetch: refetchActivityFeed } = useActivityFeed();

  // Check gasless transfer session status
  useEffect(() => {
    async function checkGaslessStatus() {
      if (!wallet?.address || !open) return;

      try {
        const response = await fetch(`/api/transfer/register?address=${wallet.address}`);
        const status = await response.json();

        if (status.isEnabled) {
          setGaslessEnabled(true);
          setSessionExpiry(status.expiry);
          setUseGasless(true); // Auto-enable if available
        } else {
          setGaslessEnabled(false);
          setUseGasless(false);
        }
      } catch (error) {
        console.error('Failed to check gasless status:', error);
        setGaslessEnabled(false);
      }
    }

    checkGaslessStatus();
  }, [wallet, open]);

  // Debug logging
  console.log('[SendFunds] State:', {
    recipient,
    amount,
    displayableBalance,
    showPreview,
    isLoading,
    hasWallet: !!wallet,
  });

  const isRecipientValid = isValidAddress(recipient) || isEmail(recipient);
  const isAmountValid =
    !!amount &&
    !Number.isNaN(Number(amount)) &&
    Number(amount) > 0 &&
    Number(amount) <= Number(displayableBalance);
  const canContinue = isRecipientValid && isAmountValid;

  async function handleContinue() {
    setError(null);
    if (isEmail(recipient)) {
      if (!recipient) {
        setError("Please enter a recipient");
        return;
      }
      try {
        setIsLoading(true);
        setShowPreview(true);
      } catch (e: unknown) {
        setError((e as Error).message || String(e));
      } finally {
        setIsLoading(false);
      }
    } else {
      setShowPreview(true);
    }
  }

  async function handleSend() {
    setError(null);
    setIsLoading(true);
    try {
      if (!isRecipientValid || !amount || !isAmountValid) {
        setError("Invalid recipient or amount");
        setIsLoading(false);
        return;
      }

      if (!wallet) {
        setError("No wallet connected");
        setIsLoading(false);
        return;
      }

      // Email recipients not supported with Privy - only wallet addresses
      if (isEmail(recipient)) {
        setError("Email recipients not yet supported. Please use a wallet address.");
        setIsLoading(false);
        return;
      }

      // Use gasless or regular transaction based on toggle
      if (useGasless && gaslessEnabled) {
        console.log('[SendFunds] Sending gasless transaction');
        await wallet.sendSponsored(recipient, "USDC", amount);
      } else {
        console.log('[SendFunds] Sending regular transaction');
        await wallet.send(recipient, "usdc", amount);
      }

      refetchBalance();
      refetchActivityFeed();
      handleDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  const resetFlow = () => {
    setShowPreview(false);
    setAmount("");
    setRecipient("");
    setError(null);
  };

  const handleDone = () => {
    resetFlow();
    onClose();
  };

  const displayableAmount = Number(amount).toFixed(2);
  const showBackButton = showPreview && !isLoading;
  const showCloseButton = !showPreview;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleDone()}>
      <DialogContent className="flex h-[580px] max-h-[85vh] flex-col rounded-3xl bg-white sm:max-w-md">
        {showBackButton && (
          <button
            onClick={resetFlow}
            className="absolute left-6 top-6 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200"
            aria-label="Back"
            type="button"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        {showCloseButton && <DialogClose />}
        <DialogTitle className="text-center">
          {showPreview ? "Order Confirmation" : "Send"}
        </DialogTitle>
        {!showPreview ? (
          <div className="flex w-full flex-1 flex-col">
            <div className="mb-2 flex w-full flex-col items-center">
              <AmountInput amount={amount} onChange={setAmount} />
              <div
                className={
                  Number(amount) > Number(displayableBalance)
                    ? "text-sm text-red-600"
                    : "text-muted-foreground text-sm"
                }
              >
                Current balance: ${displayableBalance}
              </div>
            </div>
            <div className="mt-4 w-full">
              <RecipientInput recipient={recipient} onChange={setRecipient} error={error} />
            </div>
            <div className="mt-4 w-full">
              {gaslessEnabled ? (
                <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-yellow-500" />
                      <label className="text-sm font-medium text-gray-900">
                        Gasless Transaction
                      </label>
                    </div>
                    <p className="text-xs text-gray-500">
                      No ETH needed - ZeroDev sponsors gas fees
                    </p>
                    {sessionExpiry && (
                      <p className="text-xs text-gray-400 mt-1">
                        Session expires: {new Date(sessionExpiry * 1000).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setUseGasless(!useGasless)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      useGasless ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        useGasless ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    setGaslessLoading(true);
                    setError(null);
                    try {
                      if (!wallet?.enableGaslessTransfers) {
                        setError('Gasless transfers not available');
                        return;
                      }
                      const result = await wallet.enableGaslessTransfers();
                      setGaslessEnabled(true);
                      setSessionExpiry(result.expiry);
                      setUseGasless(true);
                    } catch (err: any) {
                      setError(err.message || 'Failed to enable gasless transfers');
                    } finally {
                      setGaslessLoading(false);
                    }
                  }}
                  disabled={gaslessLoading}
                  className="w-full rounded-lg border-2 border-dashed border-blue-300 bg-blue-50 p-4 hover:bg-blue-100 disabled:opacity-50"
                >
                  <div className="flex items-center justify-center gap-2">
                    <Zap className="h-5 w-5 text-blue-600" />
                    <span className="text-sm font-medium text-blue-900">
                      {gaslessLoading ? 'Enabling...' : 'Enable Gasless Transfers'}
                    </span>
                  </div>
                  <p className="text-xs text-blue-700 mt-1">
                    Send USDC without paying gas fees
                  </p>
                </button>
              )}
            </div>
            <div className="mt-auto w-full pt-8">
              <button
                disabled={!canContinue}
                onClick={handleContinue}
                className="bg-primary hover:bg-primary-hover w-full rounded-full px-6 py-3 text-sm font-medium text-white transition disabled:bg-gray-100 disabled:text-gray-400"
              >
                Continue
              </button>
            </div>
          </div>
        ) : (
          <OrderPreview
            userEmail={user?.email || ""}
            recipient={recipient}
            amount={displayableAmount}
            error={error}
            isLoading={isLoading}
            onConfirm={handleSend}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
