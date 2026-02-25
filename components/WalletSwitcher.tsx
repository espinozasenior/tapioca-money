"use client";

import { useState } from "react";
import { useConnectWallet } from "@privy-io/react-auth";
import { useWalletSelection, type WalletType } from "@/hooks/useWalletSelection";
import { Dialog, DialogContent, DialogTitle } from "./common/Dialog";
import { shortenAddress } from "@/utils/shortenAddress";
import { Check, Plus, Wallet } from "lucide-react";

function walletDisplayName(walletClientType: string, chainType: string): string {
  if (walletClientType === "privy") return "Embedded Wallet";

  const names: Record<string, string> = {
    metamask: "MetaMask",
    coinbase_wallet: "Coinbase Wallet",
    rainbow: "Rainbow",
    phantom: "Phantom",
    wallet_connect: "WalletConnect",
  };

  return names[walletClientType] ?? (chainType === "solana" ? "Solana Wallet" : "External Wallet");
}

function walletTypeLabel(type: WalletType): string {
  switch (type) {
    case "embedded":
      return "Embedded";
    case "external-evm":
      return "EVM";
    case "solana":
      return "Solana";
  }
}

function walletTypeBadgeColor(type: WalletType): string {
  switch (type) {
    case "embedded":
      return "bg-blue-100 text-blue-700";
    case "external-evm":
      return "bg-emerald-100 text-emerald-700";
    case "solana":
      return "bg-purple-100 text-purple-700";
  }
}

interface WalletSwitcherProps {
  open: boolean;
  onClose: () => void;
}

export function WalletSwitcher({ open, onClose }: WalletSwitcherProps) {
  const { activeWallet, allWallets, selectWallet } = useWalletSelection();
  const { connectWallet } = useConnectWallet();

  const handleSelect = (address: string) => {
    selectWallet(address);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col rounded-3xl bg-white sm:max-w-md">
        <DialogTitle className="text-center text-lg font-semibold">Switch Wallet</DialogTitle>

        <div className="mt-2 flex flex-col gap-2">
          {allWallets.map((w) => {
            const isActive = w.address === activeWallet?.address;
            const type =
              w.walletClientType === "privy"
                ? ("embedded" as WalletType)
                : w.chainType === "solana"
                  ? ("solana" as WalletType)
                  : ("external-evm" as WalletType);

            return (
              <button
                key={w.address}
                onClick={() => handleSelect(w.address)}
                className={`flex items-center gap-3 rounded-xl border p-4 transition ${
                  isActive
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 bg-white hover:bg-gray-50"
                }`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                  <Wallet className="h-5 w-5 text-gray-600" />
                </div>
                <div className="flex flex-1 flex-col items-start">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {walletDisplayName(w.walletClientType, w.chainType)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${walletTypeBadgeColor(type)}`}
                    >
                      {walletTypeLabel(type)}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-gray-500">
                    {shortenAddress(w.address)}
                  </span>
                </div>
                {isActive && <Check className="h-5 w-5 text-blue-500" />}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => {
            onClose();
            connectWallet();
          }}
          className="mt-4 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 p-4 text-sm font-medium text-gray-600 transition hover:border-gray-400 hover:bg-gray-50"
        >
          <Plus className="h-4 w-4" />
          Connect Another Wallet
        </button>
      </DialogContent>
    </Dialog>
  );
}
