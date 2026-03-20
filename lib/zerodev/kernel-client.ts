/**
 * Shared ZeroDev Kernel client factory (EIP-7702)
 *
 * Two execution paths:
 * 1. createDeserializedKernelClient() — RECOMMENDED: Uses serialized account from
 *    client-side registration (includes enable signature, no sudo needed)
 * 2. createSessionKernelClient() — LEGACY: Builds account from raw session key
 *    (will fail with "sudo validator not set" for first UserOp)
 */

import { createPublicClient, http, type Hex } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { checkSmartAccountActive, type DelegationStatus } from "./client-secure";
import { CHAIN_CONFIG } from "@/lib/config";

import { ENTRYPOINT_V07 } from "@/lib/zerodev/constants";

/**
 * Create a ZeroDev Kernel client from a serialized permission account.
 *
 * This is the RECOMMENDED path for server-side execution. The serialized account
 * was created client-side during registration using serializePermissionAccount(),
 * which captures the enable signature from the EOA (sudo). The server deserializes
 * it and gets a fully configured kernel account — no EOA private key needed.
 *
 * Handles the "duplicate permissionHash" issue: The Kernel V3.3 only allows one
 * installation per validator contract. After the first UserOp installs the permission,
 * all subsequent deserializations must skip the enable signature. We detect this by
 * checking if the delegation code is already on-chain.
 *
 * @param serializedAccount - Base64 serialized permission account from registration
 * @returns A kernel client ready to call sendUserOperation()
 */
export async function createDeserializedKernelClient(
  serializedAccount: string,
  options?: { preInstalled?: boolean }
) {
  console.log("[KernelClient] Creating kernel client from serialized account...");

  const shouldPatch = options?.preInstalled ?? false;

  // NOTE: EIP-7702 authorization nonce replay protection is handled by the protocol.
  // The authorization nonce is the EOA's transaction nonce at signing time.
  // Once the delegation tx is mined, that nonce is consumed and cannot be replayed.
  // The EntryPoint contract also manages UserOp nonces independently via 2D nonces.

  const kernelClient = await _buildKernelClient(serializedAccount, shouldPatch);

  // Wrap sendUserOperation with automatic retry for "duplicate permissionHash".
  // After re-registration with a new permissionHash, the first UserOp installs the validator
  // (enable signature included). On subsequent calls, the enable signature causes "duplicate
  // permissionHash" — we catch this and retry with preInstalled=true (skipping enable sig).
  // This is transparent to all callers — no executor changes needed.
  if (!shouldPatch) {
    const originalSendUserOp = kernelClient.sendUserOperation.bind(kernelClient);
    kernelClient.sendUserOperation = async (args: any) => {
      try {
        return await originalSendUserOp(args);
      } catch (error: any) {
        const isDuplicate =
          error?.details?.includes?.("duplicate permissionHash") ||
          error?.message?.includes?.("duplicate permissionHash");
        if (!isDuplicate) throw error;

        console.log("[KernelClient] duplicate permissionHash — retrying with preInstalled=true");
        const patchedClient = await _buildKernelClient(serializedAccount, true);
        return await patchedClient.sendUserOperation(args);
      }
    };
  }

  return kernelClient;
}

