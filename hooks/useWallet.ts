"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { type Hex, createPublicClient, createWalletClient, custom, http, formatUnits, parseUnits, encodeFunctionData } from "viem";
import { base } from "viem/chains";
import { useMemo, useCallback } from "react";

// USDC on Base
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

/**
 * DEBUG: Wrap Privy's Ethereum provider to intercept and log any
 * eth_sendTransaction / eth_sendRawTransaction calls with stack traces.
 * This will reveal exactly which code path triggers the Privy approve modal.
 *
 * TODO: Remove this wrapper once the source is identified.
 */
function wrapProviderWithTracing(provider: any, label: string): any {
  const originalRequest = provider.request.bind(provider);

  provider.request = async (args: { method: string; params?: any[] }) => {
    const trackedMethods = [
      'eth_sendTransaction',
      'eth_sendRawTransaction',
      'eth_signTransaction',
      'personal_sign',
      'eth_sign',
      'eth_signTypedData_v4',
    ];

    if (trackedMethods.includes(args.method)) {
      const stack = new Error().stack;
      console.warn(
        `[TRACE ${label}] ⚠️ Provider.request("${args.method}") intercepted!\n` +
        `Params: ${JSON.stringify(args.params, null, 2)}\n` +
        `Stack trace:\n${stack}`
      );
    }

    return originalRequest(args);
  };

  return provider;
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
  const { wallets } = useWallets();

  const wallet = wallets?.[0]; // Primary wallet (Privy embedded wallet)
  const address = wallet?.address as Hex | undefined;

  // Debug: Log only when authenticated but no wallet (unusual state)
  if (ready && authenticated && !wallet) {
    console.warn('[useWallet] Authenticated but no wallet found. Wallets count:', wallets?.length || 0);
  }

  // Check for wallet object existence rather than requiring address immediately
  // This allows the app to detect successful login even if address is still loading
  const isReady = ready && authenticated && !!wallet;

  // Create a public client for balance queries (memoized to prevent recreating on every render)
  const publicClient = useMemo(() => createPublicClient({
    chain: base,
    transport: http(),
  }), []);

  // Memoize the wallet object to prevent unnecessary re-renders
  const walletObject = useMemo(() => {
    if (!isReady) return null;

    return {
      address: address || "0x0000000000000000000000000000000000000000" as Hex, // Fallback while loading
      chain: "base" as const,

      /**
       * Get balances for specified assets
       * Compatible with Crossmint's balances() API
       */
      async balances(assets: string[]) {
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
          const rawProvider = await wallet.getEthereumProvider();
          const provider = wrapProviderWithTracing(rawProvider, 'useWallet.send');

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
       * Send tokens gaslessly (ZeroDev sponsored)
       * Uses transfer-only session key for USDC transfers
       * No gas fees required from user
       */
      async sendSponsored(to: string, asset: string, amount: string) {
        if (!address) throw new Error("Wallet address not yet available");

        if (asset !== 'USDC') {
          throw new Error('Only USDC gasless transfers supported');
        }

        // Get access token for authenticated request
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error("Authentication required for gasless transfers");
        }

        // Check if user has transfer session key
        const statusResponse = await fetch(`/api/transfer/register?address=${address}`);
        const status = await statusResponse.json();

        if (!status.isEnabled) {
          throw new Error('Gasless transfers not enabled. Please enable in settings first.');
        }

        // Execute gasless transfer with authentication
        const response = await fetch('/api/transfer/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ address, recipient: to, amount })
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Gasless transfer failed');
        }

        return result.hash;
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
        const response = await fetch('/api/transfer/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            address,
            privyWallet: {
              address: wallet.address,
              getEthereumProvider: wallet.getEthereumProvider.bind(wallet),
            }
          })
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Failed to enable gasless transfers');
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

        const response = await fetch('/api/transfer/register', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ address })
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Failed to revoke gasless transfers');
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
        if (!wallet) throw new Error("Wallet not ready");
        const rawProvider = await wallet.getEthereumProvider();
        return wrapProviderWithTracing(rawProvider, 'useWallet.getEthereumProvider');
      },
    };
  }, [isReady, address, wallet, publicClient, getAccessToken]);

  return {
    wallet: walletObject,
    status: isReady ? ("connected" as const) : ("disconnected" as const),
    isReady,
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
        console.log('[Privy] Triggering login modal');
        login();
      } else {
        console.warn('[Privy] SDK not ready yet, cannot trigger login');
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
    user: user ? {
      email: user.email?.address,
      id: user.id,
      wallet: user.wallet?.address,
    } : null,
  };
}
