"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useWalletSelection, type WalletType } from "./useWalletSelection";
import {
  type Hex,
  createPublicClient,
  createWalletClient,
  custom,
  http,
  formatUnits,
  parseUnits,
  encodeFunctionData,
} from "viem";
import { base } from "viem/chains";
import { useMemo, useCallback } from "react";
import { USDC_ADDRESS } from "@/lib/config";

/**
 * Phase events emitted by the new paymaster-backed USDC send flow.
 * See tasks/architecture-usdc-send.md §8 for the full state machine.
 */
export type SendPhase =
  | "submitting"
  | "signing_session"
  | "registering"
  | "confirming"
  | "success"
  | "error";

export interface SendPhaseContext {
  phase: SendPhase;
  userOpHash?: string;
  txHash?: string;
  feePaid?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface SendUsdcArgs {
  to: string;
  amount: string;
  /** Optional ENS/Basename label for history row (cosmetic only). */
  label?: string;
  /** Optional client-provided idempotency key; generated when absent. */
  idempotencyKey?: string;
}

export interface SendUsdcResult {
  hash: string;
  userOpHash?: string;
  feePaid?: string;
}

function randomIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class SendError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SendError";
    this.code = code;
  }
}

// Minimal ERC-20 ABI for balance and transfer
const erc20Abi = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

/**
 * Wallet hook adapter for Privy
 *
 * This provides a compatible interface with the old Crossmint useWallet hook,
 * making migration easier by keeping the same API surface.
 */
