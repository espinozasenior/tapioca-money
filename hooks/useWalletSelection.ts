"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
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
  /** Whether the active wallet supports EIP-7702 (Privy embedded only) */
  supportsEip7702: boolean;
  /** Address where the agent operates: EOA for 7702, null for 4337 (server resolves) */
  agentAddress: string | null;
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
  // Track whether the current selection was explicitly chosen by the user
  // (via selectWallet or restored from localStorage). Auto-selections are
  // re-evaluated when new wallets connect to avoid the race condition where
  // embedded wallets load before the external wallet and "stick".
  const isManualSelection = useRef(false);

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
      isManualSelection.current = true;
    }
  }, [authenticated, user?.id, connectedWallets]);

  // Auto-select logic: pick the best wallet by priority.
  // Re-evaluates on every connectedWallets change unless the user
  // explicitly chose a wallet (manual selection is sticky).
  useEffect(() => {
    if (connectedWallets.length === 0) {
      setSelectedAddress(null);
      return;
    }

    // If user explicitly selected and it's still valid, keep it
    if (
      isManualSelection.current &&
      selectedAddress &&
      connectedWallets.some((w) => w.address === selectedAddress)
    ) {
      return;
    }

    // Default: prefer external EVM wallet (user's "real" wallet), then embedded, then first any.
    // External wallet is the identity stored in the DB — selecting embedded would cause
    // status queries to use the wrong address after refresh.
    const evmExternal = connectedWallets.find(
      (w) => w.walletClientType !== "privy" && w.chainType === "ethereum"
    );
    const embedded = connectedWallets.find(
      (w) => w.walletClientType === "privy" && w.chainType === "ethereum"
    );
    const fallback = evmExternal ?? embedded ?? connectedWallets[0];

    if (fallback.address !== selectedAddress) {
      console.log(
        "[WalletSelection] Auto-selecting wallet:",
        fallback.address,
        `(${fallback.walletClientType})`,
        "| available:",
        connectedWallets.map((w) => `${w.address.slice(0, 8)}...(${w.walletClientType})`).join(", ")
      );
    }
    setSelectedAddress(fallback.address);
  }, [connectedWallets, selectedAddress]);

  const selectWallet = useCallback(
    (address: string) => {
      setSelectedAddress(address);
      isManualSelection.current = true;
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

  // EIP-7702 is only available via Privy embedded wallets (they have the signAuthorization hook)
  const supportsEip7702 = activeWalletType === "embedded";

  // Address where the agent operates (where funds live):
  // - EIP-7702 users (embedded or external): EOA = smart account (same address)
  // - ERC-4337 users: null — server resolves via resolveAgentAddress (DB has the Kernel address)
  // For EIP-7702, the active wallet IS the delegated EOA regardless of wallet type
  // (embedded or external). External wallet users who delegated their EOA to Kernel
  // still use their own address as the agent address.
  const agentAddress = useMemo(() => {
    if (!activeWallet) return null;
    if (isEvmWallet) return activeWallet.address;
    return null;
  }, [activeWallet, isEvmWallet]);

  const value = useMemo<WalletSelectionContextValue>(
    () => ({
      activeWallet,
      allWallets: connectedWallets,
      selectWallet,
      activeWalletType,
      supportsSmartAccount,
      isEvmWallet,
      isSolanaWallet,
      supportsEip7702,
      agentAddress,
    }),
    [
      activeWallet,
      connectedWallets,
      selectWallet,
      activeWalletType,
      supportsSmartAccount,
      isEvmWallet,
      isSolanaWallet,
      supportsEip7702,
      agentAddress,
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
