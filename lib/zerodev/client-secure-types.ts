/**
 * Shared types for client-secure modules.
 *
 * Extracted from client-secure.ts (Phase 2, DDD refactoring).
 * These types are shared across permission-builder, account-serializer, and delegation-checker.
 */

/**
 * Signed EIP-7702 authorization object from Privy's useSign7702Authorization.
 * Contains the cryptographic signature allowing delegation to a contract address.
 * Compatible with viem's SignAuthorizationReturnType.
 */
export interface SignedEip7702Authorization {
  address: `0x${string}`;
  chainId: number;
  nonce: number;
  r: `0x${string}`;
  s: `0x${string}`;
  v?: bigint;
  yParity?: number;
}

/**
 * Decrypted authorization stored in DB (from session-encryption.ts).
 * Contains all session key material needed for server-side execution.
 */
export interface DecryptedAuthorization {
  type: "zerodev-7702-session" | "zerodev-erc4337-session";
  eoaAddress: `0x${string}`;
  sessionKeyAddress: `0x${string}`;
  sessionPrivateKey: `0x${string}`;
  serializedAccount?: string;
  approvedVaults?: `0x${string}`[];
  eip7702SignedAuth?: SignedEip7702Authorization;
  smartWalletAddress?: `0x${string}`;
  expiry: number;
  timestamp: number;
}

export interface SecureSessionKeyResult {
  smartAccountAddress: `0x${string}`;
  sessionKeyAddress: `0x${string}`;
  expiry: number;
  approvedVaults: `0x${string}`[];
}
