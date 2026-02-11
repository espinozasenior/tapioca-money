/**
 * Secure Frontend Smart Account Setup with ZeroDev + Privy
 *
 * SECURITY IMPROVEMENTS over client.ts:
 * - Session key private key generated SERVER-SIDE
 * - Private key never exposed to browser (XSS-safe)
 * - Only public session key address returned to client
 *
 * Flow:
 * 1. Client creates Kernel V3 smart account using Privy
 * 2. Client sends smart account address to server
 * 3. Server generates session key and stores encrypted
 * 4. Server returns session key PUBLIC address
 * 5. Permissions are enforced server-side via call policies at execution time
 */

import { base } from 'viem/chains';
import { createPublicClient, createWalletClient, custom, http } from 'viem';

// EntryPoint V0.7 object (required format for ZeroDev SDK v5)
const ENTRYPOINT_V07 = {
  address: '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as `0x${string}`,
  version: '0.7' as const,
};

export interface PrivyWalletProvider {
  getEthereumProvider(): Promise<any>;
  address: string;
  signAuthorization?: (params: any) => Promise<any>;
}

export interface SecureSessionKeyResult {
  smartAccountAddress: `0x${string}`;
  sessionKeyAddress: `0x${string}`;
  expiry: number;
  approvedVaults: `0x${string}`[];
}

/**
 * Register smart account with secure server-side session key
 *
 * SECURITY: Session key private key is generated server-side
 * and never exposed to the browser.
 *
 * @param privyWallet - Privy wallet object
 * @param accessToken - Privy access token for API authentication
 * @returns Session key info (public address only)
 */
export async function registerAgentSecure(
  privyWallet: PrivyWalletProvider,
  accessToken: string
): Promise<SecureSessionKeyResult> {
  try {
    console.log('[ZeroDev Secure] Starting smart account setup...');

    const userAddress = privyWallet.address as `0x${string}`;
    console.log('[ZeroDev Secure] User EOA:', userAddress);

    // 1. Get Privy wallet provider
    const provider = await privyWallet.getEthereumProvider();

    // 2. Create public client for blockchain reads
    const publicClient = createPublicClient({
      chain: base,
      transport: http(),
    });

    // 3. Create wallet client from Privy provider
    console.log('[ZeroDev Secure] Creating wallet client from Privy wallet...');
    const walletClient = createWalletClient({
      account: userAddress,
      chain: base,
      transport: custom(provider),
    });

    // 4. Create Kernel V3 smart account with Privy signer
    console.log('[ZeroDev Secure] Creating Kernel V3 smart account...');

    const { createKernelAccount } = await import('@zerodev/sdk');
    const { KERNEL_V3_1 } = await import('@zerodev/sdk/constants');
    const { toPermissionValidator } = await import('@zerodev/permissions');
    const { toSudoPolicy } = await import('@zerodev/permissions/policies');
    const { toECDSASigner } = await import('@zerodev/permissions/signers');

    // Convert wallet client to ModularSigner for permission validator
    const modularSigner = await toECDSASigner({ signer: walletClient });

    // Create sudo policy (unrestricted access for main signer during registration)
    const sudoPolicy = toSudoPolicy({});

    // Create permission validator with sudo policy
    const permissionValidator = await toPermissionValidator(publicClient, {
      signer: modularSigner,
      entryPoint: ENTRYPOINT_V07,
      policies: [sudoPolicy],
      kernelVersion: KERNEL_V3_1,
    });

    console.log('[ZeroDev Secure] ✓ Permission validator created with sudo policy');

    // Create Kernel account (smart account)
    const kernelAccount = await createKernelAccount(publicClient, {
      plugins: {
        sudo: permissionValidator,
      },
      entryPoint: ENTRYPOINT_V07,
      kernelVersion: KERNEL_V3_1,
    });

    const smartAccountAddress = kernelAccount.address;
    console.log('[ZeroDev Secure] ✓ Smart account created:', smartAccountAddress);

    // 5. Fetch approved vaults from the same source as the UI opportunities
    console.log('[ZeroDev Secure] Fetching vault opportunities...');
    const optimizeResponse = await fetch('/api/optimize');
    if (!optimizeResponse.ok) {
      throw new Error('Failed to fetch vault opportunities');
    }
    const { opportunities } = await optimizeResponse.json();
    const approvedVaults = opportunities
      .filter((o: any) => o.metadata?.vaultAddress)
      .map((o: any) => o.metadata.vaultAddress) as `0x${string}`[];

    console.log('[ZeroDev Secure] ✓ Fetched', approvedVaults.length, 'vaults');

    // 6. Request server to generate session key (SECURE)
    // Server generates private key, encrypts it, and stores it
    // Only public session key address is returned
    console.log('[ZeroDev Secure] Requesting server-side session key...');

    const sessionKeyResponse = await fetch('/api/agent/generate-session-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        address: userAddress,
        smartAccountAddress,
        approvedVaults,
      }),
    });

    if (!sessionKeyResponse.ok) {
      const error = await sessionKeyResponse.json();
      throw new Error(error.error || 'Failed to generate session key');
    }

    const { sessionKeyAddress, expiry } = await sessionKeyResponse.json();

    console.log('[ZeroDev Secure] ✓ Session key address:', sessionKeyAddress);
    console.log('[ZeroDev Secure] ✓ Expiry:', new Date(expiry * 1000).toISOString());

    // Note: Session key permissions are enforced server-side via the permission
    // validator in kernel-client.ts. No on-chain permission registration needed
    // from the client — the session key's authority comes from the call policy
    // attached to the kernel account at execution time.
    console.log('[ZeroDev Secure] ✓ Session key registered (permissions enforced server-side)');

    return {
      smartAccountAddress,
      sessionKeyAddress: sessionKeyAddress as `0x${string}`,
      expiry,
      approvedVaults,
    };
  } catch (error: any) {
    console.error('[ZeroDev Secure] ❌ Registration failed:', error);
    throw new Error(`Smart account setup failed: ${error.message}`);
  }
}


/**
 * Check if address has smart account bytecode deployed
 */
export async function checkSmartAccountActive(
  address: `0x${string}`
): Promise<boolean> {
  try {
    const publicClient = createPublicClient({
      chain: base,
      transport: http(),
    });

    const code = await publicClient.getBytecode({ address });
    return code !== undefined && code !== '0x';
  } catch (error) {
    console.error('[ZeroDev Secure] Failed to check smart account status:', error);
    return false;
  }
}

/**
 * Revoke session key (calls server to delete encrypted key)
 */
export async function revokeSessionKey(
  address: string,
  accessToken: string
): Promise<void> {
  const response = await fetch('/api/agent/generate-session-key', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ address }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to revoke session key');
  }

  console.log('[ZeroDev Secure] Session key revoked');
}
