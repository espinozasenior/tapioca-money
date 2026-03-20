/**
 * Client Secure — Thin orchestration layer + re-exports.
 *
 * Delegates to focused modules:
 * - permission-builder.ts — session key generation + CallPolicy
 * - account-serializer.ts — kernel account creation + serialization
 * - delegation-checker.ts — EIP-7702 delegation status checks
 * - client-secure-types.ts — shared type definitions
 *
 * All existing exports remain accessible from this module (backward compatible).
 */

import { base } from "viem/chains";
import { baseClient } from "@/lib/shared/rpc-client";

// ── Re-exports (preserves all existing import paths) ──────────────────────────
export { buildSessionKeyAndPermissions } from "./permission-builder";
export {
  createAndSerializeAccount,
  createAndSerializeAccountExternal,
  createAndSerializeAccountErc4337,
} from "./account-serializer";
export type { SerializedAccountResult } from "./account-serializer";
export { checkSmartAccountActive } from "./delegation-checker";
export type { DelegationStatus } from "./delegation-checker";
export type {
  SignedEip7702Authorization,
  DecryptedAuthorization,
  SecureSessionKeyResult,
  WalletClientSigner,
} from "./client-secure-types";

// Re-import types/functions needed by orchestration code in this file
import { checkSmartAccountActive } from "./delegation-checker";
import {
  createAndSerializeAccount,
  createAndSerializeAccountExternal,
  createAndSerializeAccountErc4337,
} from "./account-serializer";
import type {
  SignedEip7702Authorization,
  SecureSessionKeyResult,
  WalletClientSigner,
} from "./client-secure-types";

/**
 * Serialize signed EIP-7702 authorization for JSON transport.
 * `bigint` fields (like `v`) are not JSON-serializable — convert to string.
 */
export function serializeSignedAuth(auth: Record<string, any>) {
  // Normalize v/yParity: Privy returns yParity, ZeroDev SDK may expect v (BigInt)
  const yParity = auth.yParity ?? auth.v;
  return {
    ...auth,
    v: yParity != null ? yParity.toString() : undefined,
    yParity: yParity != null ? Number(yParity) : undefined,
    chainId: Number(auth.chainId),
    nonce: Number(auth.nonce),
  };
}

// ── Shared registration orchestrator ──────────────────────────────────────────

/**
 * Fetch approved vaults from the optimizer API and add YO Gateway + Merkl Distributor.
 * Shared across all registration paths.
 */
async function fetchApprovedVaults(): Promise<`0x${string}`[]> {
  const optimizeResponse = await fetch("/api/optimize");
  if (!optimizeResponse.ok) {
    throw new Error("Failed to fetch vault opportunities");
  }
  const { opportunities } = await optimizeResponse.json();
  const approvedVaults = opportunities
    .filter((o: any) => o.metadata?.vaultAddress)
    .map((o: any) => o.metadata.vaultAddress) as `0x${string}`[];

  // Include YO Gateway + Merkl Distributor for session key scoping
  const { YO_GATEWAY_ADDRESS, MERKL_DISTRIBUTOR_ADDRESS_BASE } = await import("@/lib/yo/constants");
  if (!approvedVaults.some((v) => v.toLowerCase() === YO_GATEWAY_ADDRESS.toLowerCase())) {
    approvedVaults.push(YO_GATEWAY_ADDRESS as `0x${string}`);
  }
  if (
    !approvedVaults.some((v) => v.toLowerCase() === MERKL_DISTRIBUTOR_ADDRESS_BASE.toLowerCase())
  ) {
    approvedVaults.push(MERKL_DISTRIBUTOR_ADDRESS_BASE as `0x${string}`);
  }

  return approvedVaults;
}

/**
 * Store serialized account on the server.
 * Shared across all registration paths.
 */
async function storeSessionOnServer(params: {
  accessToken: string;
  address: `0x${string}`;
  smartAccountAddress: `0x${string}`;
  sessionKeyAddress: `0x${string}`;
  serializedAccount: string;
  approvedVaults: `0x${string}`[];
  expiry: number;
  type?: string;
}): Promise<void> {
  const sessionKeyResponse = await fetch("/api/agent/generate-session-key", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: JSON.stringify({
      address: params.address,
      smartAccountAddress: params.smartAccountAddress,
      sessionKeyAddress: params.sessionKeyAddress,
      serializedAccount: params.serializedAccount,
      approvedVaults: params.approvedVaults,
      expiry: params.expiry,
      ...(params.type ? { type: params.type } : {}),
    }),
  });

  if (!sessionKeyResponse.ok) {
    const error = await sessionKeyResponse.json();
    throw new Error(error.error || "Failed to store session data");
  }
}

// ── Discriminated union for registration params ───────────────────────────────

type RegisterAgentParams =
  | {
      path: "eip7702";
      userAddress: `0x${string}`;
      accessToken: string;
      signedEip7702Auth: SignedEip7702Authorization;
      walletClient: WalletClientSigner;
    }
  | {
      path: "external";
      userAddress: `0x${string}`;
      accessToken: string;
      walletClient: WalletClientSigner;
    }
  | {
      path: "erc4337";
      smartWalletAddress: `0x${string}`;
      eoaAddress: `0x${string}`;
      accessToken: string;
      walletClient: WalletClientSigner;
    };

