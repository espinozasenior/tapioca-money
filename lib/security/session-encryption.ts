import { encrypt, decrypt, isEncrypted } from "./encryption";

/**
 * Session key authorization types
 * These mirror the types in the application
 */
export interface SessionKey7702Authorization {
  type: "zerodev-7702-session";
  eoaAddress: `0x${string}`; // EOA = smart account (same address with EIP-7702)
  sessionKeyAddress: `0x${string}`;
  serializedAccount?: string; // Base64 serialized kernel account (will be encrypted)
  approvedVaults: string[];
  expiry: number;
  timestamp: number;
  policyConfig?: {
    gasPolicy: { allowed: string };
    rateLimitPolicy: { count: number; interval: number };
  };
  // Legacy fields (pre-serialize/deserialize pattern) — kept for backward compat
  sessionPrivateKey?: string;
  eip7702SignedAuth?: {
    r: string;
    s: string;
    yParity: number;
    v?: string;
    address: string;
    chainId: number;
    nonce: number;
  };
}

export interface SessionKeyErc4337Authorization {
  type: "zerodev-erc4337-session";
  eoaAddress: `0x${string}`; // User's external wallet (DB key)
  smartWalletAddress: `0x${string}`; // Privy Kernel smart wallet (where funds live)
  sessionKeyAddress: `0x${string}`;
  serializedAccount?: string; // Base64 serialized kernel account (will be encrypted)
  approvedVaults: string[];
  expiry: number;
  timestamp: number;
}

export interface TransferSessionAuthorization {
  type: "zerodev-transfer-session";
  smartAccountAddress: `0x${string}`;
  sessionKeyAddress: `0x${string}`;
  sessionPrivateKey: string; // Will be encrypted
  expiry: number;
  createdAt: number;
}

export type Authorization =
  | SessionKey7702Authorization
  | SessionKeyErc4337Authorization
  | TransferSessionAuthorization;

/**
 * Encrypt the sessionPrivateKey field in an authorization object
 * All other fields remain unchanged
 *
 * @param auth - Authorization object with plaintext sessionPrivateKey
 * @returns Authorization object with encrypted sessionPrivateKey
 */
export function encryptAuthorization<T extends Authorization>(auth: T): T {
  // Deep clone to avoid mutating input
  const cloned = { ...auth };

  // Encrypt serializedAccount (new pattern) or sessionPrivateKey (legacy)
  if (
    "serializedAccount" in cloned &&
    cloned.serializedAccount &&
    !isEncrypted(cloned.serializedAccount)
  ) {
    (cloned as any).serializedAccount = encrypt((cloned as any).serializedAccount);
  }
  if ("sessionPrivateKey" in cloned && cloned.sessionPrivateKey && !isEncrypted(cloned.sessionPrivateKey)) {
    (cloned as any).sessionPrivateKey = encrypt(cloned.sessionPrivateKey);
  }

  return cloned;
}

/**
 * Decrypt the sessionPrivateKey field in an authorization object
 * All other fields remain unchanged
 * Backward compatible: handles both encrypted and plaintext keys
 *
 * @param auth - Authorization object with encrypted sessionPrivateKey
 * @returns Authorization object with decrypted sessionPrivateKey
 */
export function decryptAuthorization<T extends Authorization>(auth: T): T {
  // Deep clone to avoid mutating input
  const cloned = { ...auth };

  // Decrypt serializedAccount (new pattern) or sessionPrivateKey (legacy)
  if ("serializedAccount" in cloned && (cloned as any).serializedAccount) {
    (cloned as any).serializedAccount = decrypt((cloned as any).serializedAccount);
  }
  if ("sessionPrivateKey" in cloned && cloned.sessionPrivateKey) {
    (cloned as any).sessionPrivateKey = decrypt(cloned.sessionPrivateKey);
  }

  return cloned;
}

/**
 * Check if an authorization object has an encrypted sessionPrivateKey
 * @param auth - Authorization object to check
 * @returns true if sessionPrivateKey is encrypted
 */
export function isAuthorizationEncrypted(auth: Authorization): boolean {
  return "sessionPrivateKey" in auth && !!auth.sessionPrivateKey && isEncrypted(auth.sessionPrivateKey);
}
