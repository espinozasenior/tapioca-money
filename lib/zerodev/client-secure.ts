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

import { createPublicClient, http, parseAbi, type Hex } from "viem";
import { base } from "viem/chains";
import { toAccount } from "viem/accounts";
import { CHAIN_CONFIG } from "@/lib/config";

// Session key expiry: 7 days
const SESSION_KEY_EXPIRY_DAYS = 7;

// Function selectors for scoped permissions
const APPROVE_SELECTOR = "0x095ea7b3" as Hex; // approve(address,uint256)
const DEPOSIT_SELECTOR = "0x6e553f65" as Hex; // deposit(uint256,address)
const REDEEM_SELECTOR = "0xba087652" as Hex; // redeem(uint256,address,address)
const WITHDRAW_SELECTOR = "0xb460af94" as Hex; // withdraw(uint256,address,address)
const TRANSFER_SELECTOR = "0xa9059cbb" as Hex; // transfer(address,uint256)
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`;

// Maximum USDC amount per session key call (10,000.000001 USDC with 6 decimals)
// The +1 forces a new permissionHash to break the re-registration deadlock
// where the old validator blocks new installations with the same hash.
const MAX_USDC_PER_CALL = BigInt(10_000) * BigInt(1e6) + 1n;

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
 * Shared session key + permission builder.
 *
 * Extracts the duplicated session key generation, permission construction,
 * and policy creation from the three createAndSerialize* variants.
 *
 * @returns Session key material and the ready-to-use permission validator
 */
async function buildSessionKeyAndPermissions(approvedVaults: `0x${string}`[]) {
  // Dynamic imports to minimize client bundle (tree-shaken)
  const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
  const { KERNEL_V3_3 } = await import("@zerodev/sdk/constants");
  const { toPermissionValidator } = await import("@zerodev/permissions");
  const {
    toCallPolicy,
    CallPolicyVersion,
    toGasPolicy,
    toRateLimitPolicy,
    toTimestampPolicy,
    ParamCondition,
  } = await import("@zerodev/permissions/policies");
  const { toECDSASigner } = await import("@zerodev/permissions/signers");

  // 1. Generate session key pair (client-side)
  const sessionPrivateKey = generatePrivateKey();
  const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);
  console.log("[ZeroDev] Session key address:", sessionKeyAccount.address);

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
    abi: parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]),
    functionName: "approve",
    args: [null, { condition: ParamCondition.LESS_THAN_OR_EQUAL, value: MAX_USDC_PER_CALL }],
    valueLimit: 0n,
  });

  // USDC transfer — cap amount parameter
  permissions.push({
    target: USDC_ADDRESS,
    abi: parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]),
    functionName: "transfer",
    args: [null, { condition: ParamCondition.LESS_THAN_OR_EQUAL, value: MAX_USDC_PER_CALL }],
    valueLimit: 0n,
  });

  // Vault operations — cap deposit amounts, allow redeem/withdraw (funds return to user)
  for (const vault of approvedVaults) {
    permissions.push({
      target: vault,
      abi: parseAbi(["function deposit(uint256 assets, address receiver) returns (uint256)"]),
      functionName: "deposit",
      args: [{ condition: ParamCondition.LESS_THAN_OR_EQUAL, value: MAX_USDC_PER_CALL }, null],
      valueLimit: 0n,
    });
    // Approve vault share token (needed for YO Gateway redeem flow: approve shares → gateway.redeem)
    permissions.push({
      target: vault,
      abi: parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]),
      functionName: "approve",
      args: [null, null],
      valueLimit: 0n,
    });
    // Redeem/withdraw move funds back to user — no amount cap needed
    permissions.push({ target: vault, selector: REDEEM_SELECTOR, valueLimit: 0n });
    permissions.push({ target: vault, selector: WITHDRAW_SELECTOR, valueLimit: 0n });
  }

  // YO Gateway permissions — deposit and redeem via Gateway
  const { YO_GATEWAY_ADDRESS, YO_GATEWAY_DEPOSIT_SELECTOR, YO_GATEWAY_REDEEM_SELECTOR } =
    await import("@/lib/yo/constants");
  permissions.push({
    target: YO_GATEWAY_ADDRESS as `0x${string}`,
    selector: YO_GATEWAY_DEPOSIT_SELECTOR,
    valueLimit: 0n,
  });
  permissions.push({
    target: YO_GATEWAY_ADDRESS as `0x${string}`,
    selector: YO_GATEWAY_REDEEM_SELECTOR,
    valueLimit: 0n,
  });

  const callPolicy = toCallPolicy({
    policyVersion: CallPolicyVersion.V0_0_5,
    permissions,
  });

  const gasPolicy = toGasPolicy({
    allowed: BigInt(500_000) * BigInt(100_000_000), // 500k gas * 0.1 gwei
  });

  const rateLimitPolicy = toRateLimitPolicy({
    count: 90,
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

  return {
    sessionPrivateKey,
    sessionKeyAccount,
    permissionValidator,
    expiryTimestamp,
    publicClient,
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
  approvedVaults: `0x${string}`[]
): Promise<{ serializedAccount: string; sessionKeyAddress: `0x${string}`; expiry: number }> {
  console.log("[ZeroDev 7702] Creating serialized account client-side...");

  const { createKernelAccount } = await import("@zerodev/sdk");
  const { KERNEL_V3_3 } = await import("@zerodev/sdk/constants");
  const { serializePermissionAccount } = await import("@zerodev/permissions");

  const { sessionPrivateKey, sessionKeyAccount, permissionValidator, expiryTimestamp, publicClient } =
    await buildSessionKeyAndPermissions(approvedVaults);

  // Wrap Privy wallet as a LocalAccount (type: "local") for the SDK
  const eoaLocalAccount = toAccount({
    address: userAddress,
    signMessage: async ({ message }) => walletClient.signMessage({ message }),
    signTransaction: async () => {
      throw new Error("signTransaction not needed for registration");
    },
    signTypedData: async (typedData) => walletClient.signTypedData(typedData),
  });

  // Create kernel account with EOA as sudo + session key as regular
  console.log("[ZeroDev 7702] Creating kernel account (EOA=sudo, sessionKey=regular)...");
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

  console.log("[ZeroDev 7702] Kernel account created:", kernelAccount.address);

  // Serialize the account (captures enable signature via sudo/EOA signing)
  console.log("[ZeroDev 7702] Serializing account (user signs enable data)...");
  const serialized = await serializePermissionAccount(
    kernelAccount,
    sessionPrivateKey,
    undefined, // Auto-generate enable signature (sudo signs)
    signedEip7702Auth // Embed EIP-7702 auth
  );

  console.log("[ZeroDev 7702] Account serialized successfully");
  return {
    serializedAccount: serialized,
    sessionKeyAddress: sessionKeyAccount.address as `0x${string}`,
    expiry: expiryTimestamp,
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
  walletClient: any
): Promise<SecureSessionKeyResult> {
  try {
    console.log("[ZeroDev 7702] Starting registration (serialize/deserialize pattern)...");
    console.log("[ZeroDev 7702] User EOA:", userAddress);

    // 1. Fetch approved vaults from the optimizer API (includes both Morpho + YO)
    console.log("[ZeroDev 7702] Fetching vault opportunities...");
    const optimizeResponse = await fetch("/api/optimize");
    if (!optimizeResponse.ok) {
      throw new Error("Failed to fetch vault opportunities");
    }
    const { opportunities } = await optimizeResponse.json();
    const approvedVaults = opportunities
      .filter((o: any) => o.metadata?.vaultAddress)
      .map((o: any) => o.metadata.vaultAddress) as `0x${string}`[];

    // Include YO Gateway address for session key scoping
    const { YO_GATEWAY_ADDRESS } = await import("@/lib/yo/constants");
    if (!approvedVaults.some((v) => v.toLowerCase() === YO_GATEWAY_ADDRESS.toLowerCase())) {
      approvedVaults.push(YO_GATEWAY_ADDRESS as `0x${string}`);
    }

    console.log(
      "[ZeroDev 7702] Fetched",
      approvedVaults.length,
      "vaults (including YO Gateway)"
    );

    // 2. Create and serialize the kernel account client-side
    // This captures the enable signature from the EOA (sudo)
    const { serializedAccount, sessionKeyAddress, expiry } = await createAndSerializeAccount(
      userAddress,
      signedEip7702Auth,
      walletClient,
      approvedVaults
    );

    // 3. Send serialized account to server for encrypted storage
    console.log("[ZeroDev 7702] Sending serialized account to server...");
    const sessionKeyResponse = await fetch("/api/agent/generate-session-key", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
      throw new Error(error.error || "Failed to store session data");
    }

    console.log("[ZeroDev 7702] Session key address:", sessionKeyAddress);
    console.log("[ZeroDev 7702] Expiry:", new Date(expiry * 1000).toISOString());
    console.log("[ZeroDev 7702] Registration complete");

    return {
      smartAccountAddress: userAddress,
      sessionKeyAddress: sessionKeyAddress as `0x${string}`,
      expiry,
      approvedVaults,
    };
  } catch (error: any) {
    console.error("[ZeroDev 7702] Registration failed:", error);
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
export async function checkSmartAccountActive(address: `0x${string}`): Promise<DelegationStatus> {
  try {
    const publicClient = createPublicClient({
      chain: base,
      transport: http(CHAIN_CONFIG.rpcUrl),
    });

    const code = await publicClient.getBytecode({ address });

    if (!code || code === "0x") {
      return { active: false, isDelegation: false };
    }

    // EIP-7702 delegation designator: 0xef0100 + 20-byte implementation address
    // Total length: '0x' + 'ef0100' (6 chars) + address (40 chars) = 48 chars
    if (code.startsWith("0xef0100") && code.length === 48) {
      const implementationAddress = ("0x" + code.slice(8)) as `0x${string}`;
      return { active: true, isDelegation: true, implementationAddress };
    }

    // Has bytecode but not an EIP-7702 delegation (e.g. regular contract)
    return { active: true, isDelegation: false };
  } catch (error) {
    console.error("[ZeroDev Secure] Failed to check smart account status:", error);
    return { active: false, isDelegation: false };
  }
}

/**
 * Revoke session key (soft revoke — calls server to delete encrypted key)
 * Agent stops immediately since the session key is deleted from DB.
 */
export async function revokeSessionKey(address: string, accessToken: string): Promise<void> {
  const response = await fetch("/api/agent/generate-session-key", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ address }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to revoke session key");
  }

  console.log("[ZeroDev 7702] Session key revoked (soft)");
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
/**
 * Delegate an external wallet (Brave, MetaMask) to Kernel V3.3 via a Type 4 transaction.
 *
 * External wallets can't sign standalone EIP-7702 authorizations — they only sign
 * authorization internally when sending Type 4 transactions via `wallet_sendCalls`.
 * This function sends the delegation tx and waits for on-chain confirmation.
 *
 * @param walletClient - Viem WalletClient from external wallet provider
 * @param userAddress - User's EOA address
 * @param implAddress - Kernel V3.3 implementation address to delegate to
 */
export async function delegateViaExternalWallet(
  walletClient: any,
  userAddress: `0x${string}`,
  implAddress: `0x${string}`
): Promise<`0x${string}`> {
  console.log("[ZeroDev 7702] Delegating external wallet to Kernel V3.3...");
  console.log("[ZeroDev 7702] User:", userAddress, "→ Impl:", implAddress);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(CHAIN_CONFIG.rpcUrl),
  });

  // Pre-check: query wallet_getCapabilities to see if EIP-7702 is supported.
  // Wallets that don't support Type 4 transactions silently drop the authorizationList
  // and send a plain Type 2 tx, wasting gas with no delegation.
  let has7702Support = false;
  try {
    const capabilities: Record<string, any> = await walletClient.request({
      method: "wallet_getCapabilities",
      params: [userAddress],
    });
    // Check Base chain capabilities (chainId 8453 = 0x2105)
    const baseCaps = capabilities?.["0x2105"] ?? capabilities?.[8453] ?? capabilities?.["8453"];
    has7702Support = !!(
      baseCaps?.atomicBatch?.supported ||
      baseCaps?.atomic?.status === "supported" ||
      baseCaps?.atomic?.status === "ready"
    );
    console.log("[ZeroDev 7702] Wallet capabilities:", { baseCaps, has7702Support });
  } catch {
    // wallet_getCapabilities not supported — wallet likely doesn't support 5792/7702
    console.log("[ZeroDev 7702] wallet_getCapabilities not available");
  }

  if (!has7702Support) {
    throw new Error(
      "Your wallet does not support EIP-7702 delegation yet. " +
        "Please switch to your Privy embedded wallet in the wallet selector to register the agent."
    );
  }

  // Ensure the external wallet is on Base before sending the Type 4 tx.
  try {
    await walletClient.switchChain({ id: base.id });
  } catch (switchError: any) {
    if (switchError?.code === 4902) {
      await walletClient.addChain({ chain: base });
      await walletClient.switchChain({ id: base.id });
    } else {
      throw new Error(
        `Please switch your wallet to Base network. Chain switch failed: ${switchError.message}`
      );
    }
  }

  // Send Type 4 transaction via raw JSON-RPC.
  // Viem's sendTransaction expects signed auths (nonce, r, s, yParity) in authorizationList.
  // External wallets that support EIP-7702 sign the authorization internally when they
  // receive unsigned auths — we bypass viem's formatter and send raw RPC directly.
  const { numberToHex } = await import("viem");
  const txHash: `0x${string}` = await walletClient.request({
    method: "eth_sendTransaction",
    params: [
      {
        type: "0x4",
        from: userAddress,
        to: userAddress,
        data: "0x",
        value: "0x0",
        authorizationList: [
          {
            address: implAddress,
            chainId: numberToHex(8453),
          },
        ],
      },
    ],
  });

  console.log("[ZeroDev 7702] Delegation tx submitted:", txHash);

  // Wait for confirmation and verify the tx was actually Type 4
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log("[ZeroDev 7702] Delegation tx confirmed, type:", receipt.type);

  if (receipt.type !== "eip7702") {
    // Wallet silently sent a regular tx, ignoring authorizationList
    throw new Error(
      "Wallet sent a regular transaction instead of EIP-7702 Type 4. " +
        "Your wallet does not fully support EIP-7702. " +
        "Please switch to your Privy embedded wallet to register the agent."
    );
  }

  // Verify delegation on-chain
  const status = await checkSmartAccountActive(userAddress);
  if (!status.active || !status.isDelegation) {
    throw new Error(
      "EIP-7702 transaction confirmed but delegation not detected on-chain. " +
        "Please switch to your Privy embedded wallet to register the agent."
    );
  }

  console.log("[ZeroDev 7702] Delegation verified on-chain:", status.implementationAddress);
  return txHash;
}

/**
 * Create and serialize a kernel account for an external wallet.
 *
 * Unlike createAndSerializeAccount, this function does NOT pass eip7702Auth.
 * The delegation is already on-chain (via delegateViaExternalWallet), so the SDK
 * detects it and the signAuthorization closure returns undefined — no auth in UserOps.
 *
 * The external wallet signs the enable typed data via eth_signTypedData_v4.
 */
async function createAndSerializeAccountExternal(
  userAddress: `0x${string}`,
  walletClient: any,
  approvedVaults: `0x${string}`[]
): Promise<{ serializedAccount: string; sessionKeyAddress: `0x${string}`; expiry: number }> {
  console.log("[ZeroDev 7702] Creating serialized account for external wallet...");

  const { createKernelAccount } = await import("@zerodev/sdk");
  const { KERNEL_V3_3 } = await import("@zerodev/sdk/constants");
  const { serializePermissionAccount } = await import("@zerodev/permissions");

  const { sessionPrivateKey, sessionKeyAccount, permissionValidator, expiryTimestamp, publicClient } =
    await buildSessionKeyAndPermissions(approvedVaults);

  // Wrap external wallet as LocalAccount for the SDK
  const eoaLocalAccount = toAccount({
    address: userAddress,
    signMessage: async ({ message }) => walletClient.signMessage({ message }),
    signTransaction: async () => {
      throw new Error("signTransaction not needed for registration");
    },
    signTypedData: async (typedData) => walletClient.signTypedData(typedData),
  });

  // Create kernel account — NO eip7702Auth since delegation is already on-chain
  console.log("[ZeroDev 7702] Creating kernel account (delegation already on-chain)...");
  const kernelAccount = await createKernelAccount(publicClient, {
    plugins: {
      regular: permissionValidator,
    },
    entryPoint: ENTRYPOINT_V07,
    kernelVersion: KERNEL_V3_3,
    address: userAddress,
    eip7702Account: eoaLocalAccount,
  });

  console.log("[ZeroDev 7702] Kernel account created:", kernelAccount.address);

  // Serialize — NO eip7702Auth arg
  console.log("[ZeroDev 7702] Serializing account (external wallet signs enable data)...");
  const serialized = await serializePermissionAccount(
    kernelAccount,
    sessionPrivateKey,
    undefined, // Auto-generate enable signature (sudo signs via external wallet)
  );

  console.log("[ZeroDev 7702] Account serialized successfully (external wallet)");
  return {
    serializedAccount: serialized,
    sessionKeyAddress: sessionKeyAccount.address as `0x${string}`,
    expiry: expiryTimestamp,
  };
}

/**
 * Create and serialize a kernel account for ERC-4337 fallback (Privy smart wallet).
 *
 * Used when the user's external wallet doesn't support EIP-7702 (e.g. Brave).
 * The account operates at the Privy Kernel smart wallet address (separate from EOA),
 * and the embedded wallet (auto-created by Privy for all users) acts as sudo signer.
 *
 * NO eip7702Auth, NO eip7702Account — this is a standard ERC-4337 kernel account.
 *
 * @param smartWalletAddress - Privy Kernel smart wallet address (where funds live)
 * @param walletClient - Viem WalletClient from embedded wallet (signer)
 * @param approvedVaults - Approved vault addresses
 */
async function createAndSerializeAccountErc4337(
  smartWalletAddress: `0x${string}`,
  walletClient: any,
  approvedVaults: `0x${string}`[]
): Promise<{ serializedAccount: string; sessionKeyAddress: `0x${string}`; expiry: number }> {
  console.log("[ZeroDev 4337] Creating serialized account for ERC-4337 smart wallet...");
  console.log("[ZeroDev 4337] Smart wallet:", smartWalletAddress);

  const { createKernelAccount } = await import("@zerodev/sdk");
  const { KERNEL_V3_3 } = await import("@zerodev/sdk/constants");
  const { serializePermissionAccount } = await import("@zerodev/permissions");

  const { sessionPrivateKey, sessionKeyAccount, permissionValidator, expiryTimestamp, publicClient } =
    await buildSessionKeyAndPermissions(approvedVaults);

  // Wrap embedded wallet as LocalAccount for sudo signing.
  // toAccount() supports signMessage/signTypedData (delegated to walletClient).
  // IMPORTANT: Do NOT pass this as eip7702Account — the SDK would set up an
  // eip7702Authorization closure that calls signAuthorization, which toAccount()
  // does not implement (only privateKeyToAccount does). Instead, create a proper
  // ECDSA validator and pass it as plugins.sudo.
  const signerAddress = walletClient.account?.address ?? walletClient.account;
  const eoaLocalAccount = toAccount({
    address: signerAddress,
    signMessage: async ({ message }) => walletClient.signMessage({ message }),
    signTransaction: async () => {
      throw new Error("signTransaction not needed for registration");
    },
    signTypedData: async (typedData) => walletClient.signTypedData(typedData),
  });

  // Create ECDSA sudo validator from the embedded wallet signer.
  // This only uses signMessage/signTypedData — no signAuthorization needed.
  const { signerToEcdsaValidator } = await import("@zerodev/ecdsa-validator");
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: eoaLocalAccount,
    entryPoint: ENTRYPOINT_V07,
    kernelVersion: KERNEL_V3_3,
  });

  // Create kernel account — standard ERC-4337, no EIP-7702 involved.
  // Pass ECDSA validator as plugins.sudo so serializePermissionAccount can
  // generate the enable signature via signTypedData (not signAuthorization).
  console.log("[ZeroDev 4337] Creating kernel account (ERC-4337, embedded wallet=sudo)...");
  const kernelAccount = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
      regular: permissionValidator,
    },
    entryPoint: ENTRYPOINT_V07,
    kernelVersion: KERNEL_V3_3,
    address: smartWalletAddress, // The Privy smart wallet, NOT the user's EOA
    // NO eip7702Account — this is standard 4337, no signAuthorization needed
  });

  console.log("[ZeroDev 4337] Kernel account created:", kernelAccount.address);

  // Serialize — no eip7702Auth needed
  console.log("[ZeroDev 4337] Serializing account (embedded wallet signs enable data)...");
  const serialized = await serializePermissionAccount(
    kernelAccount,
    sessionPrivateKey,
    // No 3rd/4th args — standard 4337 serialization
  );

  console.log("[ZeroDev 4337] Account serialized successfully");
  return {
    serializedAccount: serialized,
    sessionKeyAddress: sessionKeyAccount.address as `0x${string}`,
    expiry: expiryTimestamp,
  };
}

/**
 * Register agent for an external wallet (Brave, MetaMask).
 *
 * This assumes delegation is already on-chain (via delegateViaExternalWallet).
 * Creates a kernel account without eip7702Auth, serializes it, and sends to server.
 *
 * The external wallet signs the enable typed data via eth_signTypedData_v4 prompt.
 *
 * @param userAddress - User's EOA address (already delegated on-chain)
 * @param accessToken - Privy access token for API authentication
 * @param walletClient - Viem WalletClient from external wallet provider
 */
export async function registerAgentSecureExternal(
  userAddress: `0x${string}`,
  accessToken: string,
  walletClient: any
): Promise<SecureSessionKeyResult> {
  try {
    console.log("[ZeroDev 7702] Starting external wallet registration...");
    console.log("[ZeroDev 7702] User EOA:", userAddress);

    // Verify delegation is active on-chain before proceeding
    const delegationStatus = await checkSmartAccountActive(userAddress);
    if (!delegationStatus.active || !delegationStatus.isDelegation) {
      throw new Error(
        "Delegation not found on-chain. Call delegateViaExternalWallet first."
      );
    }

    // 1. Fetch approved vaults from the optimizer API
    console.log("[ZeroDev 7702] Fetching vault opportunities...");
    const optimizeResponse = await fetch("/api/optimize");
    if (!optimizeResponse.ok) {
      throw new Error("Failed to fetch vault opportunities");
    }
    const { opportunities } = await optimizeResponse.json();
    const approvedVaults = opportunities
      .filter((o: any) => o.metadata?.vaultAddress)
      .map((o: any) => o.metadata.vaultAddress) as `0x${string}`[];

    // Include YO Gateway address
    const { YO_GATEWAY_ADDRESS } = await import("@/lib/yo/constants");
    if (!approvedVaults.some((v) => v.toLowerCase() === YO_GATEWAY_ADDRESS.toLowerCase())) {
      approvedVaults.push(YO_GATEWAY_ADDRESS as `0x${string}`);
    }

    console.log("[ZeroDev 7702] Fetched", approvedVaults.length, "vaults");

    // 2. Create and serialize the kernel account (no eip7702Auth)
    const { serializedAccount, sessionKeyAddress, expiry } =
      await createAndSerializeAccountExternal(userAddress, walletClient, approvedVaults);

    // 3. Send serialized account to server
    console.log("[ZeroDev 7702] Sending serialized account to server...");
    const sessionKeyResponse = await fetch("/api/agent/generate-session-key", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        address: userAddress,
        smartAccountAddress: userAddress,
        sessionKeyAddress,
        serializedAccount,
        approvedVaults,
        expiry,
      }),
    });

    if (!sessionKeyResponse.ok) {
      const error = await sessionKeyResponse.json();
      throw new Error(error.error || "Failed to store session data");
    }

    console.log("[ZeroDev 7702] External wallet registration complete");
    console.log("[ZeroDev 7702] Session key:", sessionKeyAddress);

    return {
      smartAccountAddress: userAddress,
      sessionKeyAddress: sessionKeyAddress as `0x${string}`,
      expiry,
      approvedVaults,
    };
  } catch (error: any) {
    console.error("[ZeroDev 7702] External wallet registration failed:", error);
    throw new Error(`External wallet registration failed: ${error.message}`);
  }
}

/**
 * Register agent via ERC-4337 fallback (Privy smart wallet).
 *
 * For wallets that don't support EIP-7702 (e.g. Brave). Uses the Privy
 * SmartWalletsProvider auto-created Kernel smart wallet as the execution target.
 * The embedded wallet (auto-created for all users) signs as sudo.
 *
 * @param smartWalletAddress - Privy Kernel smart wallet address (user.smartWallet.address)
 * @param eoaAddress - User's external wallet address (for DB record)
 * @param accessToken - Privy access token for API authentication
 * @param walletClient - Viem WalletClient from embedded wallet
 */
export async function registerAgentErc4337(
  smartWalletAddress: `0x${string}`,
  eoaAddress: `0x${string}`,
  accessToken: string,
  walletClient: any
): Promise<SecureSessionKeyResult> {
  try {
    console.log("[ZeroDev 4337] Starting ERC-4337 registration...");
    console.log("[ZeroDev 4337] Smart wallet:", smartWalletAddress);
    console.log("[ZeroDev 4337] User EOA:", eoaAddress);

    // 1. Fetch approved vaults from the optimizer API
    console.log("[ZeroDev 4337] Fetching vault opportunities...");
    const optimizeResponse = await fetch("/api/optimize");
    if (!optimizeResponse.ok) {
      throw new Error("Failed to fetch vault opportunities");
    }
    const { opportunities } = await optimizeResponse.json();
    const approvedVaults = opportunities
      .filter((o: any) => o.metadata?.vaultAddress)
      .map((o: any) => o.metadata.vaultAddress) as `0x${string}`[];

    // Include YO Gateway address
    const { YO_GATEWAY_ADDRESS } = await import("@/lib/yo/constants");
    if (!approvedVaults.some((v) => v.toLowerCase() === YO_GATEWAY_ADDRESS.toLowerCase())) {
      approvedVaults.push(YO_GATEWAY_ADDRESS as `0x${string}`);
    }

    console.log("[ZeroDev 4337] Fetched", approvedVaults.length, "vaults");

    // 2. Create and serialize the kernel account (ERC-4337, no eip7702)
    const { serializedAccount, sessionKeyAddress, expiry } =
      await createAndSerializeAccountErc4337(smartWalletAddress, walletClient, approvedVaults);

    // 3. Send serialized account to server with ERC-4337 type
    console.log("[ZeroDev 4337] Sending serialized account to server...");
    const sessionKeyResponse = await fetch("/api/agent/generate-session-key", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        address: eoaAddress, // User's external wallet (DB key)
        smartAccountAddress: smartWalletAddress, // Privy Kernel smart wallet
        sessionKeyAddress,
        serializedAccount,
        approvedVaults,
        expiry,
        type: "zerodev-erc4337-session", // Distinguish from 7702
      }),
    });

    if (!sessionKeyResponse.ok) {
      const error = await sessionKeyResponse.json();
      throw new Error(error.error || "Failed to store session data");
    }

    console.log("[ZeroDev 4337] ERC-4337 registration complete");
    console.log("[ZeroDev 4337] Session key:", sessionKeyAddress);

    return {
      smartAccountAddress: smartWalletAddress,
      sessionKeyAddress: sessionKeyAddress as `0x${string}`,
      expiry,
      approvedVaults,
    };
  } catch (error: any) {
    console.error("[ZeroDev 4337] Registration failed:", error);
    throw new Error(`ERC-4337 registration failed: ${error.message}`);
  }
}

export async function undelegateEoa(
  userAddress: `0x${string}`,
  walletClient: any,
  signedAuthorization: any
): Promise<`0x${string}`> {
  console.log("[ZeroDev 7702] Starting on-chain undelegation for:", userAddress);

  // Submit Type 4 transaction with pre-signed authorization to remove delegation.
  // Explicit gas required — providers don't auto-estimate for EIP-7702 Type 4 txs.
  // Base cost: 21000 (intrinsic) + ~2500 (EIP-7702 per-auth overhead) + buffer.
  const txHash = await walletClient.sendTransaction({
    to: userAddress,
    data: "0x" as `0x${string}`,
    value: BigInt(0),
    authorizationList: [signedAuthorization],
    gas: BigInt(30000),
  });

  console.log("[ZeroDev 7702] Undelegation tx submitted:", txHash);
  return txHash;
}
