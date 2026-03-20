/**
 * Transfer Session Key Management with ZeroDev
 *
 * Creates restricted session keys for gasless USDC transfers only.
 * Uses the same serialize/deserialize pattern as agent sessions
 * (see client-secure.ts) to properly install the permission validator
 * on-chain and avoid storing raw private keys.
 */

import type { Hex } from "viem";
import { base } from "viem/chains";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  encodeFunctionData,
  erc20Abi,
  parseAbi,
} from "viem";
import { privateKeyToAccount, generatePrivateKey, toAccount } from "viem/accounts";
import { CHAIN_CONFIG, USDC_ADDRESS } from "@/lib/config";

// Maximum USDC amount per transfer session call (500 USDC with 6 decimals)
const MAX_USDC_PER_TRANSFER = BigInt(500) * BigInt(1e6);

import { ENTRYPOINT_V07 } from "@/lib/zerodev/constants";

export interface PrivyWalletProvider {
  getEthereumProvider(): Promise<any>;
  address: string;
}

export interface TransferSessionAuthorization {
  type: "zerodev-transfer-session";
  smartAccountAddress: `0x${string}`;
  sessionKeyAddress: `0x${string}`;
  serializedAccount?: string; // Serialized kernel account (encrypted at rest). Optional for backward compat.
  expiry: number;
  createdAt: number;
  // Legacy field — kept for backward compatibility with old sessions.
  // New sessions do NOT populate this field.
  sessionPrivateKey?: `0x${string}`;
}

/**
 * Create transfer-only session key with restricted permissions.
 *
 * Uses the same serialize/deserialize pattern as agent sessions:
 * 1. Create Kernel V3 smart account using Privy wallet as sudo signer
 * 2. Generate session key with call policy restricted to USDC.transfer() only
 * 3. Serialize the account (captures enable signature from sudo/EOA)
 * 4. Return serializedAccount for encrypted storage — no raw private key stored
 *
 * The server later calls `createDeserializedKernelClient(serializedAccount)` to
 * execute transfers, which properly uses the on-chain permission validator.
 *
 * @param privyWallet - Privy wallet object
 * @param userAddress - User's EOA address
 * @returns Transfer session authorization data (with serializedAccount)
 */
