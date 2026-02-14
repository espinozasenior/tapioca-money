/**
 * Shared ZeroDev Kernel client factory (EIP-7702)
 *
 * Creates kernel clients for server-side execution using session keys.
 * The EIP-7702 delegation is already on-chain (done during registration),
 * so the kernel client just needs the EOA address to send UserOps.
 */

import { createPublicClient, http, type Hex } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { checkSmartAccountActive, type DelegationStatus } from './client-secure';

// EntryPoint V0.7 object (required format for ZeroDev SDK v5)
const ENTRYPOINT_V07 = {
  address: "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as `0x${string}`,
  version: "0.7" as const,
};

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
  return {
    ...auth,
    v: auth.v != null ? BigInt(auth.v) : undefined,
  };
}

/**
 * Create a ZeroDev Kernel client from a session key with scoped permissions.
 *
 * Handles the full setup chain:
 *   session private key → ECDSA signer → call policy → permission validator
 *   → kernel account → kernel client (with bundler transport)
 *
 * With EIP-7702, the EOA already has Kernel code delegated on-chain during
 * registration. At execution time, we use the `address` parameter to tell
 * the SDK where to send UserOps.
 *
 * @returns A kernel client ready to call sendUserOperation()
 */
export async function createSessionKernelClient(params: CreateSessionKernelClientParams) {
  // 1. Create session key signer from private key
  const sessionKeySigner = privateKeyToAccount(params.sessionPrivateKey);

  // 2. Create public client
  const publicClient = createPublicClient({
    chain: base,
    transport: http(),
  });

  // 3. Import ZeroDev SDK (dynamic to avoid bundling issues)
  const { createKernelAccount, createKernelAccountClient } = await import('@zerodev/sdk');
  const { KERNEL_V3_3 } = await import('@zerodev/sdk/constants');
  const { toPermissionValidator } = await import('@zerodev/permissions');
  const { toCallPolicy, toSudoPolicy, CallPolicyVersion, toGasPolicy, toRateLimitPolicy } = await import('@zerodev/permissions/policies');
  const { toECDSASigner } = await import('@zerodev/permissions/signers');

  // 4. Convert session key to ModularSigner
  const sessionSigner = await toECDSASigner({ signer: sessionKeySigner });

  // 5. Build policy — scoped if permissions provided, sudo fallback otherwise
  const policy = params.permissions.length > 0
    ? toCallPolicy({
        policyVersion: CallPolicyVersion.V0_0_5,
        permissions: params.permissions,
      })
    : toSudoPolicy({});

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

  console.log('[KernelClient] Delegation status:', {
    address: params.smartAccountAddress,
    ...delegationStatus,
  });

  // Validate delegation target matches Kernel V3.3
  if (delegationStatus.active && delegationStatus.isDelegation) {
    const { KernelVersionToAddressesMap } = await import('@zerodev/sdk/constants');
    const expectedImpl = KernelVersionToAddressesMap[KERNEL_V3_3].accountImplementationAddress;
    if (delegationStatus.implementationAddress?.toLowerCase() !== expectedImpl.toLowerCase()) {
      throw new Error(
        `EIP-7702 delegation mismatch: delegated to ${delegationStatus.implementationAddress}, expected ${expectedImpl}`
      );
    }
    console.log('[KernelClient] ✓ Delegation target verified:', delegationStatus.implementationAddress);
  }

  // 7. Create Kernel account using the stored address
  // EIP-7702: EOA already has Kernel code delegated on-chain
  // We pass the address so the SDK knows where to send UserOps
  const accountOptions: any = {
    plugins: {
      regular: permissionValidator,
    },
    entryPoint: ENTRYPOINT_V07,
    kernelVersion: KERNEL_V3_3,
    address: params.smartAccountAddress,
  };

  // Pass signed auth so SDK sets isEip7702=true → no factory initCode → no AA14
  if (params.eip7702SignedAuth) {
    accountOptions.eip7702Auth = deserializeSignedAuth(params.eip7702SignedAuth);
    console.log('[KernelClient] Using stored EIP-7702 authorization (isEip7702=true)');
  } else if (!delegationStatus.active) {
    console.log('[KernelClient] Account not deployed yet and no eip7702Auth - SDK will generate initCode');
  }

  const kernelAccount = await createKernelAccount(publicClient, accountOptions);

  // Verify the kernel account address matches what was stored
  if (kernelAccount.address.toLowerCase() !== params.smartAccountAddress.toLowerCase()) {
    console.error('[KernelClient] ⚠️ Address mismatch!', {
      computed: kernelAccount.address,
      stored: params.smartAccountAddress,
    });
  } else {
    console.log('[KernelClient] ✓ Address verified:', kernelAccount.address);
  }

  // 8. Create Kernel account client with bundler
  const bundlerUrl = process.env.ZERODEV_BUNDLER_URL ||
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
  const publicClient = createPublicClient({
    chain: base,
    transport: http(),
  });

  // Wait for receipt to ensure tx is confirmed
  await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });

  // Verify delegation bytecode
  const status = await checkSmartAccountActive(address);

  if (!status.active || !status.isDelegation) {
    console.error('[KernelClient] CRITICAL: Delegation not active after UserOp!', {
      address,
      txHash,
      status,
    });
    return false;
  }

  console.log('[KernelClient] ✓ Delegation confirmed after execution:', {
    address,
    implementationAddress: status.implementationAddress,
  });
  return true;
}
