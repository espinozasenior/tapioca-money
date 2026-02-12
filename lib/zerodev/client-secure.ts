/**
 * Secure Frontend Smart Account Setup with ZeroDev + Privy (EIP-7702)
 *
 * SECURITY IMPROVEMENTS over client.ts:
 * - Session key private key generated SERVER-SIDE
 * - Private key never exposed to browser (XSS-safe)
 * - Only public session key address returned to client
 *
 * EIP-7702 Flow:
 * 1. User signs 7702 authorization (delegates EOA code slot to Kernel)
 * 2. Client creates Kernel account with eip7702Account (account.address === EOA)
 * 3. Client sends EOA address to server for session key generation
 * 4. Server generates session key, encrypts, stores it
 * 5. Server returns session key PUBLIC address
 * 6. Permissions are enforced server-side via call policies at execution time
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
 * Register agent with EIP-7702 delegation and secure server-side session key.
 *
 * EIP-7702 upgrades the user's EOA to a smart account — the EOA IS the smart
 * account (single address). The user signs a 7702 authorization that delegates
 * their EOA's code slot to the Kernel V3.1 implementation.
 *
 * SECURITY: Session key private key is generated server-side
 * and never exposed to the browser.
 *
 * @param privyWallet - Privy wallet object (must support signAuthorization)
 * @param accessToken - Privy access token for API authentication
 * @returns Session key info (public address only)
 */
export async function registerAgentSecure(
  privyWallet: PrivyWalletProvider,
  accessToken: string
): Promise<SecureSessionKeyResult> {
  try {
    console.log('[ZeroDev 7702] Starting EIP-7702 smart account setup...');

    const userAddress = privyWallet.address as `0x${string}`;
    console.log('[ZeroDev 7702] User EOA:', userAddress);

    // 1. Get Privy wallet provider
    const provider = await privyWallet.getEthereumProvider();

    // 2. Create public client for blockchain reads
    const publicClient = createPublicClient({
      chain: base,
      transport: http(),
    });

    // 3. Create wallet client from Privy provider (used as eip7702Account)
    console.log('[ZeroDev 7702] Creating wallet client from Privy wallet...');
    const walletClient = createWalletClient({
      account: userAddress,
      chain: base,
      transport: custom(provider),
    });

    // 4. Sign EIP-7702 authorization to delegate EOA to Kernel implementation
    console.log('[ZeroDev 7702] Signing EIP-7702 authorization...');

    const { createKernelAccount } = await import('@zerodev/sdk');
    const { KERNEL_V3_3 } = await import('@zerodev/sdk/constants');
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
      kernelVersion: KERNEL_V3_3,
    });

    console.log('[ZeroDev 7702] ✓ Permission validator created with sudo policy');

    // 5. Create Kernel account with EIP-7702 delegation
    // The account address will equal the EOA address (single address model)
    const kernelAccount = await createKernelAccount(publicClient, {
      plugins: {
        sudo: permissionValidator,
      },
      // EIP-7702: walletClient acts as the eip7702Account — its address is the EOA
      eip7702Account: walletClient,
      entryPoint: ENTRYPOINT_V07,
      kernelVersion: KERNEL_V3_3,
    });

    // With 7702, the smart account address IS the EOA address
    const smartAccountAddress = kernelAccount.address;
    console.log('[ZeroDev 7702] ✓ 7702 Kernel account created:', smartAccountAddress);
    console.log('[ZeroDev 7702] ✓ Account address === EOA:', smartAccountAddress.toLowerCase() === userAddress.toLowerCase());

    // 6. Fetch approved vaults from the same source as the UI opportunities
    console.log('[ZeroDev 7702] Fetching vault opportunities...');
    const optimizeResponse = await fetch('/api/optimize');
    if (!optimizeResponse.ok) {
      throw new Error('Failed to fetch vault opportunities');
    }
    const { opportunities } = await optimizeResponse.json();
    const approvedVaults = opportunities
      .filter((o: any) => o.metadata?.vaultAddress)
      .map((o: any) => o.metadata.vaultAddress) as `0x${string}`[];

    console.log('[ZeroDev 7702] ✓ Fetched', approvedVaults.length, 'vaults');

    // 7. Request server to generate session key (SECURE)
    // For 7702: eoaAddress === smartAccountAddress (single address)
    console.log('[ZeroDev 7702] Requesting server-side session key...');

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

    console.log('[ZeroDev 7702] ✓ Session key address:', sessionKeyAddress);
    console.log('[ZeroDev 7702] ✓ Expiry:', new Date(expiry * 1000).toISOString());

    // Note: Session key permissions are enforced server-side via the permission
    // validator in kernel-client.ts. No on-chain permission registration needed
    // from the client — the session key's authority comes from the call policy
    // attached to the kernel account at execution time.
    console.log('[ZeroDev 7702] ✓ Session key registered (permissions enforced server-side)');

    return {
      smartAccountAddress,
      sessionKeyAddress: sessionKeyAddress as `0x${string}`,
      expiry,
      approvedVaults,
    };
  } catch (error: any) {
    console.error('[ZeroDev 7702] ❌ Registration failed:', error);
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
 * Revoke session key (soft revoke — calls server to delete encrypted key)
 * Agent stops immediately since the session key is deleted from DB.
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

  console.log('[ZeroDev 7702] Session key revoked (soft)');
}

/**
 * Revoke EIP-7702 delegation on-chain (full revoke).
 * Signs a new authorization delegating to address(0), which removes the
 * Kernel implementation from the EOA's code slot.
 *
 * This is a stronger revocation than soft revoke — even if the session key
 * were somehow compromised, the EOA is no longer a smart account.
 *
 * @param privyWallet - Privy wallet object
 * @returns Transaction hash of the undelegation
 */
export async function revokeOnChain(
  privyWallet: PrivyWalletProvider
): Promise<`0x${string}`> {
  const userAddress = privyWallet.address as `0x${string}`;
  const provider = await privyWallet.getEthereumProvider();

  console.log('[ZeroDev 7702] Revoking on-chain delegation for:', userAddress);

  const walletClient = createWalletClient({
    account: userAddress,
    chain: base,
    transport: custom(provider),
  });

  // Sign authorization delegating to address(0) — removes Kernel from EOA
  const authorization = await walletClient.signAuthorization({
    contractAddress: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  });

  // Send a self-transaction with the undelegation authorization
  const hash = await walletClient.sendTransaction({
    to: userAddress,
    value: BigInt(0),
    authorizationList: [authorization],
  });

  console.log('[ZeroDev 7702] ✓ On-chain undelegation tx:', hash);
  return hash;
}
