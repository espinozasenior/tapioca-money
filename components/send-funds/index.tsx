import React, { useReducer, useCallback } from "react";
import { useAuth, useWallet, type SendPhase } from "@/hooks/useWallet";
import { AmountInput } from "../common/AmountInput";
import { OrderPreview } from "./OrderPreview";
import { RecipientInput, type ResolvedRecipient } from "./RecipientInput";
import { RecentRecipients } from "./RecentRecipients";
import { SendProgress } from "./SendProgress";
import { TxSuccess } from "./TxSuccess";
import { useBalance } from "@/hooks/useBalance";
import { Dialog, DialogContent, DialogTitle, DialogClose } from "../common/Dialog";
import { useActivityFeed } from "@/hooks/useActivityFeed";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isUsdcPaymasterEnabled } from "@/lib/config";

interface SendState {
  recipient: ResolvedRecipient;
  amount: string;
  showPreview: boolean;
  phase: SendPhase | "idle";
  userOpHash: string | null;
  txHash: string | null;
  feePaid: string | null;
  error: string | null;
  errorCode: string | null;
}

type SendAction =
  | { type: "SET_RECIPIENT"; value: ResolvedRecipient }
  | { type: "SET_AMOUNT"; value: string }
  | { type: "SET_ERROR"; error: string | null; code?: string | null }
  | { type: "SHOW_PREVIEW" }
  | { type: "BACK_TO_FORM" }
  | { type: "PHASE"; phase: SendPhase; userOpHash?: string; txHash?: string; feePaid?: string }
  | { type: "RESET" };

const emptyRecipient: ResolvedRecipient = {
  input: "",
  address: null,
  label: null,
  resolving: false,
  errorCode: null,
};

const initialState: SendState = {
  recipient: emptyRecipient,
  amount: "",
  showPreview: false,
  phase: "idle",
  userOpHash: null,
  txHash: null,
  feePaid: null,
  error: null,
  errorCode: null,
};

