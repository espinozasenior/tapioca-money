"use client";

import { useEffect, useState } from "react";
import { type DelegatedSigner, useAuth, useWallet } from "@crossmint/client-sdk-react-ui";
import { cn } from "@/lib/utils";

export function DelegatedSigner() {
  const { wallet, type } = useWallet();
  const { jwt } = useAuth();

  const [isLoading, setIsLoading] = useState(false);
  const [delegatedSigners, setDelegatedSigners] = useState<DelegatedSigner[]>([]);
  const [newSigner, setNewSigner] = useState<string>("");

  useEffect(() => {
    const fetchDelegatedSigners = async () => {
      if (wallet != null && type === "solana-smart-wallet") {
        const signers = await wallet.getDelegatedSigners();
        setDelegatedSigners(signers);
      }
    };
    fetchDelegatedSigners();
  }, [wallet, jwt, type]);

  const addNewSigner = async () => {
    if (wallet == null || type !== "solana-smart-wallet") {
      throw new Error("No wallet connected");
    }
    if (!newSigner) {
      alert("Delegated Signer: no signer provided!");
      return;
    }
    try {
      setIsLoading(true);
      await wallet.addDelegatedSigner(`solana-keypair:${newSigner}`);
      const signers = await wallet.getDelegatedSigners();
      setDelegatedSigners(signers);
    } catch (err) {
      console.error("Delegated Signer: ", err);
      alert(`Delegated Signer: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-medium">Add Delegated Signer</h2>
        <p className="text-sm text-gray-500">
          Allow third parties to sign transactions on behalf of your wallet.{" "}
          <a
            href="https://docs.crossmint.com/wallets/advanced/delegated-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline"
          >
            Learn more
          </a>
          .
        </p>
      </div>
      <input
        type="text"
        className="w-full rounded-md border px-3 py-2 text-sm"
        placeholder="Ex: 5YNmS1R9nNSCDzb5a7mMJ1dwK9uHeAAF4CmPEwKgVWr8"
        onChange={(e) => setNewSigner(e.target.value)}
      />
      <button
        className={cn(
          "w-full rounded-md px-4 py-2 text-sm font-medium transition-colors",
          isLoading
            ? "cursor-not-allowed bg-gray-200 text-gray-500"
            : "bg-accent hover:bg-accent/80 text-white"
        )}
        onClick={addNewSigner}
        disabled={isLoading}
      >
        {isLoading ? "Processing..." : "Add"}
      </button>
      {/* List of delegated signers */}
      {delegatedSigners.length > 0 && (
        <div className="rounded-md bg-gray-50 px-3 py-2">
          <p className="mb-1.5 text-xs text-gray-500">Registered signers</p>
          {delegatedSigners.length > 0 && (
            <div className="overflow-x-auto rounded border border-gray-100 bg-white p-1">
              <ul className="flex flex-col gap-1">
                {delegatedSigners.map((signer, index) => (
                  <li
                    key={index}
                    className="whitespace-nowrap rounded px-2 py-1 text-xs text-gray-600"
                  >
                    {signer.locator}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
