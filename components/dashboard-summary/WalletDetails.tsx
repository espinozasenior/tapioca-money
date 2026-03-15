import { useAuth, useWallet } from "@/hooks/useWallet";
import { useBalance } from "@/hooks/useBalance";
import { useAgent } from "@/hooks/useOptimizer";
import { useWalletSelection } from "@/hooks/useWalletSelection";
import { useState, useEffect } from "react";
import Image from "next/image";
import { Dialog, DialogContent, DialogTitle } from "../common/Dialog";
import { Details } from "../common/Details";
import { CopyWrapper } from "../common/CopyWrapper";
import { shortenAddress } from "@/utils/shortenAddress";

function formatWalletType(type: string | null): string {
  switch (type) {
    case "embedded":
      return "Embedded (Privy)";
    case "external-evm":
      return "External (EVM)";
    case "solana":
      return "Solana";
    default:
      return "Unknown";
  }
}

export function WalletDetails({ onClose, open }: { onClose: () => void; open: boolean }) {
  const { wallet, walletType } = useWallet();
  const { user } = useAuth();
  const { displayableBalance, isLoading: isBalanceLoading } = useBalance();
  const { undelegate, isUndelegating, undelegateError, isRegistered } = useAgent();
  const { supportsEip7702, agentAddress } = useWalletSelection();
  const [confirmReset, setConfirmReset] = useState(false);

  // ERC-4337 users: revoke session key only (no on-chain undelegation needed)
  // EIP-7702 users: full on-chain delegation reset
  const isErc4337User = isRegistered && !supportsEip7702;

  useEffect(() => {
    if (!confirmReset) return;
    const timer = setTimeout(() => setConfirmReset(false), 5000);
    return () => clearTimeout(timer);
  }, [confirmReset]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="flex h-[580px] max-h-[85vh] flex-col rounded-3xl bg-white sm:max-w-md">
        <DialogTitle className="sr-only">Wallet Details</DialogTitle>
        <div className="flex w-full flex-1 flex-col items-center pt-4">
          <div className="mb-6 flex items-center justify-center">
            <Image
              src="/wallet.png"
              className="h-fit w-20"
              alt="Wallet"
              width={80}
              height={80}
              unoptimized
            />
          </div>
          <h2 className="mb-6 text-center text-2xl font-bold text-gray-900">Wallet Details</h2>
          <Details
            values={[
              {
                label: "Address",
                value: (
                  <CopyWrapper toCopy={wallet?.address} iconPosition="right">
                    <span>{shortenAddress(wallet?.address || "")}</span>
                  </CopyWrapper>
                ),
              },
              {
                label: "Type",
                value: formatWalletType(walletType),
              },
              {
                label: "Balance",
                value: isBalanceLoading ? (
                  <span className="text-gray-400">Loading...</span>
                ) : (
                  <span>${displayableBalance}</span>
                ),
              },
              {
                label: "Owner",
                value: user?.email || "",
              },
            ]}
          />
        </div>
        <div className="mt-auto flex w-full flex-col gap-3 pt-8">
          {undelegateError && (
            <p className="text-center text-sm text-red-500">{undelegateError.message}</p>
          )}
          {agentAddress && agentAddress.toLowerCase() !== wallet?.address?.toLowerCase() && (
            <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
              <p className="font-medium">Smart Wallet (ERC-4337)</p>
              <p className="mt-1 font-mono">{agentAddress}</p>
              <p className="mt-1 text-blue-600">Your agent operates on this address. Deposit USDC here.</p>
            </div>
          )}
          <button
            onClick={() => {
              if (confirmReset) {
                undelegate();
                setConfirmReset(false);
              } else {
                setConfirmReset(true);
              }
            }}
            disabled={isUndelegating}
            className="w-full rounded-full border border-red-300 bg-white px-6 py-3.5 text-base font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          >
            {isUndelegating
              ? "Resetting..."
              : confirmReset
                ? "Confirm — requires re-registration"
                : isErc4337User
                  ? "Revoke Session Key"
                  : "Reset Agent Delegation"}
          </button>
          <button
            onClick={onClose}
            className="w-full rounded-full border border-gray-200 bg-white px-6 py-3.5 text-base font-semibold text-gray-900 transition hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