/** Internal: build a kernel client with or without enable signature */
async function _buildKernelClient(serializedAccount: string, preInstalled: boolean) {
  const publicClient = createPublicClient({
    chain: base,
    transport: http(CHAIN_CONFIG.rpcUrl),
  });

  const { createKernelAccountClient } = await import("@zerodev/sdk");
  const { KERNEL_V3_3 } = await import("@zerodev/sdk/constants");
  const { deserializePermissionAccount } = await import("@zerodev/permissions");

  const effectiveAccount = preInstalled
    ? patchSerializedAccount(serializedAccount)
    : serializedAccount;

  const logSuffix = preInstalled ? " (preInstalled=true)" : " (with enable signature)";
  console.log("[KernelClient] Deserializing account" + logSuffix);

  const kernelAccount = await deserializePermissionAccount(
    publicClient,
    ENTRYPOINT_V07,
    KERNEL_V3_3,
    effectiveAccount
  );

  console.log("[KernelClient] Account deserialized:", kernelAccount.address);

  // Fix AA14/AA20: deserializePermissionAccount restores factory/factoryData from serialization,
  // but the factory's CREATE2 address won't match our account address (we set it explicitly).
  // Strategy: check on-chain code to decide what to do.
  const onChainCode = await publicClient.getCode({ address: kernelAccount.address });
  const isDeployed = onChainCode && onChainCode !== "0x";
  const { factory: origFactory } = await kernelAccount.getFactoryArgs();

  if (isDeployed && origFactory) {
    // Account deployed on-chain — strip factory to prevent AA14
    console.log("[KernelClient] Account deployed on-chain — stripping factory to prevent AA14");
    kernelAccount.getFactoryArgs = async () => ({ factory: undefined, factoryData: undefined });
  } else if (!isDeployed && origFactory) {
    // Account NOT deployed and has factory data. The factory from our serialization creates
    // a wallet at a different address than the Privy smart wallet (different validators/salt).
    // We can't use it (AA14) and we can't strip it (AA20).
    // The Privy smart wallet must be deployed first via a Privy transaction.
    throw new Error(
      "Smart wallet not yet deployed on-chain. " +
        "Please make any transaction through your wallet first to activate it, then retry."
    );
  }

  const bundlerUrl =
    process.env.ZERODEV_BUNDLER_URL ||
    `https://rpc.zerodev.app/api/v3/${process.env.ZERODEV_PROJECT_ID}/chain/8453`;

  const kernelClient = await createKernelAccountClient({
    account: kernelAccount,
    chain: base,
    bundlerTransport: http(bundlerUrl),
  });

  console.log("[KernelClient] Kernel client created from deserialized account");
  return kernelClient;
}

/**
 * Send a UserOp with AA23 retry logic.
 *
 * The Kernel V3.3 permission validator requires an enable signature on the FIRST UserOp
 * to install the permission set. Subsequent UserOps MUST skip it (isPreInstalled=true)
 * or they get AA23 "duplicate permissionHash".
 *
 * Strategy: try with preInstalled=true first (optimized for the common case where
 * the permission is already installed). If AA23, retry without the patch (new permission
 * set after re-registration needs the enable signature to install).
 */
export async function sendUserOperationWithRetry(
  serializedAccount: string,
  calls: any[]
): Promise<{ userOpHash: string; kernelClient: any }> {
  // Common case: permission already installed → skip enable signature
  let kernelClient = await createDeserializedKernelClient(serializedAccount, {
    preInstalled: true,
  });
  try {
    const userOpHash = await kernelClient.sendUserOperation({ calls });
    return { userOpHash, kernelClient };
  } catch (firstError: any) {
    const isAA23 =
      firstError?.details?.includes?.("AA23") || firstError?.message?.includes?.("AA23");
    if (!isAA23) throw firstError;

    // AA23 with preInstalled=true → new permission set after re-registration.
    // Retry with enable signature to install the new permission validator.
    console.log("[KernelClient] AA23 with preInstalled=true — retrying with enable signature");
    kernelClient = await createDeserializedKernelClient(serializedAccount);
    const userOpHash = await kernelClient.sendUserOperation({ calls });
    return { userOpHash, kernelClient };
  }
}

/**
 * Patch serialized account to skip the enable signature.
 * Used when the permission validator is already installed on-chain
 * (e.g., after the first UserOp with this permission set succeeded).
 */
function patchSerializedAccount(serializedAccount: string): string {
  try {
    const decoded = Buffer.from(serializedAccount, "base64").toString("utf-8");
    const params = JSON.parse(decoded);
    if (params.isPreInstalled) return serializedAccount;

    console.log("[KernelClient] Patching isPreInstalled=true (permission already installed)");
    params.isPreInstalled = true;
    params.enableSignature = undefined;
    return Buffer.from(JSON.stringify(params)).toString("base64");
  } catch (error) {
    console.error("[KernelClient] Failed to patch serialized account:", error);
    return serializedAccount;
  }
}

