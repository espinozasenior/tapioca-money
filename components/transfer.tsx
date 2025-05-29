"use client";

import { useState } from "react";
import { useWallet } from "@crossmint/client-sdk-react-ui";
import { PublicKey } from "@solana/web3.js";
import {
  createSolTransferTransaction,
  createTokenTransferTransaction,
} from "@/lib/createTransaction";

const isSolanaAddressValid = (address: string) => {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
};

export function TransferFunds() {
  const { wallet, type } = useWallet();
  const [token, setToken] = useState<"sol" | "usdc" | null>("sol");
  const [recipient, setRecipient] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [txnHash, setTxnHash] = useState<string | null>(null);

  async function handleOnTransfer() {
    if (
      wallet == null ||
      token == null ||
      type !== "solana-smart-wallet" ||
      recipient == null ||
      amount == null
    ) {
      alert("Transfer: missing required fields");
      return;
    }

    // Validate Solana recipient address
    if (token === "sol" && !isSolanaAddressValid(recipient)) {
      alert("Transfer: Invalid Solana recipient address");
      return;
    }

    try {
      setIsLoading(true);
      function buildTransaction() {
        return token === "sol"
          ? createSolTransferTransaction(wallet?.address!, recipient!, amount!)
          : createTokenTransferTransaction(
              wallet?.address!,
              recipient!,
              process.env.NEXT_PUBLIC_USDC_TOKEN_MINT ||
                "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", // USDC token mint
              amount!
            );
      }

      const txn = await buildTransaction();
      const txnHash = await wallet.sendTransaction({
        transaction: txn,
      });
      setTxnHash(`https://solscan.io/tx/${txnHash}?cluster=devnet`);
    } catch (err) {
      console.error("Transfer: ", err);
      alert("Transfer: " + err);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-medium">Transfer funds</h2>
        <p className="text-sm text-gray-500">Send funds to another wallet</p>
      </div>
      <div className="flex w-full flex-col gap-3">
        <div className="flex gap-4">
          <div className="flex flex-1 flex-col gap-2">
            <label className="text-sm font-medium">Token</label>
            <div className="flex gap-4">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="token"
                  className="h-4 w-4"
                  checked={token === "usdc"}
                  onChange={() => setToken("usdc")}
                />
                <span>USDC</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="token"
                  className="h-4 w-4"
                  checked={token === "sol"}
                  onChange={() => setToken("sol")}
                />
                <span>SOL</span>
              </label>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <label className="text-sm font-medium">Amount</label>
            <input
              type="number"
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="0.00"
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Recipient wallet</label>
          <input
            type="text"
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Enter wallet address"
            onChange={(e) => setRecipient(e.target.value)}
          />
        </div>
      </div>
      <div className="flex w-full flex-col gap-2">
        <button
          className={`w-full rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            isLoading
              ? "cursor-not-allowed bg-gray-200 text-gray-500"
              : "bg-accent hover:bg-accent/80 text-white"
          }`}
          onClick={handleOnTransfer}
          disabled={isLoading}
        >
          {isLoading ? "Transferring..." : "Transfer"}
        </button>
        {txnHash && !isLoading && (
          <a
            href={txnHash}
            className="text-center text-sm text-gray-500"
            target="_blank"
            rel="noopener noreferrer"
          >
            → View on Solscan (refresh to update balance)
          </a>
        )}
      </div>
    </div>
  );
}
