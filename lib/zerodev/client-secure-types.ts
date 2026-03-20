/**
 * Shared types for client-secure modules.
 *
 * Extracted from client-secure.ts (Phase 2, DDD refactoring).
 * These types are shared across permission-builder, account-serializer, and delegation-checker.
 */

/**
 * Minimal wallet client interface for registration and delegation flows.
 *
 * Using a structural type instead of viem's full `WalletClient` because:
 * - Privy wallet clients don't carry all 40+ WalletClient properties
 * - Test mocks only need the methods actually consumed
 * - Different paths use different subsets (signMessage vs request vs sendTransaction)
 *
 * All methods use `(...args: any[]) => Promise<any>` signatures so that both
 * viem WalletClient (strict generics) and lightweight test mocks are assignable.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface WalletClientSigner {
  account?: { address: `0x${string}`; [key: string]: unknown } | undefined;
  signMessage?: (...args: any[]) => Promise<any>;
  signTypedData?: (...args: any[]) => Promise<any>;
  sendTransaction?: (...args: any[]) => Promise<any>;
  request?: (...args: any[]) => Promise<any>;
  switchChain?: (...args: any[]) => Promise<any>;
  addChain?: (...args: any[]) => Promise<any>;
  [key: string]: unknown;
}

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
