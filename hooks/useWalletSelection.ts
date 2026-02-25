"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import {
  useWallets as useEthWallets,
  usePrivy,
  type ConnectedWallet as EthConnectedWallet,
} from "@privy-io/react-auth";
import { useWallets as useSolWallets } from "@privy-io/react-auth/solana";

export type WalletType = "embedded" | "external-evm" | "solana";

export interface WalletEntry {
  address: string;
  walletClientType: string;
  /** 'ethereum' | 'solana' */
  chainType: "ethereum" | "solana";
  /** The raw Privy wallet object (EthConnectedWallet or ConnectedStandardSolanaWallet) */
  raw: any;
}

interface WalletSelectionContextValue {
  /** Currently active wallet */
  activeWallet: WalletEntry | null;
  /** All connected wallets */
  allWallets: WalletEntry[];
  /** Switch active wallet by address */
  selectWallet: (address: string) => void;
  /** Type of the active wallet */
  activeWalletType: WalletType | null;
  /** Whether the active wallet supports smart account (EVM only) */
  supportsSmartAccount: boolean;
  /** Whether the active wallet is EVM-compatible */
  isEvmWallet: boolean;
  /** Whether the active wallet is a Solana wallet */
  isSolanaWallet: boolean;
}

const WalletSelectionContext = createContext<WalletSelectionContextValue | null>(null);

function classifyEntry(entry: WalletEntry): WalletType {
  if (entry.walletClientType === "privy") {
    return "embedded";
  }
  if (entry.chainType === "solana") {
    return "solana";
  }
  return "external-evm";
}

function getStorageKey(userId: string) {
  return `tapioca-active-wallet-${userId}`;
}

export function WalletSelectionProvider({ children }: { children: React.ReactNode }) {
  const { wallets: ethWallets } = useEthWallets();
  const { wallets: solWallets } = useSolWallets();
  const { user, authenticated } = usePrivy();
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);

  const connectedWallets: WalletEntry[] = useMemo(() => {
    const eth: WalletEntry[] = ethWallets.map((w) => ({
      address: w.address,
      walletClientType: w.walletClientType,
      chainType: "ethereum" as const,
      raw: w,
    }));
    const sol: WalletEntry[] = solWallets.map((w: any) => ({
      address: w.address,
      walletClientType: w.walletClientType ?? w.name ?? "solana",
      chainType: "solana" as const,
      raw: w,
    }));
    return [...eth, ...sol];
  }, [ethWallets, solWallets]);

  // Restore persisted selection on login
  useEffect(() => {
    if (!authenticated || !user?.id) return;

    const stored = localStorage.getItem(getStorageKey(user.id));
    if (stored && connectedWallets.some((w) => w.address === stored)) {
      setSelectedAddress(stored);
    }
  }, [authenticated, user?.id, connectedWallets]);

  // Auto-select logic: if nothing selected, pick a default
  useEffect(() => {
    if (connectedWallets.length === 0) {
      setSelectedAddress(null);
      return;
    }

    // If current selection is still valid, keep it
    if (selectedAddress && connectedWallets.some((w) => w.address === selectedAddress)) {
      return;
    }

    // Default: prefer embedded wallet, then first EVM, then first any
    const embedded = connectedWallets.find((w) => w.walletClientType === "privy");
    const evmExternal = connectedWallets.find(
      (w) => w.walletClientType !== "privy" && w.chainType === "ethereum"
    );
    const fallback = embedded ?? evmExternal ?? connectedWallets[0];
    setSelectedAddress(fallback.address);
  }, [connectedWallets, selectedAddress]);

  const selectWallet = useCallback(
    (address: string) => {
      setSelectedAddress(address);
      if (user?.id) {
        localStorage.setItem(getStorageKey(user.id), address);
      }
    },
    [user?.id]
  );

  const activeWallet = useMemo(
    () => connectedWallets.find((w) => w.address === selectedAddress) ?? null,
    [connectedWallets, selectedAddress]
  );

  const activeWalletType = activeWallet ? classifyEntry(activeWallet) : null;
  const isEvmWallet = activeWalletType === "embedded" || activeWalletType === "external-evm";
  const isSolanaWallet = activeWalletType === "solana";
  const supportsSmartAccount = isEvmWallet;

  const value = useMemo<WalletSelectionContextValue>(
    () => ({
      activeWallet,
      allWallets: connectedWallets,
      selectWallet,
      activeWalletType,
      supportsSmartAccount,
      isEvmWallet,
      isSolanaWallet,
    }),
    [
      activeWallet,
      connectedWallets,
      selectWallet,
      activeWalletType,
      supportsSmartAccount,
      isEvmWallet,
      isSolanaWallet,
    ]
  );

  return React.createElement(WalletSelectionContext.Provider, { value }, children);
}

export function useWalletSelection() {
  const context = useContext(WalletSelectionContext);
  if (!context) {
    throw new Error("useWalletSelection must be used within WalletSelectionProvider");
  }
  return context;
}
