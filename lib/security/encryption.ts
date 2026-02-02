import crypto from 'crypto';

/**
 * AES-256-GCM encryption for sensitive data in database
 *
 * Format: encrypted:v1:{iv_base64}:{ciphertext_base64}:{authTag_base64}
 * - v1: Version for future algorithm upgrades
 * - iv: Unique initialization vector per encryption
 * - ciphertext: AES-256-GCM encrypted data
 * - authTag: Authentication tag for tamper detection
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const VERSION = 'v1';
const PREFIX = 'encrypted';

/**
 * Get encryption key from environment variable
 * Throws if key is missing or invalid length
 */
function getEncryptionKey(): Buffer {
  const key = process.env.DATABASE_ENCRYPTION_KEY;

  if (!key) {
    throw new Error('DATABASE_ENCRYPTION_KEY environment variable is not set');
  }

  // Key should be 64 hex characters (32 bytes)
  if (key.length !== 64) {
    throw new Error('DATABASE_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }

  try {
    return Buffer.from(key, 'hex');
  } catch (error) {
    throw new Error('DATABASE_ENCRYPTION_KEY must be a valid hex string');
  }
}

/**
 * Check if a value is already encrypted
 * @param value - String to check
 * @returns true if value starts with "encrypted:v1:"
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(`${PREFIX}:${VERSION}:`);
}

/**
 * Encrypt plaintext string using AES-256-GCM
 * @param plaintext - String to encrypt
 * @returns Encrypted string in format: encrypted:v1:{iv}:{ciphertext}:{authTag}
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty string');
  }

  // Don't re-encrypt already encrypted values
  if (isEncrypted(plaintext)) {
    return plaintext;
  }

  const key = getEncryptionKey();

  // Generate random IV for each encryption (ensures same plaintext → different ciphertext)
  const iv = crypto.randomBytes(IV_LENGTH);

  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  // Encrypt data
  let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
  ciphertext += cipher.final('base64');

  // Get authentication tag (for tamper detection)
  const authTag = cipher.getAuthTag();

  // Return versioned format
  return `${PREFIX}:${VERSION}:${iv.toString('base64')}:${ciphertext}:${authTag.toString('base64')}`;
}

/**
 * Decrypt encrypted string using AES-256-GCM
 * @param ciphertext - Encrypted string in format: encrypted:v1:{iv}:{ciphertext}:{authTag}
 * @returns Decrypted plaintext string
 *
 * Backward compatible: If input doesn't start with "encrypted:", returns as-is (plaintext)
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) {
    throw new Error('Cannot decrypt empty string');
  }

  // Backward compatibility: If not encrypted, return as-is (plaintext)
  if (!isEncrypted(ciphertext)) {
    return ciphertext;
  }

  const key = getEncryptionKey();

  // Parse encrypted format
  const parts = ciphertext.split(':');

  if (parts.length !== 5) {
    throw new Error('Invalid encrypted format: expected 5 parts separated by colons');
  }

  const [prefix, version, ivBase64, encryptedData, authTagBase64] = parts;

  // Validate prefix
  if (prefix !== PREFIX) {
    throw new Error(`Invalid encrypted format: expected prefix "${PREFIX}", got "${prefix}"`);
  }

  // Validate version
  if (version !== VERSION) {
    throw new Error(`Unsupported encryption version: ${version}`);
  }

  try {
    // Decode components
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');

    // Validate lengths
    if (iv.length !== IV_LENGTH) {
      throw new Error(`Invalid IV length: expected ${IV_LENGTH} bytes, got ${iv.length}`);
    }

    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error(`Invalid auth tag length: expected ${AUTH_TAG_LENGTH} bytes, got ${authTag.length}`);
    }

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt data
    let plaintext = decipher.update(encryptedData, 'base64', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
  } catch (error) {
    if (error instanceof Error) {
      // Auth tag verification failure indicates tampering
      if (error.message.includes('auth')) {
        throw new Error('Decryption failed: data has been tampered with or corrupted');
      }
      throw new Error(`Decryption failed: ${error.message}`);
    }
    throw new Error('Decryption failed: unknown error');
  }
}

/**
 * Generate a new encryption key (for setup/rotation)
 * @returns 64-character hex string (32 bytes)
 */
export function generateKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
