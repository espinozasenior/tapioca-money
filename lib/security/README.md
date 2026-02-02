# Security Module - Session Key Encryption

## Quick Start

### Setup
1. Generate encryption key:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. Add to `.env`:
   ```bash
   DATABASE_ENCRYPTION_KEY=your_generated_key_here
   ```

### Usage

#### Encrypting Session Keys (API Routes)
```typescript
import { encryptAuthorization } from '@/lib/security/session-encryption';

// Create authorization object
const authorization = {
  type: 'zerodev-session-key',
  smartAccountAddress: '0x...',
  sessionKeyAddress: '0x...',
  sessionPrivateKey: '0x...', // Will be encrypted
  expiry: Date.now() / 1000 + 86400 * 30,
  approvedVaults: ['0x...'],
  timestamp: Date.now(),
};

// Encrypt before storing
const encrypted = encryptAuthorization(authorization);

// Store in database
await sql`
  UPDATE users
  SET authorization_7702 = ${JSON.stringify(encrypted)}
  WHERE wallet_address = ${address}
`;
```

#### Decrypting Session Keys (API Routes)
```typescript
import { decryptAuthorization } from '@/lib/security/session-encryption';

// Retrieve from database
const users = await sql`
  SELECT authorization_7702
  FROM users
  WHERE wallet_address = ${address}
`;

const encryptedAuth = users[0].authorization_7702;

// Decrypt when needed
const decrypted = decryptAuthorization(encryptedAuth);

// Use decrypted key
const sessionPrivateKey = decrypted.sessionPrivateKey; // Now plaintext
```

#### Checking Encryption Status
```typescript
import { isAuthorizationEncrypted } from '@/lib/security/session-encryption';

const auth = users[0].authorization_7702;

if (isAuthorizationEncrypted(auth)) {
  console.log('Session key is encrypted');
} else {
  console.log('Session key is plaintext');
}
```

### Low-Level API (Advanced)

#### Encrypt Any String
```typescript
import { encrypt, decrypt, isEncrypted } from '@/lib/security/encryption';

// Encrypt
const encrypted = encrypt('0x1234567890abcdef...');
// Returns: "encrypted:v1:{iv}:{ciphertext}:{authTag}"

// Check if encrypted
if (isEncrypted(encrypted)) {
  // Decrypt
  const plaintext = decrypt(encrypted);
}
```

#### Generate New Key
```typescript
import { generateKey } from '@/lib/security/encryption';

const newKey = generateKey();
// Returns: "a1b2c3d4e5f6..." (64 hex characters)
```

## Migration

### Preview Changes (Dry Run)
```bash
npx tsx scripts/migrate-encrypt-keys.ts --dry-run
```

### Execute Migration
```bash
npx tsx scripts/migrate-encrypt-keys.ts --execute
```

### Rollback (Emergency)
```bash
CONFIRM_ROLLBACK=yes npx tsx scripts/migrate-encrypt-keys.ts --rollback
```

## Testing

### Run Tests
```bash
DATABASE_ENCRYPTION_KEY=$(grep DATABASE_ENCRYPTION_KEY .env | cut -d'=' -f2) npx tsx scripts/test-encryption.ts
```

### Test Coverage
- ✅ Encryption/decryption roundtrip
- ✅ IV randomness
- ✅ Backward compatibility
- ✅ Authorization encryption
- ✅ Tamper detection
- ✅ Key generation

## Security Features

### Encryption Algorithm
- **AES-256-GCM**: Industry-standard authenticated encryption
- **Random IV**: Different ciphertext for same plaintext
- **Auth Tag**: Detects tampering

### Format
```
encrypted:v1:{iv_base64}:{ciphertext_base64}:{authTag_base64}
```

### Backward Compatibility
- `decrypt()` passes through plaintext (for migration)
- `encryptAuthorization()` skips already-encrypted keys
- Zero-downtime deployment

## Common Patterns

### Pattern 1: Encrypt on Write
```typescript
// API route that stores session key
const auth = encryptAuthorization(authorization);
await sql`UPDATE users SET authorization_7702 = ${JSON.stringify(auth)}`;
```

### Pattern 2: Decrypt on Read
```typescript
// API route that uses session key
const encryptedAuth = users[0].authorization_7702;
const auth = decryptAuthorization(encryptedAuth);
const key = auth.sessionPrivateKey; // Use for transactions
```

### Pattern 3: Conditional Encryption
```typescript
import { isAuthorizationEncrypted } from '@/lib/security/session-encryption';

if (!isAuthorizationEncrypted(auth)) {
  // Encrypt if not already encrypted
  auth = encryptAuthorization(auth);
}
```

## Error Handling

### Decryption Errors
```typescript
try {
  const decrypted = decrypt(ciphertext);
} catch (error) {
  // Possible causes:
  // 1. Wrong encryption key
  // 2. Corrupted ciphertext
  // 3. Tampered data (auth tag mismatch)
  console.error('Decryption failed:', error.message);
}
```

