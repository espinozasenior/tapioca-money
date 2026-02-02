import { encrypt, decrypt, isEncrypted } from './encryption';

/**
 * Session key authorization types
 * These mirror the types in the application
 */
export interface SessionKeyAuthorization {
  type: 'zerodev-session-key';
  smartAccountAddress: string;
  sessionKeyAddress: string;
  sessionPrivateKey: string; // Will be encrypted
  expiry: number;
  approvedVaults: string[];
  timestamp: number;
}

export interface TransferSessionAuthorization {
  type: 'zerodev-transfer-session';
  smartAccountAddress: `0x${string}`;
  sessionKeyAddress: `0x${string}`;
  sessionPrivateKey: string; // Will be encrypted
  expiry: number;
  createdAt: number;
}

export type Authorization = SessionKeyAuthorization | TransferSessionAuthorization;

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

  // Encrypt only the sessionPrivateKey field
  if (cloned.sessionPrivateKey && !isEncrypted(cloned.sessionPrivateKey)) {
    cloned.sessionPrivateKey = encrypt(cloned.sessionPrivateKey);
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

  // Decrypt only the sessionPrivateKey field
  if (cloned.sessionPrivateKey) {
    cloned.sessionPrivateKey = decrypt(cloned.sessionPrivateKey);
  }

  return cloned;
}

/**
 * Check if an authorization object has an encrypted sessionPrivateKey
 * @param auth - Authorization object to check
 * @returns true if sessionPrivateKey is encrypted
 */
export function isAuthorizationEncrypted(auth: Authorization): boolean {
  return !!auth.sessionPrivateKey && isEncrypted(auth.sessionPrivateKey);
}
