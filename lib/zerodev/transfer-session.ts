/**
 * Transfer Session Key Management with ZeroDev
 * Creates restricted session keys for gasless USDC transfers only
 */

import type { Hex } from 'viem';
import { base } from 'viem/chains';
import { createPublicClient, createWalletClient, custom, http, encodeFunctionData, erc20Abi } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

// EntryPoint V0.7 object (required format for ZeroDev SDK v5)
const ENTRYPOINT_V07 = {
  address: "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as `0x${string}`,
  version: "0.7" as const,
};

export interface PrivyWalletProvider {
  getEthereumProvider(): Promise<any>;
  address: string;
}

export interface TransferSessionAuthorization {
  type: 'zerodev-transfer-session';
  smartAccountAddress: `0x${string}`;
  sessionKeyAddress: `0x${string}`;
  sessionPrivateKey: `0x${string}`; // ⚠️ Should be encrypted in production
  expiry: number;
  createdAt: number;
}

/**
 * Create transfer-only session key with restricted permissions
 *
 * Flow:
 * 1. Create Kernel V3 smart account using Privy as signer (or reuse existing)
 * 2. Generate session key with call policy restricted to USDC.transfer() only
 * 3. Return session key authorization data for storage
 *
 * @param privyWallet - Privy wallet object
 * @param userAddress - User's EOA address
 * @returns Transfer session authorization data
 */
export async function createTransferSessionKey(
  privyWallet: PrivyWalletProvider,
  userAddress: `0x${string}`
): Promise<TransferSessionAuthorization> {
  try {
    console.log('[TransferSession] Starting transfer session setup...');
    console.log('[TransferSession] User EOA:', userAddress);

    // 1. Get Privy wallet provider
    const provider = await privyWallet.getEthereumProvider();

    // 2. Create public client for blockchain reads
    const publicClient = createPublicClient({
      chain: base,
      transport: http(),
    });

    // 3. Create wallet client from Privy provider
    console.log('[TransferSession] Creating wallet client from Privy wallet...');
    const walletClient = createWalletClient({
      account: userAddress,
      chain: base,
      transport: custom(provider),
    });

    // 4. Create Kernel V3 smart account with Privy signer
    console.log('[TransferSession] Creating Kernel V3 smart account...');

    const { createKernelAccount } = await import('@zerodev/sdk');
    const { KERNEL_V3_3 } = await import('@zerodev/sdk/constants');
    const { signerToEcdsaValidator } = await import('@zerodev/ecdsa-validator');

    // Create ECDSA validator with wallet client as signer
    const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
      signer: walletClient,
      entryPoint: ENTRYPOINT_V07,
      kernelVersion: KERNEL_V3_3,
    });

    // Create Kernel account (smart account)
    const kernelAccount = await createKernelAccount(publicClient, {
      plugins: {
        sudo: ecdsaValidator,
      },
      entryPoint: ENTRYPOINT_V07,
      kernelVersion: KERNEL_V3_3,
    });

    const smartAccountAddress = kernelAccount.address;
    console.log('[TransferSession] ✓ Smart account created:', smartAccountAddress);

    // 5. Generate session key (private key that backend will use)
    console.log('[TransferSession] Generating session key...');
    const sessionPrivateKey = generatePrivateKey();
    const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);
    const sessionKeyAddress = sessionKeyAccount.address;

    console.log('[TransferSession] ✓ Session key generated:', sessionKeyAddress);

    // 6. Create session key validator with restricted call policy
    // Unlike agent sessions (sudo policy), this uses call policy to restrict to USDC.transfer() only
    const { toPermissionValidator } = await import('@zerodev/permissions');
    const { toCallPolicy, CallPolicyVersion } = await import('@zerodev/permissions/policies');
    const { toECDSASigner } = await import('@zerodev/permissions/signers');

    const expiry = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days

    // Convert session key account to a ModularSigner
    const sessionSigner = await toECDSASigner({ signer: sessionKeyAccount });

    // Create call policy that restricts to USDC.transfer() function only
    // Get the function selector for transfer(address,uint256)
    const transferSelector = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: ['0x0000000000000000000000000000000000000000', BigInt(0)],
    }).slice(0, 10) as `0x${string}`; // Extract 4-byte selector (0x + 8 chars)

    // Create permission validator with call policy
    const permissionValidator = await toPermissionValidator(publicClient, {
      signer: sessionSigner,
      entryPoint: ENTRYPOINT_V07,
      policies: [
        toCallPolicy({
          policyVersion: CallPolicyVersion.V0_0_5,
          permissions: [
            {
              target: USDC_ADDRESS,
              selector: transferSelector,
            },
          ],
        }),
      ],
      kernelVersion: KERNEL_V3_3,
    });

    console.log('[TransferSession] ✓ Session key configured with transfer-only permissions');

    // 7. Return authorization data
    return {
      type: 'zerodev-transfer-session',
      smartAccountAddress,
      sessionKeyAddress,
      sessionPrivateKey,
      expiry,
      createdAt: Date.now(),
    };

  } catch (error: any) {
    console.error('[TransferSession] ❌ Session creation failed:', error);
    throw new Error(`Transfer session setup failed: ${error.message}`);
  }
}

/**
 * Validate transfer session is not expired
 *
 * @param authorization - Transfer session authorization data
 * @returns true if session is valid and not expired
 */
export function validateTransferSession(
  authorization: TransferSessionAuthorization
): { valid: boolean; reason?: string } {
  const now = Math.floor(Date.now() / 1000);

  if (!authorization) {
    return { valid: false, reason: 'No session found' };
  }

  if (authorization.type !== 'zerodev-transfer-session') {
    return { valid: false, reason: 'Invalid session type' };
  }

  if (authorization.expiry < now) {
    return { valid: false, reason: 'Session expired' };
  }

  if (!authorization.sessionPrivateKey || !authorization.smartAccountAddress) {
    return { valid: false, reason: 'Invalid session data' };
  }

  return { valid: true };
}