export function useWallet() {
  const { authenticated, user, ready, getAccessToken } = usePrivy();
  const {
    activeWallet,
    activeWalletType,
    isEvmWallet,
    isSolanaWallet,
    supportsSmartAccount,
    allWallets,
  } = useWalletSelection();

  const wallet = activeWallet?.raw ?? null;
  const address = wallet?.address as Hex | undefined;

  // Debug: Only warn when wallets exist but none is selected (genuinely unexpected).
  // Skip during hydration gap where Privy is authenticated but wallets haven't loaded yet.
  if (ready && authenticated && !wallet && allWallets.length > 0) {
    console.warn("[useWallet] Authenticated with wallets available but no active wallet selected.");
  }

  // Check for wallet object existence rather than requiring address immediately
  // This allows the app to detect successful login even if address is still loading
  const isReady = ready && authenticated && !!wallet;

  // Create a public client for balance queries (memoized to prevent recreating on every render)
  // Uses configured RPC URL to avoid rate-limited public endpoint (P1-2 fix)
  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: base,
        transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || undefined),
      }),
    []
  );

  // Memoize the wallet object to prevent unnecessary re-renders
  const walletObject = useMemo(() => {
    if (!isReady) return null;

    return {
      address: address || ("0x0000000000000000000000000000000000000000" as Hex), // Fallback while loading
      chain: "base" as const,

      /**
       * Get balances for specified assets
       * Compatible with Crossmint's balances() API
       */
      async balances(assets: string[]) {
        if (!isEvmWallet)
          throw new Error(
            "Balance queries require an EVM wallet. Please switch to an Ethereum wallet."
          );
        if (!address) throw new Error("Wallet address not yet available");

        const balances: Record<string, { amount: string; decimals: number }> = {};

        for (const asset of assets) {
          if (asset.toLowerCase() === "usdc") {
            try {
              const balance = await publicClient.readContract({
                address: USDC_ADDRESS,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [address],
              });

              balances.usdc = {
                amount: formatUnits(balance, 6),
                decimals: 6,
              };
            } catch (error) {
              console.error("[useWallet] Failed to fetch USDC balance:", error);
              balances.usdc = { amount: "0", decimals: 6 };
            }
          }
        }

        return balances;
      },

      /**
       * Send tokens to another address
       * Compatible with Crossmint's send() API
       */
      async send(to: string, asset: string, amount: string) {
        if (!isEvmWallet)
          throw new Error(
            "Sending tokens requires an EVM wallet. Please switch to an Ethereum wallet."
          );
        if (!wallet) throw new Error("Wallet not ready");
        if (!address) throw new Error("Wallet address not yet available");

        if (asset.toLowerCase() === "usdc") {
          const amountWei = parseUnits(amount, 6); // USDC has 6 decimals

          // Encode ERC-20 transfer
          const data = encodeFunctionData({
            abi: erc20Abi,
            functionName: "transfer",
            args: [to as Hex, amountWei],
          });

          // Get the Ethereum provider from Privy wallet
          const provider = await wallet.getEthereumProvider();

          // Create wallet client with the provider
          const walletClient = createWalletClient({
            account: address,
            chain: base,
            transport: custom(provider),
          });

          // Execute transaction through Privy wallet
          const hash = await walletClient.sendTransaction({
            to: USDC_ADDRESS,
            data,
          });

          return { hash };
        }

        throw new Error(`Asset ${asset} not supported`);
      },

      /**
       * Send USDC via the ERC-20 paymaster (customer-paid).
       *
       * Inline-handles the session lifecycle: if no session exists or the
       * stored `permissionsVersion < 2`, the hook triggers registration
       * transparently (FR-25) before submitting. The caller sees a single
       * continuous stream of `SendPhase` events — no modal, no retry loop.
       *
       * @throws SendError with a `code` field from the error catalog.
       */
      async sendUsdc(args: SendUsdcArgs, onPhase?: (ctx: SendPhaseContext) => void): Promise<SendUsdcResult> {
        if (!address) throw new SendError("NO_WALLET", "Wallet address not yet available");
        if (!wallet) throw new SendError("NO_WALLET", "Wallet not ready");

        const accessToken = await getAccessToken();
        if (!accessToken) throw new SendError("UNAUTHENTICATED", "Authentication required");

        const idempotencyKey = args.idempotencyKey ?? randomIdempotencyKey();
        const emit = (ctx: SendPhaseContext) => {
          try {
            onPhase?.(ctx);
          } catch (err) {
            console.error("[useWallet] onPhase callback threw:", err);
          }
        };

        emit({ phase: "submitting" });

        // 1. Check session status — inline-upgrade if needed.
        const statusRes = await fetch(`/api/transfer/register?address=${address}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const status = await statusRes.json();

        // Missing `permissionsVersion` means legacy v1 — treat as needing setup.
        // Matches server-side gating in /api/transfer/send.
        const storedVersion =
          typeof status?.permissionsVersion === "number" ? status.permissionsVersion : 1;
        const needsSetup = !status?.isEnabled || storedVersion < 2;

        if (needsSetup) {
          emit({ phase: "signing_session" });
          const regRes = await fetch("/api/transfer/register", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              address,
              privyWallet: {
                address: wallet.address,
                getEthereumProvider: wallet.getEthereumProvider.bind(wallet),
              },
            }),
          });
          const regBody = await regRes.json();
          emit({ phase: "registering" });
          if (!regBody?.success) {
            const code = "SESSION_SETUP_FAILED";
            const message = regBody?.error || "Could not set up sending";
            emit({ phase: "error", errorCode: code, errorMessage: message });
            throw new SendError(code, message);
          }
        }

        emit({ phase: "submitting" });

        // 2. Submit the send (receipt waited server-side, synchronous response).
        const sendRes = await fetch("/api/transfer/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({ address, recipient: args.to, amount: args.amount, label: args.label }),
        });
        const body = await sendRes.json();

        if (!sendRes.ok || !body?.success) {
          const code = body?.code || "TRANSFER_FAILED";
          const message = body?.error || "Transfer failed";

          // Defensive: if server flagged upgrade-required after we already
          // ran setup, fall through to error (retry is a user-driven action).
          emit({ phase: "error", errorCode: code, errorMessage: message });
          throw new SendError(code, message);
        }

        if (body.userOpHash) {
          emit({ phase: "confirming", userOpHash: body.userOpHash });
        }

        emit({
          phase: "success",
          txHash: body.hash,
          userOpHash: body.userOpHash,
          feePaid: body.feePaid,
        });

        return { hash: body.hash, userOpHash: body.userOpHash, feePaid: body.feePaid };
      },

      /**
       * @deprecated Use `sendUsdc`. Left for tests/migration window.
       * Routes through the new paymaster-backed flow, discarding phase events.
       */
      async sendSponsored(to: string, _asset: string, amount: string) {
        const { hash } = await (this as any).sendUsdc({ to, amount });
        return hash;
      },

      /**
       * Enable gasless transfers by creating transfer session key
       * Must be called before using sendSponsored()
       */
      async enableGaslessTransfers() {
        if (!address) throw new Error("Wallet address not yet available");
        if (!wallet) throw new Error("Wallet not available");

        // Get access token for authenticated request
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error("Authentication required");
        }

        // Create transfer session key with authentication
        const response = await fetch("/api/transfer/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            address,
            privyWallet: {
              address: wallet.address,
              getEthereumProvider: wallet.getEthereumProvider.bind(wallet),
            },
          }),
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || "Failed to enable gasless transfers");
        }

        return {
          smartAccountAddress: result.smartAccountAddress,
          expiry: result.expiry,
        };
      },

      /**
       * Revoke gasless transfer permissions
       */
      async revokeGaslessTransfers() {
        if (!address) throw new Error("Wallet address not yet available");

        // Get access token for authenticated request
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error("Authentication required");
        }

        const response = await fetch("/api/transfer/register", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ address }),
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || "Failed to revoke gasless transfers");
        }

        return true;
      },

      /**
       * Get transaction history (experimental)
       * This is a placeholder - you may want to integrate with a block explorer API
       */
      async experimental_activity() {
        if (!address) throw new Error("Wallet address not yet available");

        // TODO: Integrate with block explorer API (e.g., Basescan, Blockscout)
        // For now, return empty array
        return {
          transactions: [],
        };
      },

      /**
       * Get the Ethereum provider for custom transactions
       * Used for complex multi-step transactions like vault deposits
       */
      async getEthereumProvider() {
        if (!isEvmWallet)
          throw new Error(
            "Ethereum provider requires an EVM wallet. Please switch to an Ethereum wallet."
          );
        if (!wallet) throw new Error("Wallet not ready");
        return await wallet.getEthereumProvider();
      },

      /**
       * Sign EIP-7702 authorization to delegate EOA to a contract implementation.
       * Used during agent registration to upgrade the EOA to a Kernel smart account.
       *
       * @param contractAddress - The Kernel implementation address to delegate to
       * @returns The signed authorization object for use with createKernelAccount
       */
      async signAuthorization(contractAddress: `0x${string}`) {
        if (!isEvmWallet)
          throw new Error(
            "EIP-7702 authorization requires an EVM wallet. Please switch to an Ethereum wallet."
          );
        if (!wallet) throw new Error("Wallet not ready");
        if (!address) throw new Error("Wallet address not yet available");

        const rawProvider = await wallet.getEthereumProvider();
        const walletClient = createWalletClient({
          account: address,
          chain: base,
          transport: custom(rawProvider),
        });

        const authorization = await walletClient.signAuthorization({
          contractAddress,
        });

        console.log("[useWallet] EIP-7702 authorization signed for:", contractAddress);
        return authorization;
      },
    };
  }, [isReady, address, wallet, publicClient, getAccessToken, isEvmWallet]);

  return {
    wallet: walletObject,
    status: isReady ? ("connected" as const) : ("disconnected" as const),
    isReady,
    walletType: activeWalletType,
    isEvmWallet,
    isSolanaWallet,
    supportsSmartAccount,
  };
}

/**
 * Authentication hook adapter for Privy
 *
 * Provides a compatible interface with Crossmint's useAuth hook
 */
export function useAuth() {
  const { login, logout, authenticated, user, ready } = usePrivy();

  return {
    /**
     * Open Privy login modal
     */
    login: () => {
      if (ready) {
        console.log("[Privy] Triggering login modal");
        login();
      } else {
        console.warn("[Privy] SDK not ready yet, cannot trigger login");
      }
    },

    /**
     * Logout user
     */
    logout: async () => {
      await logout();
    },

    /**
     * Auth status
     */
    status: authenticated ? ("logged-in" as const) : ("logged-out" as const),
    isReady: ready,
    ready, // Expose ready directly
    authenticated, // Expose authenticated directly

    /**
     * User info
     */
    user: user
      ? {
          email: user.email?.address,
          id: user.id,
          wallet: user.wallet?.address,
        }
      : null,
  };
}