/**
 * Unified agent registration orchestrator.
 *
 * All three paths share the same structure:
 * 1. Fetch vaults from /api/optimize
 * 2. (Optional) Pre-checks (delegation verification for external)
 * 3. Create + serialize the kernel account via path-specific serializer
 * 4. POST serialized data to /api/agent/generate-session-key
 */
async function registerAgent(params: RegisterAgentParams): Promise<SecureSessionKeyResult> {
  const logPrefix = params.path === "erc4337" ? "[ZeroDev 4337]" : "[ZeroDev 7702]";

  // Determine addresses based on path
  const userAddress = params.path === "erc4337" ? params.eoaAddress : params.userAddress;
  const smartAccountAddress =
    params.path === "erc4337" ? params.smartWalletAddress : params.userAddress;

  console.log(`${logPrefix} Starting ${params.path} registration...`);
  console.log(`${logPrefix} User:`, userAddress);
  if (params.path === "erc4337") {
    console.log(`${logPrefix} Smart wallet:`, params.smartWalletAddress);
  }

  // Pre-check: external path requires on-chain delegation
  if (params.path === "external") {
    const delegationStatus = await checkSmartAccountActive(params.userAddress);
    if (!delegationStatus.active || !delegationStatus.isDelegation) {
      throw new Error("Delegation not found on-chain. Call delegateViaExternalWallet first.");
    }
  }

  // 1. Fetch approved vaults
  console.log(`${logPrefix} Fetching vault opportunities...`);
  const approvedVaults = await fetchApprovedVaults();
  console.log(
    `${logPrefix} Fetched`,
    approvedVaults.length,
    "vaults (including YO Gateway + Merkl)"
  );

  // 2. Create and serialize the kernel account (path-specific)
  let serializedResult: {
    serializedAccount: string;
    sessionKeyAddress: `0x${string}`;
    expiry: number;
  };

  switch (params.path) {
    case "eip7702":
      serializedResult = await createAndSerializeAccount(
        params.userAddress,
        params.signedEip7702Auth,
        params.walletClient,
        approvedVaults
      );
      break;
    case "external":
      serializedResult = await createAndSerializeAccountExternal(
        params.userAddress,
        params.walletClient,
        approvedVaults
      );
      break;
    case "erc4337":
      serializedResult = await createAndSerializeAccountErc4337(
        params.smartWalletAddress,
        params.walletClient,
        approvedVaults
      );
      break;
  }

  const { serializedAccount, sessionKeyAddress, expiry } = serializedResult;

  // 3. Store on server
  console.log(`${logPrefix} Sending serialized account to server...`);
  await storeSessionOnServer({
    accessToken: params.accessToken,
    address: userAddress,
    smartAccountAddress,
    sessionKeyAddress,
    serializedAccount,
    approvedVaults,
    expiry,
    type: params.path === "erc4337" ? "zerodev-erc4337-session" : undefined,
  });

  if (process.env.NODE_ENV === "development") {
    console.log(`${logPrefix} Session key:`, sessionKeyAddress);
    console.log(`${logPrefix} Expiry:`, new Date(expiry * 1000).toISOString());
  }
  console.log(`${logPrefix} Registration complete`);

  return {
    smartAccountAddress,
    sessionKeyAddress: sessionKeyAddress as `0x${string}`,
    expiry,
    approvedVaults,
  };
}

// ── Backward-compatible wrapper functions ─────────────────────────────────────

/**
 * Register agent with secure server-side execution (EIP-7702 path).
 */
export async function registerAgentSecure(
  userAddress: `0x${string}`,
  accessToken: string,
  signedEip7702Auth: SignedEip7702Authorization,
  walletClient: WalletClientSigner
): Promise<SecureSessionKeyResult> {
  try {
    return await registerAgent({
      path: "eip7702",
      userAddress,
      accessToken,
      signedEip7702Auth,
      walletClient,
    });
  } catch (error: any) {
    console.error("[ZeroDev 7702] Registration failed:", error);
    throw new Error(`Smart account setup failed: ${error.message}`);
  }
}

/**
 * Register agent for an external wallet (Brave, MetaMask).
 * Assumes delegation is already on-chain (via delegateViaExternalWallet).
 */
export async function registerAgentSecureExternal(
  userAddress: `0x${string}`,
  accessToken: string,
  walletClient: WalletClientSigner
): Promise<SecureSessionKeyResult> {
  try {
    return await registerAgent({
      path: "external",
      userAddress,
      accessToken,
      walletClient,
    });
  } catch (error: any) {
    console.error("[ZeroDev 7702] External wallet registration failed:", error);
    throw new Error(`External wallet registration failed: ${error.message}`);
  }
}

/**
 * Register agent via ERC-4337 fallback (Privy smart wallet).
 */
