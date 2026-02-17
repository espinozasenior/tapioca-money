/**
 * Secure Frontend Registration with EIP-7702
 *
 * Uses ZeroDev's serialize/deserialize pattern for two-party execution:
 * 1. Client creates kernel account (EOA as sudo, session key as regular)
 * 2. Client serializes account (capturing enable signature from EOA)
 * 3. Server deserializes and executes — no EOA private key needed
 *
 * With EIP-7702, smartAccountAddress === userAddress (single address model).
 */

import { createPublicClient, http, parseAbi, type Hex } from 'viem';
import { base } from 'viem/chains';
import { toAccount } from 'viem/accounts';
import { CHAIN_CONFIG } from '@/lib/yield-optimizer/config';

// Session key expiry: 7 days
const SESSION_KEY_EXPIRY_DAYS = 7;

// Function selectors for scoped permissions
const APPROVE_SELECTOR = "0x095ea7b3" as Hex; // approve(address,uint256)
const DEPOSIT_SELECTOR = "0x6e553f65" as Hex; // deposit(uint256,address)
const REDEEM_SELECTOR = "0xba087652" as Hex;  // redeem(uint256,address,address)
const WITHDRAW_SELECTOR = "0xb460af94" as Hex; // withdraw(uint256,address,address)
const TRANSFER_SELECTOR = "0xa9059cbb" as Hex; // transfer(address,uint256)
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`;

// Maximum USDC amount per session key call (10,000 USDC with 6 decimals)
const MAX_USDC_PER_CALL = BigInt(10_000) * BigInt(1e6);

// EntryPoint V0.7 object (required format for ZeroDev SDK v5)
const ENTRYPOINT_V07 = {
  address: "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as `0x${string}`,
  version: "0.7" as const,
};

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
  // Normalize v/yParity: Privy returns yParity, ZeroDev SDK may expect v (BigInt)
  const yParity = auth.yParity ?? auth.v;
  return {
    ...auth,
    v: yParity != null ? yParity.toString() : undefined,
    yParity: yParity != null ? Number(yParity) : undefined,
    chainId: Number(auth.chainId),
    nonce: Number(auth.nonce),
  };
}

/**
 * Create and serialize a kernel account client-side.
 *
 * Uses ZeroDev's official serialize/deserialize pattern for two-party execution.
 * The client (with EOA access) creates the full kernel account, which captures
 * the enable signature from the sudo validator. The serialized data is then
 * sent to the server, which can deserialize and execute UserOps without the EOA.
 *
 * This will prompt the user to sign the enable typed data via Privy (1 extra signature).
 *
 * @param userAddress - User's EOA address
 * @param signedEip7702Auth - Raw signed EIP-7702 authorization from Privy
 * @param walletClient - Viem WalletClient from Privy provider
 * @param approvedVaults - List of approved vault addresses for scoped permissions
 */
async function createAndSerializeAccount(
  userAddress: `0x${string}`,
  signedEip7702Auth: any,
  walletClient: any,
  approvedVaults: `0x${string}`[],
): Promise<{ serializedAccount: string; sessionKeyAddress: `0x${string}`; expiry: number }> {
  console.log('[ZeroDev 7702] Creating serialized account client-side...');

  // Dynamic imports to minimize client bundle (tree-shaken)
  const { generatePrivateKey, privateKeyToAccount } = await import('viem/accounts');
  const { createKernelAccount } = await import('@zerodev/sdk');
  const { KERNEL_V3_3 } = await import('@zerodev/sdk/constants');
  const { toPermissionValidator, serializePermissionAccount } = await import('@zerodev/permissions');
  const { toCallPolicy, CallPolicyVersion, toGasPolicy, toRateLimitPolicy, toTimestampPolicy, ParamCondition } = await import('@zerodev/permissions/policies');
  const { toECDSASigner } = await import('@zerodev/permissions/signers');

  // 1. Generate session key pair (client-side)
  const sessionPrivateKey = generatePrivateKey();
  const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);
  console.log('[ZeroDev 7702] Session key address:', sessionKeyAccount.address);

  // 2. Create public client
  const publicClient = createPublicClient({
    chain: base,
    transport: http(CHAIN_CONFIG.rpcUrl),
  });

  // 3. Create session key signer
  const sessionSigner = await toECDSASigner({ signer: sessionKeyAccount });

  // Calculate expiry timestamp (reused for both on-chain policy and return value)
  const expiryTimestamp = Math.floor(Date.now() / 1000) + SESSION_KEY_EXPIRY_DAYS * 24 * 60 * 60;

  // 4. Build scoped permissions with value limits and amount caps
  const permissions: any[] = [];

  // USDC approve — cap amount parameter
  permissions.push({
    target: USDC_ADDRESS,
    abi: parseAbi(['function approve(address spender, uint256 amount) returns (bool)']),
    functionName: 'approve',
    args: [null, { condition: ParamCondition.LESS_THAN_OR_EQUAL, value: MAX_USDC_PER_CALL }],
    valueLimit: 0n,
  });

  // USDC transfer — cap amount parameter
  permissions.push({
    target: USDC_ADDRESS,
    abi: parseAbi(['function transfer(address to, uint256 amount) returns (bool)']),
    functionName: 'transfer',
    args: [null, { condition: ParamCondition.LESS_THAN_OR_EQUAL, value: MAX_USDC_PER_CALL }],
    valueLimit: 0n,
  });

  // Vault operations — cap deposit amounts, allow redeem/withdraw (funds return to user)
  for (const vault of approvedVaults) {
    permissions.push({
      target: vault,
      abi: parseAbi(['function deposit(uint256 assets, address receiver) returns (uint256)']),
      functionName: 'deposit',
      args: [{ condition: ParamCondition.LESS_THAN_OR_EQUAL, value: MAX_USDC_PER_CALL }, null],
      valueLimit: 0n,
    });
    // Redeem/withdraw move funds back to user — no amount cap needed
    permissions.push({ target: vault, selector: REDEEM_SELECTOR, valueLimit: 0n });
    permissions.push({ target: vault, selector: WITHDRAW_SELECTOR, valueLimit: 0n });
  }

  const callPolicy = toCallPolicy({
    policyVersion: CallPolicyVersion.V0_0_5,
    permissions,
  });

  const gasPolicy = toGasPolicy({
    allowed: BigInt(500_000) * BigInt(100_000_000), // 500k gas * 0.1 gwei
  });

  const rateLimitPolicy = toRateLimitPolicy({
    count: 10,
    interval: 86400, // 24 hours
  });

  // On-chain session key expiry — enforced by the validator, not just server-side
  const timestampPolicy = toTimestampPolicy({
    validAfter: Math.floor(Date.now() / 1000),
    validUntil: expiryTimestamp,
  });

  // 5. Create permission validator
  const permissionValidator = await toPermissionValidator(publicClient, {
    signer: sessionSigner,
    entryPoint: ENTRYPOINT_V07,
    policies: [callPolicy, gasPolicy, rateLimitPolicy, timestampPolicy],
    kernelVersion: KERNEL_V3_3,
  });

  // 6. Wrap Privy wallet as a LocalAccount (type: "local") for the SDK
  // The SDK's createKernelAccount checks eip7702Account.type === "local"
  // to create the sudo validator. toAccount() produces the right type.
  const eoaLocalAccount = toAccount({
    address: userAddress,
    signMessage: async ({ message }) => walletClient.signMessage({ message }),
    signTransaction: async () => { throw new Error('signTransaction not needed for registration'); },
    signTypedData: async (typedData) => walletClient.signTypedData(typedData),
  });

  // 7. Create kernel account with EOA as sudo + session key as regular
  console.log('[ZeroDev 7702] Creating kernel account (EOA=sudo, sessionKey=regular)...');
  const kernelAccount = await createKernelAccount(publicClient, {
    plugins: {
      regular: permissionValidator,
    },
    entryPoint: ENTRYPOINT_V07,
    kernelVersion: KERNEL_V3_3,
    address: userAddress,
    eip7702Auth: signedEip7702Auth,
    eip7702Account: eoaLocalAccount,
  });

  console.log('[ZeroDev 7702] Kernel account created:', kernelAccount.address);

  // 8. Serialize the account (captures enable signature via sudo/EOA signing)
  // This triggers a Privy signing popup for the enable typed data
  console.log('[ZeroDev 7702] Serializing account (user signs enable data)...');
  const serialized = await serializePermissionAccount(
    kernelAccount,
    sessionPrivateKey,      // Embedded for server-side deserialization
    undefined,              // Auto-generate enable signature (sudo signs)
    signedEip7702Auth,      // Embed EIP-7702 auth
  );

  const expiry = expiryTimestamp;

  console.log('[ZeroDev 7702] Account serialized successfully');
  return {
    serializedAccount: serialized,
    sessionKeyAddress: sessionKeyAccount.address as `0x${string}`,
    expiry,
  };
}

/**
 * Register agent with secure server-side execution.
 *
 * The caller (useOptimizer hook) signs the EIP-7702 authorization using Privy's
 * native `useSign7702Authorization` hook, then creates and serializes the kernel
 * account client-side (which captures the enable signature from the EOA).
 *
 * The serialized account is sent to the server for storage and later execution.
 *
 * @param userAddress - User's EOA address
 * @param accessToken - Privy access token for API authentication
 * @param signedEip7702Auth - Signed EIP-7702 authorization from Privy
 * @param walletClient - Viem WalletClient from Privy provider (for signing enable data)
 * @returns Session key info (public address only)
 */
export async function registerAgentSecure(
  userAddress: `0x${string}`,
  accessToken: string,
  signedEip7702Auth: any,
  walletClient: any,
): Promise<SecureSessionKeyResult> {
  try {
    console.log('[ZeroDev 7702] Starting registration (serialize/deserialize pattern)...');
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

    // 2. Create and serialize the kernel account client-side
    // This captures the enable signature from the EOA (sudo)
    const { serializedAccount, sessionKeyAddress, expiry } = await createAndSerializeAccount(
      userAddress,
      signedEip7702Auth,
      walletClient,
      approvedVaults,
    );

    // 3. Send serialized account to server for encrypted storage
    console.log('[ZeroDev 7702] Sending serialized account to server...');
    const sessionKeyResponse = await fetch('/api/agent/generate-session-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        address: userAddress,
        smartAccountAddress: userAddress, // EIP-7702: same address
        sessionKeyAddress,
        serializedAccount,
        approvedVaults,
        expiry,
      }),
    });

    if (!sessionKeyResponse.ok) {
      const error = await sessionKeyResponse.json();
      throw new Error(error.error || 'Failed to store session data');
    }

    console.log('[ZeroDev 7702] Session key address:', sessionKeyAddress);
    console.log('[ZeroDev 7702] Expiry:', new Date(expiry * 1000).toISOString());
    console.log('[ZeroDev 7702] Registration complete');

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
      transport: http(CHAIN_CONFIG.rpcUrl),
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
