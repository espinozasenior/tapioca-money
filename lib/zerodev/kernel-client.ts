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
import { checkSmartAccountActive } from './client-secure';

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
  const { toCallPolicy, toSudoPolicy, CallPolicyVersion } = await import('@zerodev/permissions/policies');
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

  // 6. Create permission validator
  const permissionValidator = await toPermissionValidator(publicClient, {
    signer: sessionSigner,
    entryPoint: ENTRYPOINT_V07,
    policies: [policy],
    kernelVersion: KERNEL_V3_3,
  });

  // 6.5. Check if smart account is already deployed
  const isDeployed = await checkSmartAccountActive(params.smartAccountAddress);

  console.log('[KernelClient] Account deployment status:', {
    address: params.smartAccountAddress,
    isDeployed,
  });

  // 7. Create Kernel account using the stored address
  // EIP-7702: EOA already has Kernel code delegated on-chain
  // We pass the address so the SDK knows where to send UserOps
  const accountOptions: any = {
    plugins: {
      sudo: permissionValidator,
    },
    entryPoint: ENTRYPOINT_V07,
    kernelVersion: KERNEL_V3_3,
    address: params.smartAccountAddress,
  };

  // Pass signed auth so SDK sets isEip7702=true → no factory initCode → no AA14
  if (params.eip7702SignedAuth) {
    accountOptions.eip7702Auth = deserializeSignedAuth(params.eip7702SignedAuth);
    console.log('[KernelClient] Using stored EIP-7702 authorization (isEip7702=true)');
  } else if (!isDeployed) {
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
