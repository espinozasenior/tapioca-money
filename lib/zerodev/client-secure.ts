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
