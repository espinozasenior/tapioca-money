/**
 * Account Serializer — Create and serialize kernel accounts for all registration paths.
 *
 * Extracted from client-secure.ts (Phase 2, DDD refactoring).
 * Three variants: EIP-7702 (Privy embedded), External wallet, ERC-4337 fallback.
 */

import { toAccount } from "viem/accounts";
import { baseClient } from "@/lib/shared/rpc-client";
import { ENTRYPOINT_V07 } from "@/lib/zerodev/constants";
import { buildSessionKeyAndPermissions } from "./permission-builder";
import type { SignedEip7702Authorization, WalletClientSigner } from "./client-secure-types";

/** Return type for all createAndSerialize* functions */
export interface SerializedAccountResult {
  serializedAccount: string;
  sessionKeyAddress: `0x${string}`;
  expiry: number;
}

/**
 * Create and serialize a kernel account client-side (EIP-7702 path).
 *
 * Uses ZeroDev's official serialize/deserialize pattern for two-party execution.
 * The client (with EOA access) creates the full kernel account, which captures
 * the enable signature from the sudo validator. The serialized data is then
 * sent to the server, which can deserialize and execute UserOps without the EOA.
 *
 * This will prompt the user to sign the enable typed data via Privy (1 extra signature).
 *
 * @param userAddress - User's EOA address
 * @param signedEip7702Auth - Raw signed EIP-7702 authorization from Privy
 * @param walletClient - Viem WalletClient from Privy provider
 * @param approvedVaults - List of approved vault addresses for scoped permissions
 */
export async function createAndSerializeAccount(
  userAddress: `0x${string}`,
  signedEip7702Auth: SignedEip7702Authorization,
  walletClient: WalletClientSigner,
  approvedVaults: `0x${string}`[]
): Promise<SerializedAccountResult> {
  console.log("[ZeroDev 7702] Creating serialized account client-side...");

  const { createKernelAccount } = await import("@zerodev/sdk");
  const { KERNEL_V3_3 } = await import("@zerodev/sdk/constants");
  const { serializePermissionAccount } = await import("@zerodev/permissions");

  const {
    sessionPrivateKey,
    sessionKeyAccount,
    permissionValidator,
    expiryTimestamp,
    publicClient,
  } = await buildSessionKeyAndPermissions(approvedVaults);

  // Wrap Privy wallet as a LocalAccount (type: "local") for the SDK
  const eoaLocalAccount = toAccount({
    address: userAddress,
    signMessage: async ({ message }) => walletClient.signMessage!({ message }),
    signTransaction: async () => {
      throw new Error("signTransaction not needed for registration");
    },
    signTypedData: async (typedData) => walletClient.signTypedData!(typedData),
  });

  // Create kernel account with EOA as sudo + session key as regular
  console.log("[ZeroDev 7702] Creating kernel account (EOA=sudo, sessionKey=regular)...");
  const kernelAccount = await createKernelAccount(publicClient, {
    plugins: {
      regular: permissionValidator,
    },
    entryPoint: ENTRYPOINT_V07,
    kernelVersion: KERNEL_V3_3,
    address: userAddress,
    eip7702Auth: signedEip7702Auth as any,
    eip7702Account: eoaLocalAccount,
  });

  console.log("[ZeroDev 7702] Kernel account created:", kernelAccount.address);

  // Serialize the account (captures enable signature via sudo/EOA signing)
  console.log("[ZeroDev 7702] Serializing account (user signs enable data)...");
  const serialized = await serializePermissionAccount(
    kernelAccount,
    sessionPrivateKey,
    undefined, // Auto-generate enable signature (sudo signs)
    signedEip7702Auth as any // Embed EIP-7702 auth
  );

  console.log("[ZeroDev 7702] Account serialized successfully");
  return {
    serializedAccount: serialized,
    sessionKeyAddress: sessionKeyAccount.address as `0x${string}`,
    expiry: expiryTimestamp,
  };
}

/**
 * Create and serialize a kernel account for an external wallet.
 *
 * Unlike createAndSerializeAccount, this function does NOT pass eip7702Auth.
 * The delegation is already on-chain (via delegateViaExternalWallet), so the SDK
 * detects it and the signAuthorization closure returns undefined — no auth in UserOps.
 *
 * The external wallet signs the enable typed data via eth_signTypedData_v4.
 */