export async function createTransferSessionKey(
  privyWallet: PrivyWalletProvider,
  userAddress: `0x${string}`
): Promise<TransferSessionAuthorization> {
  try {
    console.log("[TransferSession] Starting transfer session setup...");
    console.log("[TransferSession] User EOA:", userAddress);

    // 1. Get Privy wallet provider
    const provider = await privyWallet.getEthereumProvider();

    // 2. Create public client for blockchain reads
    const publicClient = createPublicClient({
      chain: base,
      transport: http(CHAIN_CONFIG.rpcUrl),
    });

    // 3. Create wallet client from Privy provider
    console.log("[TransferSession] Creating wallet client from Privy wallet...");
    const walletClient = createWalletClient({
      account: userAddress,
      chain: base,
      transport: custom(provider),
    });

    // 4. Generate session key (private key embedded in serialized account)
    console.log("[TransferSession] Generating session key...");
    const sessionPrivateKey = generatePrivateKey();
    const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);
    const sessionKeyAddress = sessionKeyAccount.address;

    console.log("[TransferSession] Session key generated:", sessionKeyAddress);

    // 5. Create session key validator with restricted call policy
    const { createKernelAccount } = await import("@zerodev/sdk");
    const { KERNEL_V3_3 } = await import("@zerodev/sdk/constants");
    const { toPermissionValidator } = await import("@zerodev/permissions");
    const { serializePermissionAccount } = await import("@zerodev/permissions");
    const {
      toCallPolicy,
      CallPolicyVersion,
      toGasPolicy,
      toRateLimitPolicy,
      toTimestampPolicy,
      ParamCondition,
    } = await import("@zerodev/permissions/policies");
    const { toECDSASigner } = await import("@zerodev/permissions/signers");

    const expiry = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days

    // Convert session key account to a ModularSigner
    const sessionSigner = await toECDSASigner({ signer: sessionKeyAccount });

    // Create call policy restricted to USDC.transfer() with amount cap
    const callPolicy = toCallPolicy({
      policyVersion: CallPolicyVersion.V0_0_5,
      permissions: [
        {
          target: USDC_ADDRESS,
          abi: parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]),
          functionName: "transfer",
          args: [
            null, // any recipient
            { condition: ParamCondition.LESS_THAN_OR_EQUAL, value: MAX_USDC_PER_TRANSFER },
          ],
          valueLimit: 0n,
        },
      ],
    });

    // Gas policy: cap gas spend
    const gasPolicy = toGasPolicy({
      allowed: BigInt(500_000) * BigInt(100_000_000), // 500k gas * 0.1 gwei
    });

    // Rate limit: max 10 transfers per 24 hours
    const rateLimitPolicy = toRateLimitPolicy({
      count: 10,
      interval: 86400,
    });

    // On-chain expiry enforcement
    const timestampPolicy = toTimestampPolicy({
      validAfter: Math.floor(Date.now() / 1000),
      validUntil: expiry,
    });

    // Create permission validator with all policies
    const permissionValidator = await toPermissionValidator(publicClient, {
      signer: sessionSigner,
      entryPoint: ENTRYPOINT_V07,
      policies: [callPolicy, gasPolicy, rateLimitPolicy, timestampPolicy],
      kernelVersion: KERNEL_V3_3,
    });

    console.log("[TransferSession] Session key configured with transfer-only permissions");

    // 6. Create Kernel account with Privy wallet as sudo, session key as regular
    // Wrap Privy wallet as LocalAccount (type: "local") for the SDK
    const eoaLocalAccount = toAccount({
      address: userAddress,
      signMessage: async ({ message }) => walletClient.signMessage({ message }),
      signTransaction: async () => {
        throw new Error("signTransaction not needed for transfer session");
      },
      signTypedData: async (typedData: any) => walletClient.signTypedData(typedData),
    });

    console.log("[TransferSession] Creating Kernel account (EOA=sudo, sessionKey=regular)...");
    const kernelAccount = await createKernelAccount(publicClient, {
      plugins: {
        regular: permissionValidator,
      },
      entryPoint: ENTRYPOINT_V07,
      kernelVersion: KERNEL_V3_3,
      address: userAddress,
      eip7702Account: eoaLocalAccount,
    });

    const smartAccountAddress = kernelAccount.address;
    console.log("[TransferSession] Kernel account created:", smartAccountAddress);

    // 7. Serialize the account (captures enable signature via sudo/EOA signing)
    // This is the same pattern used by createAndSerializeAccount in client-secure.ts.
    // The serialized blob embeds the session private key — no separate raw key storage needed.
    console.log("[TransferSession] Serializing account (user signs enable data)...");
    const serializedAccount = await serializePermissionAccount(
      kernelAccount,
      sessionPrivateKey,
      undefined // Auto-generate enable signature (sudo signs)
    );

    console.log("[TransferSession] Account serialized successfully");

    // 8. Return authorization data — serializedAccount replaces raw sessionPrivateKey
    return {
      type: "zerodev-transfer-session",
      smartAccountAddress,
      sessionKeyAddress: sessionKeyAddress as `0x${string}`,
      serializedAccount,
      expiry,
      createdAt: Date.now(),
    };
  } catch (error: any) {
    console.error("[TransferSession] Session creation failed:", error);
    throw new Error(`Transfer session setup failed: ${error.message}`);
  }
}

/**
 * Validate transfer session is not expired.
 * Handles both new (serializedAccount) and legacy (sessionPrivateKey) formats.
 *
 * @param authorization - Transfer session authorization data
 * @returns true if session is valid and not expired
 */
export function validateTransferSession(authorization: TransferSessionAuthorization): {
  valid: boolean;
  reason?: string;
} {
  const now = Math.floor(Date.now() / 1000);

  if (!authorization) {
    return { valid: false, reason: "No session found" };
  }

  if (authorization.type !== "zerodev-transfer-session") {
    return { valid: false, reason: "Invalid session type" };
  }

  if (authorization.expiry < now) {
    return { valid: false, reason: "Session expired" };
  }

  if (!authorization.smartAccountAddress) {
    return { valid: false, reason: "Invalid session data" };
  }

  // Accept either serializedAccount (new) or sessionPrivateKey (legacy)
  if (!authorization.serializedAccount && !authorization.sessionPrivateKey) {
    return { valid: false, reason: "Invalid session data" };
  }

  return { valid: true };
}
