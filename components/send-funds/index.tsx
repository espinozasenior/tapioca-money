import React, { useReducer, useCallback } from "react";
import { useAuth, useWallet } from "@/hooks/useWallet";
import { AmountInput } from "../common/AmountInput";
import { OrderPreview } from "./OrderPreview";
import { RecipientInput } from "./RecipientInput";
import { useBalance } from "@/hooks/useBalance";
import { Dialog, DialogContent, DialogTitle, DialogClose } from "../common/Dialog";
import { useActivityFeed } from "@/hooks/useActivityFeed";
import { isEmail, isValidAddress } from "@/lib/utils";
import { ArrowLeft, X, Zap, AlertTriangle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface SendState {
  recipient: string;
  amount: string;
  showPreview: boolean;
  isLoading: boolean;
  error: string | null;
  gaslessOverride: boolean | null; // null = use default (gaslessEnabled), true/false = user toggled
  gaslessLoading: boolean;
}

type SendAction =
  | { type: "SET_RECIPIENT"; value: string }
  | { type: "SET_AMOUNT"; value: string }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "SHOW_PREVIEW" }
  | { type: "START_LOADING" }
  | { type: "STOP_LOADING" }
  | { type: "TOGGLE_GASLESS"; value: boolean }
  | { type: "SET_GASLESS_LOADING"; value: boolean }
  | { type: "RESET" };

const initialState: SendState = {
  recipient: "",
  amount: "",
  showPreview: false,
  isLoading: false,
  error: null,
  gaslessOverride: null,
  gaslessLoading: false,
};

function sendReducer(state: SendState, action: SendAction): SendState {
  switch (action.type) {
    case "SET_RECIPIENT":
      return { ...state, recipient: action.value };
    case "SET_AMOUNT":
      return { ...state, amount: action.value };
    case "SET_ERROR":
      return { ...state, error: action.error };
    case "SHOW_PREVIEW":
      return { ...state, showPreview: true, error: null };
    case "START_LOADING":
      return { ...state, isLoading: true, error: null };
    case "STOP_LOADING":
      return { ...state, isLoading: false };
    case "TOGGLE_GASLESS":
      return { ...state, gaslessOverride: action.value };
    case "SET_GASLESS_LOADING":
      return { ...state, gaslessLoading: action.value };
    case "RESET":
      return initialState;
  }
}

interface SendFundsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SendFundsModal({ open, onClose }: SendFundsModalProps) {
  const { wallet, isSolanaWallet } = useWallet();
  const { user } = useAuth();
  const [state, dispatch] = useReducer(sendReducer, initialState);

  const { displayableBalance, refetch: refetchBalance } = useBalance();
  const { refetch: refetchActivityFeed } = useActivityFeed();
  const queryClient = useQueryClient();

  // Check gasless transfer session status
  const { data: gaslessStatus } = useQuery({
    queryKey: ["gasless-status", wallet?.address],
    queryFn: async () => {
      if (!wallet?.address) return null;
      const response = await fetch(`/api/transfer/register?address=${wallet.address}`);
      return response.json();
    },
    enabled: !!wallet?.address && open,
  });

  const gaslessEnabled = gaslessStatus?.isEnabled ?? false;
  const sessionExpiry = gaslessStatus?.expiry ?? null;
  // Derive gasless toggle: user override wins, otherwise default to enabled status
  const useGasless = state.gaslessOverride ?? gaslessEnabled;

  const isRecipientValid = isValidAddress(state.recipient) || isEmail(state.recipient);
  const isAmountValid =
    !!state.amount &&
    !Number.isNaN(Number(state.amount)) &&
    Number(state.amount) > 0 &&
    Number(state.amount) <= Number(displayableBalance);
  const canContinue = isRecipientValid && isAmountValid;

  const handleContinue = useCallback(() => {
    if (isEmail(state.recipient) && !state.recipient) {
      dispatch({ type: "SET_ERROR", error: "Please enter a recipient" });
      return;
    }
    dispatch({ type: "SHOW_PREVIEW" });
  }, [state.recipient]);

