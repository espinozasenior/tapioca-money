/**
 * Shared ZeroDev Kernel client factory
 * Eliminates duplicated session key → kernel client setup across executors
 */

import { createPublicClient, http, type Hex } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// EntryPoint V0.7 object (required format for ZeroDev SDK v5)
const ENTRYPOINT_V07 = {
  address: "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as `0x${string}`,
  version: "0.7" as const,
};

export interface CreateSessionKernelClientParams {
  smartAccountAddress: `0x${string}`;
  sessionPrivateKey: `0x${string}`;
  permissions: Array<{ target: `0x${string}`; selector: Hex }>;
}

/**
 * Create a ZeroDev Kernel client from a session key with scoped permissions.
 *
 * Handles the full setup chain:
 *   session private key → ECDSA signer → call policy → permission validator
 *   → kernel account → kernel client (with bundler transport)
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
  const { KERNEL_V3_1 } = await import('@zerodev/sdk/constants');
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
    kernelVersion: KERNEL_V3_1,
  });

  // 7. Create Kernel account
  const kernelAccount = await createKernelAccount(publicClient, {
    address: params.smartAccountAddress,
    plugins: {
      sudo: permissionValidator,
    },
    entryPoint: ENTRYPOINT_V07,
    kernelVersion: KERNEL_V3_1,
  });

  // 8. Create Kernel account client with bundler
  const bundlerUrl = process.env.ZERODEV_BUNDLER_URL ||
    `https://rpc.zerodev.app/api/v2/bundler/${process.env.ZERODEV_PROJECT_ID}`;

  const kernelClient = await createKernelAccountClient({
    account: kernelAccount,
    chain: base,
    bundlerTransport: http(bundlerUrl),
  });

  return kernelClient;
}
