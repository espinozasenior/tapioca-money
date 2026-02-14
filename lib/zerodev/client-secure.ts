/**
 * Secure Frontend Registration with EIP-7702
 *
 * Client's only job: sign the EIP-7702 authorization via Privy, then send it
 * to the server along with approved vaults. The server stores everything and
 * deploys the delegation on-chain via the first UserOp (gasless via paymaster).
 *
 * With EIP-7702, smartAccountAddress === userAddress (single address model).
 */

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

export interface SecureSessionKeyResult {
  smartAccountAddress: `0x${string}`;
  sessionKeyAddress: `0x${string}`;
  expiry: number;
  approvedVaults: `0x${string}`[];
}

/**
 * Serialize signed EIP-7702 authorization for JSON transport.
 * `bigint` fields (like `v`) are not JSON-serializable — convert to string.
 */
export function serializeSignedAuth(auth: any) {
  return {
    ...auth,
    v: auth.v != null ? auth.v.toString() : undefined,
    chainId: Number(auth.chainId),
    nonce: Number(auth.nonce),
  };
}

/**
 * Register agent with secure server-side session key.
 *
 * The caller (useOptimizer hook) signs the EIP-7702 authorization using Privy's
 * native `useSign7702Authorization` hook and passes the signed auth here.
 *
 * @param userAddress - User's EOA address
 * @param accessToken - Privy access token for API authentication
 * @param signedEip7702Auth - Signed EIP-7702 authorization from Privy
 * @returns Session key info (public address only)
 */
export async function registerAgentSecure(
  userAddress: `0x${string}`,
  accessToken: string,
  signedEip7702Auth: any,
): Promise<SecureSessionKeyResult> {
  try {
    console.log('[ZeroDev 7702] Starting registration (client signs, server deploys)...');
    console.log('[ZeroDev 7702] User EOA:', userAddress);

    // 1. Fetch approved vaults from the optimizer API
    console.log('[ZeroDev 7702] Fetching vault opportunities...');
    const optimizeResponse = await fetch('/api/optimize');
    if (!optimizeResponse.ok) {
      throw new Error('Failed to fetch vault opportunities');
    }
    const { opportunities } = await optimizeResponse.json();
    const approvedVaults = opportunities
      .filter((o: any) => o.metadata?.vaultAddress)
      .map((o: any) => o.metadata.vaultAddress) as `0x${string}`[];

    console.log('[ZeroDev 7702] Fetched', approvedVaults.length, 'vaults');

    // 2. Send signed auth + vaults to server for session key generation
    console.log('[ZeroDev 7702] Sending signed auth to server...');
    const sessionKeyResponse = await fetch('/api/agent/generate-session-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        address: userAddress,
        smartAccountAddress: userAddress, // EIP-7702: same address
        approvedVaults,
        eip7702SignedAuth: serializeSignedAuth(signedEip7702Auth),
      }),
    });

    if (!sessionKeyResponse.ok) {
      const error = await sessionKeyResponse.json();
      throw new Error(error.error || 'Failed to generate session key');
    }

    const { sessionKeyAddress, expiry } = await sessionKeyResponse.json();

    console.log('[ZeroDev 7702] Session key address:', sessionKeyAddress);
    console.log('[ZeroDev 7702] Expiry:', new Date(expiry * 1000).toISOString());
    console.log('[ZeroDev 7702] Registration complete (delegation deploys on first server-side UserOp)');

    return {
      smartAccountAddress: userAddress,
      sessionKeyAddress: sessionKeyAddress as `0x${string}`,
      expiry,
      approvedVaults,
    };
  } catch (error: any) {
    console.error('[ZeroDev 7702] Registration failed:', error);
    throw new Error(`Smart account setup failed: ${error.message}`);
  }
}

export interface DelegationStatus {
  active: boolean;
  isDelegation: boolean;
  implementationAddress?: string;
}

/**
 * Check if address has smart account bytecode deployed
 */
export async function checkSmartAccountActive(
  address: `0x${string}`
): Promise<DelegationStatus> {
  try {
    const publicClient = createPublicClient({
      chain: base,
      transport: http(),
    });

    const code = await publicClient.getBytecode({ address });

    if (!code || code === '0x') {
      return { active: false, isDelegation: false };
    }

    // EIP-7702 delegation designator: 0xef0100 + 20-byte implementation address
    // Total length: '0x' + 'ef0100' (6 chars) + address (40 chars) = 48 chars
    if (code.startsWith('0xef0100') && code.length === 48) {
      const implementationAddress = ('0x' + code.slice(8)) as `0x${string}`;
      return { active: true, isDelegation: true, implementationAddress };
    }

    // Has bytecode but not an EIP-7702 delegation (e.g. regular contract)
    return { active: true, isDelegation: false };
  } catch (error) {
    console.error('[ZeroDev Secure] Failed to check smart account status:', error);
    return { active: false, isDelegation: false };
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
 * Undelegate EOA from Kernel (remove EIP-7702 delegation on-chain).
 *
 * Requires the user's wallet to sign a new Type 4 transaction with
 * contractAddress = address(0) (null delegation) to remove the code slot.
 *
 * This must be called from the CLIENT because only the EOA owner (via Privy)
 * can sign the undelegation authorization.
 *
 * @param userAddress - User's EOA address
 * @param walletClient - Viem WalletClient from Privy provider
 * @returns Transaction hash of the undelegation Type 4 transaction
 */
export async function undelegateEoa(
  userAddress: `0x${string}`,
  walletClient: any,
): Promise<`0x${string}`> {
  console.log('[ZeroDev 7702] Starting on-chain undelegation for:', userAddress);

  // Sign authorization to delegate to address(0) — effectively removes delegation
  const authorization = await walletClient.signAuthorization({
    contractAddress: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  });

  // Submit Type 4 transaction to remove delegation
  const txHash = await walletClient.sendTransaction({
    to: userAddress,
    authorizationList: [authorization],
  });

  console.log('[ZeroDev 7702] Undelegation tx submitted:', txHash);
  return txHash;
}