export interface CreateSessionKernelClientParams {
  /** The account address (EOA address with EIP-7702 delegation) */
  smartAccountAddress: `0x${string}`;
  sessionPrivateKey: `0x${string}`;
  permissions: Array<{ target: `0x${string}`; selector: Hex }>;
  /** Stored signed EIP-7702 authorization (serialized — bigints as strings) */
  eip7702SignedAuth?: any;
}

/**
 * Deserialize signed EIP-7702 authorization from JSON storage.
 * Restores `v` from string back to bigint for the ZeroDev SDK.
 */
function deserializeSignedAuth(auth: any) {
  const v = auth.v != null ? BigInt(auth.v) : undefined;
  return {
    ...auth,
    v,
    yParity: v != null ? Number(v) : undefined,
  };
}

/**
 * @deprecated Use createDeserializedKernelClient() instead.
 * This legacy function will fail with "sudo validator not set" for first UserOp
 * because it creates the kernel account without the EOA sudo validator.
 *
 * Kept for backward compatibility with old registrations.
 */
export async function createSessionKernelClient(params: CreateSessionKernelClientParams) {
  // 1. Create session key signer from private key
  const sessionKeySigner = privateKeyToAccount(params.sessionPrivateKey);

  // 2. Create public client (use configured RPC URL, not rate-limited public endpoint)
  const publicClient = createPublicClient({
    chain: base,
    transport: http(CHAIN_CONFIG.rpcUrl),
  });

  // 3. Import ZeroDev SDK (dynamic to avoid bundling issues)
  const { createKernelAccount, createKernelAccountClient } = await import("@zerodev/sdk");
  const { KERNEL_V3_3 } = await import("@zerodev/sdk/constants");
  const { toPermissionValidator } = await import("@zerodev/permissions");
  const { toCallPolicy, CallPolicyVersion, toGasPolicy, toRateLimitPolicy } = await import(
    "@zerodev/permissions/policies"
  );
  const { toECDSASigner } = await import("@zerodev/permissions/signers");

  // 4. Convert session key to ModularSigner
  const sessionSigner = await toECDSASigner({ signer: sessionKeySigner });

  // 5. Build policy — requires explicit permissions
  if (params.permissions.length === 0) {
    throw new Error(
      "Session key requires explicit permissions. No permissions provided — " +
        "user must re-register with approved vaults to generate scoped CallPolicy."
    );
  }

  const policy = toCallPolicy({
    policyVersion: CallPolicyVersion.V0_0_5,
    permissions: params.permissions,
  });

  // Gas policy: cap gas spend per UserOp (500k gas in wei on Base ~0.1 gwei)
  const gasPolicy = toGasPolicy({
    allowed: BigInt(500_000) * BigInt(100_000_000), // 500k gas * 0.1 gwei
  });

  // Rate limit policy: max 10 operations per 24 hours
  const rateLimitPolicy = toRateLimitPolicy({
    count: 10,
    interval: 86400, // 24 hours in seconds
  });

  // 6. Create permission validator
  const permissionValidator = await toPermissionValidator(publicClient, {
    signer: sessionSigner,
    entryPoint: ENTRYPOINT_V07,
    policies: [policy, gasPolicy, rateLimitPolicy],
    kernelVersion: KERNEL_V3_3,
  });

  // 6.5. Check delegation status on-chain
  const delegationStatus = await checkSmartAccountActive(params.smartAccountAddress);

  console.log("[KernelClient] Delegation status:", {
    address: params.smartAccountAddress,
    ...delegationStatus,
  });

  // 7. Create Kernel account using the stored address
  const accountOptions: any = {
    plugins: {
      regular: permissionValidator,
    },
    entryPoint: ENTRYPOINT_V07,
    kernelVersion: KERNEL_V3_3,
    address: params.smartAccountAddress,
  };

  if (delegationStatus.active && delegationStatus.isDelegation) {
    // Delegation IS on-chain — verify it points to the correct Kernel V3.3 implementation
    const { KernelVersionToAddressesMap } = await import("@zerodev/sdk/constants");
    const expectedImpl = KernelVersionToAddressesMap[KERNEL_V3_3].accountImplementationAddress;
    if (delegationStatus.implementationAddress?.toLowerCase() !== expectedImpl.toLowerCase()) {
      throw new Error(
        `EIP-7702 delegation mismatch: delegated to ${delegationStatus.implementationAddress}, expected ${expectedImpl}`
      );
    }
    // Still pass eip7702Auth to keep isEip7702=true in the SDK.
    // The SDK's signAuthorization detects active delegation and skips redundant auth,
    // but isEip7702=true ensures correct signing paths (ERC-1271, typed data).
    // Pattern matches ZeroDev's deserializePermissionAccount: eip7702Auth without eip7702Account.
    if (params.eip7702SignedAuth) {
      accountOptions.eip7702Auth = deserializeSignedAuth(params.eip7702SignedAuth);
    }
    console.log(
      "[KernelClient] ✓ Delegation active & verified, isEip7702=" + !!params.eip7702SignedAuth
    );
  } else if (params.eip7702SignedAuth) {
    // Delegation NOT on-chain — first UserOp must include Type 4 auth via bundler.
    // We intentionally omit eip7702Account: the SDK falls back to addressToEmptyAccount()
    // which is correct since the EOA private key is only available client-side (Privy).
    // This matches ZeroDev's deserializePermissionAccount pattern exactly.
    // The session key signs through plugins.regular (permissionValidator), not sudo.
    accountOptions.eip7702Auth = deserializeSignedAuth(params.eip7702SignedAuth);
    console.log("[KernelClient] Delegation not on-chain, passing eip7702Auth (no eip7702Account)");
  } else {
    throw new Error(
      "Delegation not active on-chain and no eip7702Auth stored. User must re-register."
    );
  }

  const kernelAccount = await createKernelAccount(publicClient, accountOptions);

  // Verify the kernel account address matches what was stored
  if (kernelAccount.address.toLowerCase() !== params.smartAccountAddress.toLowerCase()) {
    console.error("[KernelClient] ⚠️ Address mismatch!", {
      computed: kernelAccount.address,
      stored: params.smartAccountAddress,
    });
  } else {
    console.log("[KernelClient] ✓ Address verified:", kernelAccount.address);
  }

  // 8. Create Kernel account client with bundler
  const bundlerUrl =
    process.env.ZERODEV_BUNDLER_URL ||
    `https://rpc.zerodev.app/api/v3/${process.env.ZERODEV_PROJECT_ID}/chain/8453`;

  const kernelClient = await createKernelAccountClient({
    account: kernelAccount,
    chain: base,
    bundlerTransport: http(bundlerUrl),
  });

  return kernelClient;
}

/**
 * Verify EIP-7702 delegation is active on-chain after a UserOp execution.
 * Call this after the first UserOp to confirm the bundler included the SetCode transaction.
 *
 * @returns true if delegation is confirmed, false if missing or invalid
 */
export async function verifyDelegationAfterExecution(
  address: `0x${string}`,
  txHash: string
): Promise<boolean> {
  const verifyClient = createPublicClient({
    chain: base,
    transport: http(CHAIN_CONFIG.rpcUrl),
  });

  // Wait for receipt to ensure tx is confirmed
  await verifyClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });

  // Verify delegation bytecode
  const status = await checkSmartAccountActive(address);

  if (!status.active || !status.isDelegation) {
    console.error("[KernelClient] CRITICAL: Delegation not active after UserOp!", {
      address,
      txHash,
      status,
    });
    return false;
  }

  console.log("[KernelClient] ✓ Delegation confirmed after execution:", {
    address,
    implementationAddress: status.implementationAddress,
  });
  return true;
}