export async function createAndSerializeAccountExternal(
  userAddress: `0x${string}`,
  walletClient: WalletClientSigner,
  approvedVaults: `0x${string}`[]
): Promise<SerializedAccountResult> {
  console.log("[ZeroDev 7702] Creating serialized account for external wallet...");

  const { createKernelAccount } = await import("@zerodev/sdk");
  const { KERNEL_V3_3 } = await import("@zerodev/sdk/constants");
  const { serializePermissionAccount } = await import("@zerodev/permissions");

  const {
    sessionPrivateKey,
    sessionKeyAccount,
    permissionValidator,
    expiryTimestamp,
    publicClient,
  } = await buildSessionKeyAndPermissions(approvedVaults);

  // Wrap external wallet as LocalAccount for the SDK
  const eoaLocalAccount = toAccount({
    address: userAddress,
    signMessage: async ({ message }) => walletClient.signMessage!({ message }),
    signTransaction: async () => {
      throw new Error("signTransaction not needed for registration");
    },
    signTypedData: async (typedData) => walletClient.signTypedData!(typedData),
  });

  // Create kernel account — NO eip7702Auth since delegation is already on-chain
  console.log("[ZeroDev 7702] Creating kernel account (delegation already on-chain)...");
  const kernelAccount = await createKernelAccount(publicClient, {
    plugins: {
      regular: permissionValidator,
    },
    entryPoint: ENTRYPOINT_V07,
    kernelVersion: KERNEL_V3_3,
    address: userAddress,
    eip7702Account: eoaLocalAccount,
  });

  console.log("[ZeroDev 7702] Kernel account created:", kernelAccount.address);

  // Serialize — NO eip7702Auth arg
  console.log("[ZeroDev 7702] Serializing account (external wallet signs enable data)...");
  const serialized = await serializePermissionAccount(
    kernelAccount,
    sessionPrivateKey,
    undefined // Auto-generate enable signature (sudo signs via external wallet)
  );

  console.log("[ZeroDev 7702] Account serialized successfully (external wallet)");
  return {
    serializedAccount: serialized,
    sessionKeyAddress: sessionKeyAccount.address as `0x${string}`,
    expiry: expiryTimestamp,
  };
}

/**
 * Create and serialize a kernel account for ERC-4337 fallback (Privy smart wallet).
 *
 * Used when the user's external wallet doesn't support EIP-7702 (e.g. Brave).
 * The account operates at the Privy Kernel smart wallet address (separate from EOA),
 * and the embedded wallet (auto-created by Privy for all users) acts as sudo signer.
 *
 * NO eip7702Auth, NO eip7702Account — this is a standard ERC-4337 kernel account.
 *
 * @param smartWalletAddress - Privy Kernel smart wallet address (where funds live)
 * @param walletClient - Viem WalletClient from embedded wallet (signer)
 * @param approvedVaults - Approved vault addresses
 */
export async function createAndSerializeAccountErc4337(
  smartWalletAddress: `0x${string}`,
  walletClient: WalletClientSigner,
  approvedVaults: `0x${string}`[]
): Promise<SerializedAccountResult> {
  console.log("[ZeroDev 4337] Creating serialized account for ERC-4337 smart wallet...");
  console.log("[ZeroDev 4337] Smart wallet:", smartWalletAddress);

  const { createKernelAccount } = await import("@zerodev/sdk");
  const { KERNEL_V3_3 } = await import("@zerodev/sdk/constants");
  const { serializePermissionAccount } = await import("@zerodev/permissions");

  const {
    sessionPrivateKey,
    sessionKeyAccount,
    permissionValidator,
    expiryTimestamp,
    publicClient,
  } = await buildSessionKeyAndPermissions(approvedVaults);

  // Wrap embedded wallet as LocalAccount for sudo signing.
  // toAccount() supports signMessage/signTypedData (delegated to walletClient).
  // IMPORTANT: Do NOT pass this as eip7702Account — the SDK would set up an
  // eip7702Authorization closure that calls signAuthorization, which toAccount()
  // does not implement (only privateKeyToAccount does). Instead, create a proper
  // ECDSA validator and pass it as plugins.sudo.
  const signerAddress = (walletClient.account?.address ?? walletClient.account) as `0x${string}`;
  const eoaLocalAccount = toAccount({
    address: signerAddress,
    signMessage: async ({ message }) => walletClient.signMessage!({ message }),
    signTransaction: async () => {
      throw new Error("signTransaction not needed for registration");
    },
    signTypedData: async (typedData) => walletClient.signTypedData!(typedData),
  });

  // Create ECDSA sudo validator from the embedded wallet signer.
  // This only uses signMessage/signTypedData — no signAuthorization needed.
  const { signerToEcdsaValidator } = await import("@zerodev/ecdsa-validator");
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: eoaLocalAccount,
    entryPoint: ENTRYPOINT_V07,
    kernelVersion: KERNEL_V3_3,
  });

  // Create kernel account — standard ERC-4337, no EIP-7702 involved.
  // Pass ECDSA validator as plugins.sudo so serializePermissionAccount can
  // generate the enable signature via signTypedData (not signAuthorization).
  console.log("[ZeroDev 4337] Creating kernel account (ERC-4337, embedded wallet=sudo)...");
  const kernelAccount = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
      regular: permissionValidator,
    },
    entryPoint: ENTRYPOINT_V07,
    kernelVersion: KERNEL_V3_3,
    address: smartWalletAddress, // The Privy smart wallet, NOT the user's EOA
    // NO eip7702Account — this is standard 4337, no signAuthorization needed
  });

  console.log("[ZeroDev 4337] Kernel account created:", kernelAccount.address);

  // Serialize — no eip7702Auth needed
  console.log("[ZeroDev 4337] Serializing account (embedded wallet signs enable data)...");
  const serialized = await serializePermissionAccount(
    kernelAccount,
    sessionPrivateKey
    // No 3rd/4th args — standard 4337 serialization
  );

  console.log("[ZeroDev 4337] Account serialized successfully");
  return {
    serializedAccount: serialized,
    sessionKeyAddress: sessionKeyAccount.address as `0x${string}`,
    expiry: expiryTimestamp,
  };
}