function sendReducer(state: SendState, action: SendAction): SendState {
  switch (action.type) {
    case "SET_RECIPIENT":
      return { ...state, recipient: action.value, error: null, errorCode: null };
    case "SET_AMOUNT":
      return { ...state, amount: action.value, error: null };
    case "SET_ERROR":
      return { ...state, error: action.error, errorCode: action.code ?? null };
    case "SHOW_PREVIEW":
      return { ...state, showPreview: true, error: null };
    case "BACK_TO_FORM":
      return { ...state, showPreview: false, phase: "idle", error: null, errorCode: null };
    case "PHASE":
      return {
        ...state,
        phase: action.phase,
        userOpHash: action.userOpHash ?? state.userOpHash,
        txHash: action.txHash ?? state.txHash,
        feePaid: action.feePaid ?? state.feePaid,
      };
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
  const queryClient = useQueryClient();

  const { displayableBalance, refetch: refetchBalance } = useBalance();
  const { refetch: refetchActivityFeed } = useActivityFeed();

  const flagEnabled = isUsdcPaymasterEnabled();

  // Load rate-limit info for the limits helper copy.
  const { data: statusData } = useQuery({
    queryKey: ["transfer-status", wallet?.address],
    queryFn: async () => {
      if (!wallet?.address) return null;
      const res = await fetch(`/api/transfer/register?address=${wallet.address}`);
      return res.json();
    },
    enabled: !!wallet?.address && open && flagEnabled,
  });

  const rateLimit = statusData?.rateLimitInfo;

  const isRecipientValid = !!state.recipient.address && !state.recipient.resolving;
  const isAmountValid =
    !!state.amount &&
    !Number.isNaN(Number(state.amount)) &&
    Number(state.amount) > 0 &&
    Number(state.amount) <= Number(displayableBalance);
  const canContinue = isRecipientValid && isAmountValid;

  const handleContinue = useCallback(() => {
    if (!state.recipient.address) {
      dispatch({ type: "SET_ERROR", error: "Enter a valid recipient" });
      return;
    }
    dispatch({ type: "SHOW_PREVIEW" });
  }, [state.recipient.address]);

  const handleSend = useCallback(async () => {
    if (!wallet) {
      dispatch({ type: "SET_ERROR", error: "No wallet connected" });
      return;
    }
    if (!state.recipient.address || !state.amount) {
      dispatch({ type: "SET_ERROR", error: "Invalid recipient or amount" });
      return;
    }

    try {
      const result = await wallet.sendUsdc(
        {
          to: state.recipient.address,
          amount: state.amount,
          label: state.recipient.label ?? undefined,
        },
        (ctx) =>
          dispatch({
            type: "PHASE",
            phase: ctx.phase,
            userOpHash: ctx.userOpHash,
            txHash: ctx.txHash,
            feePaid: ctx.feePaid,
          })
      );

      refetchBalance();
      refetchActivityFeed();
      queryClient.invalidateQueries({ queryKey: ["transfer-history"] });
      queryClient.invalidateQueries({ queryKey: ["transfer-status", wallet.address] });

      dispatch({
        type: "PHASE",
        phase: "success",
        txHash: result.hash,
        feePaid: result.feePaid,
      });
    } catch (err: any) {
      const code = err?.code || "TRANSFER_FAILED";
      const message = err?.message || "Transfer failed";
      dispatch({ type: "PHASE", phase: "error" });
      dispatch({ type: "SET_ERROR", error: message, code });
    }
  }, [wallet, state.recipient, state.amount, refetchBalance, refetchActivityFeed, queryClient]);

  const handleDone = useCallback(() => {
    dispatch({ type: "RESET" });
    onClose();
  }, [onClose]);

  const handleRecentPick = useCallback(
    (pick: { address: string; label: string | null }) => {
      dispatch({
        type: "SET_RECIPIENT",
        value: {
          input: pick.label ?? pick.address,
          address: pick.address as `0x${string}`,
          label: pick.label,
          resolving: false,
          errorCode: null,
        },
      });
    },
    []
  );

  const isWorking =
    state.phase === "submitting" ||
    state.phase === "signing_session" ||
    state.phase === "registering" ||
    state.phase === "confirming";

  const showBackButton = state.showPreview && state.phase === "idle";
  const showCloseButton = !state.showPreview && state.phase === "idle";

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleDone()}>
      <DialogContent className="flex h-[580px] max-h-[85vh] flex-col rounded-3xl bg-white sm:max-w-md">
        {showBackButton && (
          <button
            onClick={() => dispatch({ type: "BACK_TO_FORM" })}
            className="absolute left-6 top-6 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200"
            aria-label="Back"
            type="button"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        {showCloseButton && <DialogClose />}
        <DialogTitle className="text-center">
          {state.phase === "success"
            ? "Sent"
            : state.showPreview
              ? "Order Confirmation"
              : "Send"}
        </DialogTitle>

        {!flagEnabled ? (
          <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
            <AlertTriangle className="mb-3 h-10 w-10 text-yellow-500" />
            <h3 className="mb-2 text-lg font-semibold text-gray-800">
              Sends are temporarily disabled
            </h3>
            <p className="text-muted-foreground text-sm">
              We're turning this feature back on shortly. Try again in a few minutes.
            </p>
          </div>
        ) : isSolanaWallet ? (
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
        ) : state.phase === "success" && state.txHash ? (
          <TxSuccess
            amount={state.amount}
            recipientAddress={state.recipient.address ?? ""}
            recipientLabel={state.recipient.label}
            txHash={state.txHash}
            feePaid={state.feePaid ?? undefined}
            onDone={handleDone}
          />
        ) : isWorking ? (
          <SendProgress
            phase={state.phase as Exclude<SendPhase, "success" | "error">}
            userOpHash={state.userOpHash ?? undefined}
          />
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
              <div className="text-muted-foreground mt-1 text-xs">
                Max $500 per transfer
                {rateLimit && rateLimit.remaining <= 3 && (
                  <> · {rateLimit.remaining} sends remaining today</>
                )}
              </div>
            </div>

            <div className="mt-4 w-full">
              <RecentRecipients address={wallet?.address} onPick={handleRecentPick} />
              <RecipientInput
                value={state.recipient}
                onChange={(next) => dispatch({ type: "SET_RECIPIENT", value: next })}
                error={state.error}
              />
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
            recipientAddress={state.recipient.address ?? ""}
            recipientLabel={state.recipient.label}
            amount={state.amount}
            error={state.error}
            isLoading={isWorking}
            onConfirm={handleSend}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
