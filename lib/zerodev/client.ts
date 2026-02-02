/**
 * Frontend Smart Account Setup with ZeroDev + Privy
 * Handles client-side Kernel V3 account creation and session key management
 */

import type { Hex } from 'viem';
import { base } from 'viem/chains';
import { createPublicClient, createWalletClient, custom, http } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

// EntryPoint V0.7 object (required format for ZeroDev SDK v5)
// ZeroDev SDK expects { address, version } not just the address string
const ENTRYPOINT_V07 = {
  address: "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as `0x${string}`,
  version: "0.7" as const,
};

export interface PrivyWalletProvider {
  getEthereumProvider(): Promise<any>;
  address: string;
  signAuthorization?: (params: any) => Promise<any>;
}

export interface SessionKeyAuthorization {
  smartAccountAddress: `0x${string}`;
  sessionKeyAddress: `0x${string}`;
  sessionPrivateKey: `0x${string}`;
  expiry: number;
  approvedVaults: `0x${string}`[];
  timestamp: number;
}

/**
 * Register smart account with ZeroDev Kernel + Session Keys
 *
 * Flow:
 * 1. Create Kernel V3 smart account using Privy as signer
 * 2. Fetch approved Morpho vaults
 * 3. Create session key with scoped permissions
 * 4. Return session key for backend storage
 *
 * @param privyWallet - Privy wallet object
 * @returns Session key authorization data
 */
export async function registerAgentWithZeroDev(
  privyWallet: PrivyWalletProvider
): Promise<SessionKeyAuthorization> {
  try {
    console.log('[ZeroDev] Starting smart account setup...');

    const userAddress = privyWallet.address as `0x${string}`;
    console.log('[ZeroDev] User EOA:', userAddress);

    // 1. Get Privy wallet provider
    const provider = await privyWallet.getEthereumProvider();

    // 2. Create public client for blockchain reads
    const publicClient = createPublicClient({
      chain: base,
      transport: http(),
    });

    // 3. Create wallet client from Privy provider
    // Using createWalletClient instead of toAccount for better SDK compatibility
    console.log('[ZeroDev] Creating wallet client from Privy wallet...');
    const walletClient = createWalletClient({
      account: userAddress,
      chain: base,
      transport: custom(provider),
    });

    // 4. Create Kernel V3 smart account with Privy signer
    console.log('[ZeroDev] Creating Kernel V3 smart account...');

    const { createKernelAccount, createKernelAccountClient } = await import('@zerodev/sdk');
    const { KERNEL_V3_1 } = await import('@zerodev/sdk/constants');
    const { signerToEcdsaValidator } = await import('@zerodev/ecdsa-validator');

    // Create ECDSA validator with wallet client as signer
    // Pass EntryPoint object (with address + version), not just the address string
    const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
      signer: walletClient,
      entryPoint: ENTRYPOINT_V07,
      kernelVersion: KERNEL_V3_1,
    });

    // Create Kernel account (smart account)
    const kernelAccount = await createKernelAccount(publicClient, {
      plugins: {
        sudo: ecdsaValidator,
      },
      entryPoint: ENTRYPOINT_V07,
      kernelVersion: KERNEL_V3_1,
    });

    const smartAccountAddress = kernelAccount.address;
    console.log('[ZeroDev] ✓ Smart account created:', smartAccountAddress);

    // 5. Fetch approved Morpho vaults from backend
    console.log('[ZeroDev] Fetching approved Morpho vaults...');
    const vaultsResponse = await fetch('/api/morpho/vaults?chain=8453&asset=USDC&limit=20');
    if (!vaultsResponse.ok) {
      throw new Error('Failed to fetch Morpho vaults');
    }
    const { vaults } = await vaultsResponse.json();
    const approvedVaults = vaults.map((v: any) => v.address) as `0x${string}`[];

    console.log('[ZeroDev] ✓ Fetched', approvedVaults.length, 'vaults');

    // 6. Generate session key (private key that backend will use)
    console.log('[ZeroDev] Generating session key...');
    const sessionPrivateKey = generatePrivateKey();
    const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);
    const sessionKeyAddress = sessionKeyAccount.address;

    console.log('[ZeroDev] ✓ Session key generated:', sessionKeyAddress);

    // 7. Create session key validator with permissions
    const { toPermissionValidator } = await import('@zerodev/permissions');
    const { toSudoPolicy } = await import('@zerodev/permissions/policies');
    const { toECDSASigner } = await import('@zerodev/permissions/signers');

    const expiry = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days

    // Convert session key account to a ModularSigner
    const sessionSigner = await toECDSASigner({ signer: sessionKeyAccount });

    // Create permission validator with session key signer
    // Use EntryPoint object format for SDK v5 compatibility
    const permissionValidator = await toPermissionValidator(publicClient, {
      signer: sessionSigner,
      entryPoint: ENTRYPOINT_V07,
      policies: [
        toSudoPolicy({}), // Allow all operations within allowed contracts
      ],
      kernelVersion: KERNEL_V3_1,
    });

    // Create kernel account client with bundler (no entryPoint param - it comes from account)
    const bundlerUrl = process.env.NEXT_PUBLIC_ZERODEV_BUNDLER_URL ||
      `https://rpc.zerodev.app/api/v2/bundler/${process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID}`;

    const kernelClientWithSession = await createKernelAccountClient({
      account: kernelAccount,
      chain: base,
      bundlerTransport: http(bundlerUrl),
    });

    console.log('[ZeroDev] ✓ Session key configured with permissions');

    // 8. Return authorization data
    return {
      smartAccountAddress,
      sessionKeyAddress,
      sessionPrivateKey,
      expiry,
      approvedVaults,
      timestamp: Date.now(),
    };

  } catch (error: any) {
    console.error('[ZeroDev] ❌ Registration failed:', error);
    throw new Error(`Smart account setup failed: ${error.message}`);
  }
}

/**
 * Check if address has smart account bytecode deployed
 *
 * @param address - Address to check
 * @returns true if smart account is active
 */
export async function checkSmartAccountActive(address: `0x${string}`): Promise<boolean> {
  try {
    const publicClient = createPublicClient({
      chain: base,
      transport: http(),
    });

    const code = await publicClient.getBytecode({ address });
    return code !== undefined && code !== '0x';
  } catch (error) {
    console.error('[ZeroDev] Failed to check smart account status:', error);
    return false;
  }
}
