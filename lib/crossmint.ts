
/**
 * Crossmint Server-Side API Helper
 */

import { createWalletClient, http, Hash, Hex, createPublicClient, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const CROSSMINT_API_URL = "https://staging.crossmint.com/api"; // Using staging based on .env.dev

// Initialize public client for simulation
const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

/**
 * Simulate a transaction before signing
 */
export async function simulateTransaction(
  userWalletAddress: string,
  transaction: { to: string; data: string; value?: string }
) {
  try {
    // Basic simulation via gas estimation (reverts if execution would fail)
    await publicClient.estimateGas({
      account: userWalletAddress as `0x${string}`,
      to: transaction.to as `0x${string}`,
      data: transaction.data as `0x${string}`,
      value: BigInt(transaction.value || "0"),
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * DEPRECATED: Phase 5 - Replaced by ZeroDev Kernel V3
 * This function was used with Crossmint's EIP-7702 API, which has been
 * replaced with proper ZeroDev smart account implementation.
 * See: lib/zerodev/client.ts
 */

/**
 * Sign and send a transaction using the Agent's private key as a delegated signer
 */
export async function agentSignAndSend(
  userWalletAddress: string,
  transaction: { to: string; data: string; value?: string },
  chain: string = "base"
) {
  const apiKey = process.env.CROSSMINT_SERVER_SIDE_API_KEY;
  const agentPrivateKey = process.env.LIQX_AGENT_PRIVATE_KEY as Hex;

  if (!apiKey || !agentPrivateKey) {
    throw new Error("Missing Crossmint API Key or Agent Private Key");
  }

  // 1. Initialize the Agent Account
  const agentAccount = privateKeyToAccount(agentPrivateKey);
  
  // 2. Build the request to Crossmint to execute via Delegated Signer
  // This endpoint typically expects the transaction details and the agent's signature
  // or it handles the signing internally if the key is managed by Crossmint.
  // Since we are managing the key ("Shared Operator Key"), we sign the request.
  
  const response = await fetch(`${CROSSMINT_API_URL}/v1-alpha1/wallets/${userWalletAddress}/transactions`, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      params: {
        to: transaction.to,
        data: transaction.data,
        value: transaction.value || "0",
      },
      signer: `evm-key-pair:${agentAccount.address}`, // Identify which delegated signer is acting
      chain,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Execution error: ${JSON.stringify(error)}`);
  }

  return response.json();
}

export async function registerDelegatedSigner(
  walletLocator: string,
  signerPublicKey: string,
  chain: string = "base"
) {
  const apiKey = process.env.CROSSMINT_SERVER_SIDE_API_KEY;
  
  if (!apiKey) {
    throw new Error("CROSSMINT_SERVER_SIDE_API_KEY is not configured");
  }

  const response = await fetch(`${CROSSMINT_API_URL}/v1-alpha1/wallets/${walletLocator}/signers`, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      signer: {
        type: "evm-key-pair",
        publicKey: signerPublicKey,
      },
      chain,
      // Optional: Add permissions here
      // For example, restrict to specific contracts
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Crossmint API error: ${JSON.stringify(error)}`);
  }

  return response.json();
}

export async function getDelegatedSigners(walletLocator: string) {
  const apiKey = process.env.CROSSMINT_SERVER_SIDE_API_KEY;

  if (!apiKey) {
    throw new Error("CROSSMINT_SERVER_SIDE_API_KEY is not configured");
  }

  const response = await fetch(`${CROSSMINT_API_URL}/v1-alpha1/wallets/${walletLocator}/signers`, {
    method: "GET",
    headers: {
      "X-API-KEY": apiKey,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Crossmint API error: ${JSON.stringify(error)}`);
  }

  return response.json();
}

/**
 * DEPRECATED: Phase 5 - Replaced by ZeroDev execution
 * See: lib/agent/rebalance-executor.ts for new implementation
 */

/**
 * Get status of a transaction task from Crossmint
 */
async function getTaskStatus(
  userAddress: string,
  taskId: string
): Promise<{ status: string; transactionHash?: string; gasUsed?: string; error?: string }> {
  const apiKey = process.env.CROSSMINT_SERVER_SIDE_API_KEY;

  if (!apiKey) {
    throw new Error("CROSSMINT_SERVER_SIDE_API_KEY is not configured");
  }

  const response = await fetch(
    `${CROSSMINT_API_URL}/v1-alpha1/wallets/${userAddress}/transactions/${taskId}`,
    {
      method: "GET",
      headers: {
        "X-API-KEY": apiKey,
      },
    }
  );

  if (!response.ok) {
    return { status: 'error', error: 'Failed to fetch task status' };
  }

  return response.json();
}

/**
 * DEPRECATED: Phase 5 - No longer needed with ZeroDev
 * ZeroDev bundler handles retry logic and gas estimation automatically
 */
