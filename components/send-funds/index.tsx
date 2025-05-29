import React, { useState } from "react";
import { useAuth, useWallet } from "@crossmint/client-sdk-react-ui";
import { type Address, encodeFunctionData, erc20Abi, isAddress } from "viem";
import { AmountInput } from "../common/AmountInput";
import { OrderPreview } from "./OrderPreview";
import { RecipientInput } from "./RecipientInput";
import { useBalance } from "@/hooks/useBalance";
import { Modal } from "../common/Modal";
import { useActivityFeed } from "@/hooks/useActivityFeed";

interface SendFundsModalProps {
  open: boolean;
  onClose: () => void;
}

const isEmail = (email: string) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export function SendFundsModal({ open, onClose }: SendFundsModalProps) {
  const { wallet, type } = useWallet();
  const { user } = useAuth();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedEmailAddress, setResolvedEmailAddress] = useState<string | null>(null);
  const { usdcBalance, formatBalance, refetch: refetchBalance } = useBalance();
  const { refetch: refetchActivityFeed } = useActivityFeed(wallet?.address || "");

  const isRecipientValid = isAddress(recipient) || isEmail(recipient);
  const isAmountValid =
    !!amount &&
    !Number.isNaN(Number(amount)) &&
    Number(amount) > 0 &&
    Number(amount) <= Number(formatBalance(usdcBalance));
  const canContinue = isRecipientValid && isAmountValid;

  async function getWalletAddressByEmail(email: string): Promise<string> {
    const apiKey = process.env.NEXT_PUBLIC_CROSSMINT_SERVER_API_KEY;
    if (!apiKey) throw new Error("Missing Crossmint API key");
    const locator = `email:${email}:evm-smart-wallet`;
    const res = await fetch(`https://staging.crossmint.com/api/2022-06-09/wallets/${locator}`, {
      headers: {
        "X-API-KEY": apiKey,
        accept: "application/json",
      },
    });
    if (!res.ok) throw new Error("Could not resolve email to wallet address");
    const data = await res.json();
    return data.address;
  }

  async function handleContinue() {
    setError(null);
    if (isEmail(recipient)) {
      if (!recipient) {
        setError("Please enter a recipient");
        return;
      }
      try {
        setIsLoading(true);
        const resolved = await getWalletAddressByEmail(recipient);
        if (!resolved || !isAddress(resolved)) {
          setError("Could not resolve email to a valid wallet address");
          setIsLoading(false);
          return;
        }
        setResolvedEmailAddress(resolved);
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
      if (!wallet || type !== "evm-smart-wallet") {
        setError("No EVM wallet connected");
        setIsLoading(false);
        return;
      }
      let recipientAddress: string | undefined;
      if (isAddress(recipient)) {
        if (!recipient || !isAddress(recipient)) {
          setError("Invalid recipient address");
          setIsLoading(false);
          return;
        }
        recipientAddress = recipient;
      } else if (isEmail(recipient)) {
        if (!resolvedEmailAddress) {
          setError("No resolved wallet address for email");
          setIsLoading(false);
          return;
        }
        recipientAddress = resolvedEmailAddress;
      }
      if (!amount) {
        setError("Missing amount");
        setIsLoading(false);
        return;
      }
      const usdcToken = process.env.NEXT_PUBLIC_USDC_TOKEN_MINT as Address;
      if (!usdcToken) {
        setError("USDC token address not set");
        setIsLoading(false);
        return;
      }
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [recipientAddress as Address, BigInt(Math.round(Number(amount) * 10 ** 6))],
      });
      const txn = await wallet.sendTransaction({
        to: usdcToken,
        value: BigInt(0),
        data,
      });
      refetchBalance();
      refetchActivityFeed();
      handleDone();
    } catch (err: unknown) {
      setError((err as Error).message || String(err));
    } finally {
      setIsLoading(false);
    }
  }

  const resetFlow = () => {
    setShowPreview(false);
    setAmount("");
    setRecipient("");
    setResolvedEmailAddress(null);
    setError(null);
  };

  const handleDone = () => {
    resetFlow();
    onClose();
  };

  const handleBack = () => {
    if (!showPreview) {
      handleDone();
    } else {
      resetFlow();
    }
  };

  const displayableAmount = Number(amount).toFixed(2);

  return (
    <Modal
      open={open}
      onClose={onClose}
      showBackButton={!isLoading}
      onBack={handleBack}
      title={showPreview ? "Order Confirmation" : "Send"}
    >
      {!showPreview ? (
        <>
          <div className="mb-6 flex w-full flex-col items-center justify-between">
            <AmountInput amount={amount} onChange={setAmount} />
            <div
              className={
                Number(amount) > Number(formatBalance(usdcBalance))
                  ? "text-red-600"
                  : "text-gray-400"
              }
            >
              $ {formatBalance(usdcBalance)} balance
            </div>
          </div>
          <RecipientInput recipient={recipient} onChange={setRecipient} />
          <button
            className={`mt-8 w-full rounded-full py-3 text-lg font-semibold transition ${
              canContinue
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "cursor-not-allowed bg-gray-100 text-gray-400"
            }`}
            disabled={!canContinue}
            type="button"
            onClick={handleContinue}
          >
            Continue
          </button>
        </>
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
    </Modal>
  );
}