### Missing Encryption Key
```typescript
// Will throw on encrypt/decrypt if DATABASE_ENCRYPTION_KEY not set
Error: DATABASE_ENCRYPTION_KEY environment variable is not set
```

### Invalid Key Length
```typescript
// Will throw if key is not 64 hex characters
Error: DATABASE_ENCRYPTION_KEY must be 64 hex characters (32 bytes)
```

## Performance

### Encryption Speed
- **~0.05ms** per operation
- **Negligible** overhead for cron job

### Optimization Tips
1. **Decrypt lazily**: Only decrypt when actually needed
2. **Query filtering**: Use non-encrypted JSONB fields for queries
3. **Batch operations**: Decrypt in batches if processing many users

## Best Practices

### ✅ DO
- Encrypt before storing in database
- Decrypt only when needed (lazy decryption)
- Use environment variables for encryption key
- Rotate encryption key every 90 days
- Test with dry-run before migrating

### ❌ DON'T
- Commit encryption key to version control
- Log decrypted keys
- Re-encrypt already encrypted values (check `isEncrypted()` first)
- Skip error handling
- Use same key across environments (dev/staging/prod)

## Troubleshooting

### Keys Not Encrypting
1. Check `DATABASE_ENCRYPTION_KEY` is set
2. Verify key is 64 hex characters
3. Check API route calls `encryptAuthorization()`

### Decryption Failing
1. Verify same encryption key used for encrypt/decrypt
2. Check ciphertext format (should start with `encrypted:v1:`)
3. Ensure auth tag not corrupted

### Migration Issues
1. Run with `--dry-run` first
2. Check database connection
3. Verify `DATABASE_ENCRYPTION_KEY` set
4. Review error details in output

## API Reference

### `encryption.ts`

#### `encrypt(plaintext: string): string`
Encrypts plaintext using AES-256-GCM.

**Returns**: `encrypted:v1:{iv}:{ciphertext}:{authTag}`

**Throws**: If encryption key not set or invalid

#### `decrypt(ciphertext: string): string`
Decrypts ciphertext using AES-256-GCM.

**Returns**: Plaintext string

**Throws**: If decryption fails or data tampered

#### `isEncrypted(value: string): boolean`
Checks if value is encrypted.

**Returns**: `true` if starts with `encrypted:v1:`

#### `generateKey(): string`
Generates new 256-bit encryption key.

**Returns**: 64-character hex string

### `session-encryption.ts`

#### `encryptAuthorization<T>(auth: T): T`
Encrypts `sessionPrivateKey` field in authorization object.

**Returns**: Authorization object with encrypted key

**Idempotent**: Skips if already encrypted

#### `decryptAuthorization<T>(auth: T): T`
Decrypts `sessionPrivateKey` field in authorization object.

**Returns**: Authorization object with plaintext key

**Backward Compatible**: Handles plaintext keys

#### `isAuthorizationEncrypted(auth: Authorization): boolean`
Checks if authorization has encrypted session key.

**Returns**: `true` if encrypted

## Examples

### Example 1: Register Agent Session
```typescript
// app/api/agent/register/route.ts
import { encryptAuthorization } from '@/lib/security/session-encryption';

const authData = encryptAuthorization({
  type: 'zerodev-session-key',
  smartAccountAddress: '0x...',
  sessionKeyAddress: '0x...',
  sessionPrivateKey: '0x...', // Encrypted here
  expiry: Date.now() / 1000 + 86400 * 30,
  approvedVaults: ['0x...'],
  timestamp: Date.now(),
});

await sql`
  UPDATE users
  SET authorization_7702 = ${JSON.stringify(authData)}
  WHERE wallet_address = ${address}
`;
```

### Example 2: Execute Autonomous Rebalance
```typescript
// app/api/agent/cron/route.ts
import { decryptAuthorization } from '@/lib/security/session-encryption';

// Query users (no decryption needed)
const users = await sql`
  SELECT authorization_7702
  FROM users
  WHERE auto_optimize_enabled = true
`;

for (const user of users) {
  // Decrypt only when executing
  const auth = decryptAuthorization(user.authorization_7702);

  // Use decrypted key for transaction
  await executeRebalance(
    auth.smartAccountAddress,
    params,
    auth.sessionPrivateKey // Plaintext here
  );
}
```

### Example 3: Gasless Transfer
```typescript
// app/api/transfer/send/route.ts
import { decryptAuthorization } from '@/lib/security/session-encryption';

const users = await sql`
  SELECT transfer_authorization
  FROM users
  WHERE wallet_address = ${address}
`;

const auth = decryptAuthorization(users[0].transfer_authorization);

await executeGaslessTransfer({
  sessionPrivateKey: auth.sessionPrivateKey, // Plaintext
  recipient,
  amount,
});
```

## Support

For questions or issues:
1. Check [ENCRYPTION_IMPLEMENTATION.md](../../ENCRYPTION_IMPLEMENTATION.md)
2. Run test suite to verify setup
3. Review error messages in logs
4. Check environment variables

## License

MIT
