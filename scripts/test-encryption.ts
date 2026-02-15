/**
 * Test Encryption System
 *
 * Verifies that the encryption/decryption system works correctly
 *
 * Usage:
 *   pnpm tsx scripts/test-encryption.ts
 */

import { encrypt, decrypt, isEncrypted, generateKey } from '../lib/security/encryption';
import {
  encryptAuthorization,
  decryptAuthorization,
  isAuthorizationEncrypted,
  type SessionKey7702Authorization,
  type TransferSessionAuthorization,
} from '../lib/security/session-encryption';

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  Encryption System Tests');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Test 1: Basic encryption/decryption
console.log('Test 1: Basic Encryption/Decryption');
console.log('─────────────────────────────────────────────────');
const plaintext = '0x1234567890abcdef1234567890abcdef12345678';
console.log(`Original:  ${plaintext}`);

const encrypted = encrypt(plaintext);
console.log(`Encrypted: ${encrypted.substring(0, 50)}...`);
console.log(`Is Encrypted: ${isEncrypted(encrypted)}`);

const decrypted = decrypt(encrypted);
console.log(`Decrypted: ${decrypted}`);
console.log(`Match: ${plaintext === decrypted ? '✓' : '✗'}\n`);

// Test 2: Same plaintext produces different ciphertext (IV randomness)
console.log('Test 2: IV Randomness (Same Plaintext → Different Ciphertext)');
console.log('─────────────────────────────────────────────────');
const encrypted1 = encrypt(plaintext);
const encrypted2 = encrypt(plaintext);
console.log(`Encrypted 1: ${encrypted1.substring(0, 50)}...`);
console.log(`Encrypted 2: ${encrypted2.substring(0, 50)}...`);
console.log(`Different: ${encrypted1 !== encrypted2 ? '✓' : '✗'}`);
console.log(`Both decrypt correctly: ${decrypt(encrypted1) === plaintext && decrypt(encrypted2) === plaintext ? '✓' : '✗'}\n`);

// Test 3: Backward compatibility (plaintext passthrough)
console.log('Test 3: Backward Compatibility (Plaintext Passthrough)');
console.log('─────────────────────────────────────────────────');
const plaintextKey = '0xabcdef1234567890abcdef1234567890abcdef12';
console.log(`Plaintext key: ${plaintextKey}`);
console.log(`Is Encrypted: ${isEncrypted(plaintextKey)}`);
const decryptedPlaintext = decrypt(plaintextKey);
console.log(`After decrypt: ${decryptedPlaintext}`);
console.log(`Passthrough works: ${plaintextKey === decryptedPlaintext ? '✓' : '✗'}\n`);

// Test 4: Agent session authorization
console.log('Test 4: Agent Session Authorization Encryption');
console.log('─────────────────────────────────────────────────');
const agentAuth: SessionKey7702Authorization = {
  type: 'zerodev-7702-session',
  eoaAddress: '0x1111111111111111111111111111111111111111' as `0x${string}`,
  sessionKeyAddress: '0x2222222222222222222222222222222222222222' as `0x${string}`,
  sessionPrivateKey: '0x3333333333333333333333333333333333333333333333333333333333333333',
  expiry: Math.floor(Date.now() / 1000) + 86400 * 30,
  approvedVaults: ['0x4444444444444444444444444444444444444444'],
  timestamp: Date.now(),
};

console.log(`Original sessionPrivateKey: ${agentAuth.sessionPrivateKey}`);
console.log(`Is Encrypted: ${isAuthorizationEncrypted(agentAuth)}`);

const encryptedAuth = encryptAuthorization(agentAuth);
console.log(`Encrypted sessionPrivateKey: ${encryptedAuth.sessionPrivateKey?.substring(0, 50)}...`);
console.log(`Is Encrypted: ${isAuthorizationEncrypted(encryptedAuth)}`);
console.log(`Other fields unchanged: ${encryptedAuth.eoaAddress === agentAuth.eoaAddress ? '✓' : '✗'}`);

const decryptedAuth = decryptAuthorization(encryptedAuth);
console.log(`Decrypted sessionPrivateKey: ${decryptedAuth.sessionPrivateKey}`);
console.log(`Match: ${decryptedAuth.sessionPrivateKey === agentAuth.sessionPrivateKey ? '✓' : '✗'}\n`);

// Test 5: Transfer session authorization
console.log('Test 5: Transfer Session Authorization Encryption');
console.log('─────────────────────────────────────────────────');
const transferAuth: TransferSessionAuthorization = {
  type: 'zerodev-transfer-session',
  smartAccountAddress: '0x5555555555555555555555555555555555555555' as `0x${string}`,
  sessionKeyAddress: '0x6666666666666666666666666666666666666666' as `0x${string}`,
  sessionPrivateKey: '0x7777777777777777777777777777777777777777777777777777777777777777',
  expiry: Math.floor(Date.now() / 1000) + 86400 * 7,
  createdAt: Date.now(),
};

console.log(`Original sessionPrivateKey: ${transferAuth.sessionPrivateKey}`);
const encryptedTransferAuth = encryptAuthorization(transferAuth);
console.log(`Encrypted sessionPrivateKey: ${encryptedTransferAuth.sessionPrivateKey.substring(0, 50)}...`);

const decryptedTransferAuth = decryptAuthorization(encryptedTransferAuth);
console.log(`Decrypted sessionPrivateKey: ${decryptedTransferAuth.sessionPrivateKey}`);
console.log(`Match: ${decryptedTransferAuth.sessionPrivateKey === transferAuth.sessionPrivateKey ? '✓' : '✗'}\n`);

// Test 6: Generate new encryption key
console.log('Test 6: Generate New Encryption Key');
console.log('─────────────────────────────────────────────────');
const newKey = generateKey();
console.log(`Generated key: ${newKey}`);
console.log(`Length: ${newKey.length} chars (expected 64)`);
console.log(`Valid hex: ${/^[0-9a-f]{64}$/i.test(newKey) ? '✓' : '✗'}\n`);

// Test 7: Error handling - tampered ciphertext
console.log('Test 7: Tamper Detection');
console.log('─────────────────────────────────────────────────');
const validEncrypted = encrypt('test data');
const tamperedEncrypted = validEncrypted.slice(0, -5) + 'XXXXX';
console.log(`Valid ciphertext: ${validEncrypted.substring(0, 50)}...`);
console.log(`Tampered ciphertext: ${tamperedEncrypted.substring(0, 50)}...`);
try {
  decrypt(tamperedEncrypted);
  console.log('Tamper detection: ✗ (should have thrown error)');
} catch (error: any) {
  console.log(`Tamper detection: ✓ (error: ${error.message})\n`);
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  All Tests Complete');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