export async function registerAgentErc4337(
  smartWalletAddress: `0x${string}`,
  eoaAddress: `0x${string}`,
  accessToken: string,
  walletClient: WalletClientSigner
): Promise<SecureSessionKeyResult> {
  try {
    return await registerAgent({
      path: "erc4337",
      smartWalletAddress,
      eoaAddress,
      accessToken,
      walletClient,
    });
  } catch (error: any) {
    console.error("[ZeroDev 4337] Registration failed:", error);
    throw new Error(`ERC-4337 registration failed: ${error.message}`);
  }
}

// ── Functions kept in this file (orchestration-level) ─────────────────────────

/**
 * Delegate an external wallet (Brave, MetaMask) to Kernel V3.3 via a Type 4 transaction.
 */
export async function delegateViaExternalWallet(
  walletClient: WalletClientSigner,
  userAddress: `0x${string}`,
  implAddress: `0x${string}`
): Promise<`0x${string}`> {
  console.log("[ZeroDev 7702] Delegating external wallet to Kernel V3.3...");
  console.log("[ZeroDev 7702] User:", userAddress, "→ Impl:", implAddress);

  const publicClient = baseClient;

  // Pre-check: query wallet_getCapabilities to see if EIP-7702 is supported.
  let has7702Support = false;
  try {
    const capabilities: Record<string, any> = await walletClient.request!({
      method: "wallet_getCapabilities",
      params: [userAddress],
    });
    const baseCaps = capabilities?.["0x2105"] ?? capabilities?.[8453] ?? capabilities?.["8453"];
    has7702Support = !!(
      baseCaps?.atomicBatch?.supported ||
      baseCaps?.atomic?.status === "supported" ||
      baseCaps?.atomic?.status === "ready"
    );
    console.log("[ZeroDev 7702] Wallet capabilities:", { baseCaps, has7702Support });
  } catch {
    console.log("[ZeroDev 7702] wallet_getCapabilities not available");
  }

  if (!has7702Support) {
    throw new Error(
      "Your wallet does not support EIP-7702 delegation yet. " +
        "Please switch to your Privy embedded wallet in the wallet selector to register the agent."
    );
  }

  // Ensure the external wallet is on Base before sending the Type 4 tx.
  try {
    await walletClient.switchChain!({ id: base.id });
  } catch (switchError: any) {
    if (switchError?.code === 4902) {
      await walletClient.addChain!({ chain: base });
      await walletClient.switchChain!({ id: base.id });
    } else {
      throw new Error(
        `Please switch your wallet to Base network. Chain switch failed: ${switchError.message}`
      );
    }
  }

  // Send Type 4 transaction via raw JSON-RPC.
  const { numberToHex } = await import("viem");
  const txHash: `0x${string}` = await walletClient.request!({
    method: "eth_sendTransaction",
    params: [
      {
        type: "0x4",
        from: userAddress,
        to: userAddress,
        data: "0x",
        value: "0x0",
        authorizationList: [
          {
            address: implAddress,
            chainId: numberToHex(8453),
          },
        ],
      },
    ],
  });

  console.log("[ZeroDev 7702] Delegation tx submitted:", txHash);

  // Wait for confirmation and verify the tx was actually Type 4
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log("[ZeroDev 7702] Delegation tx confirmed, type:", receipt.type);

  if (receipt.type !== "eip7702") {
    throw new Error(
      "Wallet sent a regular transaction instead of EIP-7702 Type 4. " +
        "Your wallet does not fully support EIP-7702. " +
        "Please switch to your Privy embedded wallet to register the agent."
    );
  }

  // Verify delegation on-chain
  const status = await checkSmartAccountActive(userAddress);
  if (!status.active || !status.isDelegation) {
    throw new Error(
      "EIP-7702 transaction confirmed but delegation not detected on-chain. " +
        "Please switch to your Privy embedded wallet to register the agent."
    );
  }

  console.log("[ZeroDev 7702] Delegation verified on-chain:", status.implementationAddress);
  return txHash;
}

/**
 * Revoke session key (soft revoke — calls server to delete encrypted key)
 * Agent stops immediately since the session key is deleted from DB.
 */
export async function revokeSessionKey(address: string, accessToken: string): Promise<void> {
  const response = await fetch("/api/agent/generate-session-key", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ address }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to revoke session key");
  }

  console.log("[ZeroDev 7702] Session key revoked (soft)");
}

/**
 * Undelegate EOA from Kernel (remove EIP-7702 delegation on-chain).
 */
export async function undelegateEoa(
  userAddress: `0x${string}`,
  walletClient: WalletClientSigner,
  signedAuthorization: unknown
): Promise<`0x${string}`> {
  console.log("[ZeroDev 7702] Starting on-chain undelegation for:", userAddress);

  const txHash = await walletClient.sendTransaction!({
    to: userAddress,
    data: "0x" as `0x${string}`,
    value: BigInt(0),
    authorizationList: [signedAuthorization],
    gas: BigInt(30000),
  });

  console.log("[ZeroDev 7702] Undelegation tx submitted:", txHash);
  return txHash;
}