  const handleSend = useCallback(async () => {
    dispatch({ type: "START_LOADING" });
    try {
      if (!isRecipientValid || !state.amount || !isAmountValid) {
        dispatch({ type: "SET_ERROR", error: "Invalid recipient or amount" });
        dispatch({ type: "STOP_LOADING" });
        return;
      }

      if (!wallet) {
        dispatch({ type: "SET_ERROR", error: "No wallet connected" });
        dispatch({ type: "STOP_LOADING" });
        return;
      }

      // Email recipients not supported with Privy - only wallet addresses
      if (isEmail(state.recipient)) {
        dispatch({
          type: "SET_ERROR",
          error: "Email recipients not yet supported. Please use a wallet address.",
        });
        dispatch({ type: "STOP_LOADING" });
        return;
      }

      // Use gasless or regular transaction based on toggle
      if (useGasless && gaslessEnabled) {
        await wallet.sendSponsored(state.recipient, "USDC", state.amount);
      } else {
        await wallet.send(state.recipient, "usdc", state.amount);
      }

      refetchBalance();
      refetchActivityFeed();
      dispatch({ type: "RESET" });
      onClose();
    } catch (err: any) {
      dispatch({ type: "SET_ERROR", error: err.message });
    } finally {
      dispatch({ type: "STOP_LOADING" });
    }
  }, [
    isRecipientValid,
    isAmountValid,
    state.recipient,
    state.amount,
    wallet,
    useGasless,
    gaslessEnabled,
    refetchBalance,
    refetchActivityFeed,
    onClose,
  ]);

  const resetFlow = useCallback(() => dispatch({ type: "RESET" }), []);

  const handleDone = useCallback(() => {
    dispatch({ type: "RESET" });
    onClose();
  }, [onClose]);

  const displayableAmount = Number(state.amount).toFixed(2);
  const showBackButton = state.showPreview && !state.isLoading;
  const showCloseButton = !state.showPreview;

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
          {state.showPreview ? "Order Confirmation" : "Send"}
        </DialogTitle>
        {isSolanaWallet ? (
          <div className="flex flex-1 flex-col items-center justify-center px-4">
            <AlertTriangle className="mb-3 h-10 w-10 text-yellow-500" />
            <h3 className="mb-2 text-lg font-semibold text-yellow-800">
              Requires an Ethereum Wallet
            </h3>
            <p className="text-center text-sm text-yellow-700">
              USDC transfers are only available with EVM wallets. Please switch to an Ethereum
              wallet to send funds.
            </p>
          </div>
        ) : !state.showPreview ? (
          <div className="flex w-full flex-1 flex-col">
            <div className="mb-2 flex w-full flex-col items-center">
              <AmountInput
                amount={state.amount}
                onChange={(v) => dispatch({ type: "SET_AMOUNT", value: v })}
              />
              <div
                className={
                  Number(state.amount) > Number(displayableBalance)
                    ? "text-sm text-red-600"
                    : "text-muted-foreground text-sm"
                }
              >
                Current balance: ${displayableBalance}
              </div>
            </div>
            <div className="mt-4 w-full">
              <RecipientInput
                recipient={state.recipient}
                onChange={(v) => dispatch({ type: "SET_RECIPIENT", value: v })}
                error={state.error}
              />
            </div>
            <div className="mt-4 w-full">
              {gaslessEnabled ? (
                <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-yellow-500" />
                      <label htmlFor="gasless-toggle" className="text-sm font-medium text-gray-900">
                        Gasless Transaction
                      </label>
                    </div>
                    <p className="text-xs text-gray-500">
                      No ETH needed - ZeroDev sponsors gas fees
                    </p>
                    {sessionExpiry && (
                      <p className="mt-1 text-xs text-gray-400">
                        Session expires: {new Date(sessionExpiry * 1000).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <button
                    id="gasless-toggle"
                    type="button"
                    onClick={() => dispatch({ type: "TOGGLE_GASLESS", value: !useGasless })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      useGasless ? "bg-blue-600" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        useGasless ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    dispatch({ type: "SET_GASLESS_LOADING", value: true });
                    dispatch({ type: "SET_ERROR", error: null });
                    try {
                      if (!wallet?.enableGaslessTransfers) {
                        dispatch({ type: "SET_ERROR", error: "Gasless transfers not available" });
                        return;
                      }
                      await wallet.enableGaslessTransfers();
                      await queryClient.invalidateQueries({
                        queryKey: ["gasless-status", wallet?.address],
                      });
                    } catch (err: any) {
                      dispatch({
                        type: "SET_ERROR",
                        error: err.message || "Failed to enable gasless transfers",
                      });
                    } finally {
                      dispatch({ type: "SET_GASLESS_LOADING", value: false });
                    }
                  }}
                  disabled={state.gaslessLoading}
                  className="w-full rounded-lg border-2 border-dashed border-blue-300 bg-blue-50 p-4 hover:bg-blue-100 disabled:opacity-50"
                >
                  <div className="flex items-center justify-center gap-2">
                    <Zap className="h-5 w-5 text-blue-600" />
                    <span className="text-sm font-medium text-blue-900">
                      {state.gaslessLoading ? "Enabling..." : "Enable Gasless Transfers"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-blue-700">Send USDC without paying gas fees</p>
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
            recipient={state.recipient}
            amount={displayableAmount}
            error={state.error}
            isLoading={state.isLoading}
            onConfirm={handleSend}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
