import { encodeFunctionData, parseAbi, createPublicClient, http, type Hex } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const VAULT_ABI = parseAbi([
  'function redeem(uint256 shares, address receiver, address owner) returns (uint256 assets)',
  'function deposit(uint256 assets, address receiver) returns (uint256 shares)',
]);

const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
]);

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const MAX_UINT256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

// EntryPoint V0.7 object (required format for ZeroDev SDK v5)
const ENTRYPOINT_V07 = {
  address: "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as `0x${string}`,
  version: "0.7" as const,
};

// Function selectors for scoped permissions
const FUNCTION_SELECTORS = {
  // ERC4626 Vault operations
  REDEEM: "0xba087652" as Hex,   // redeem(uint256,address,address)
  DEPOSIT: "0x6e553f65" as Hex,  // deposit(uint256,address)
  WITHDRAW: "0xb460af94" as Hex, // withdraw(uint256,address,address)
  // ERC20 operations
  APPROVE: "0x095ea7b3" as Hex,  // approve(address,uint256)
  TRANSFER: "0xa9059cbb" as Hex, // transfer(address,uint256)
};

export interface RebalanceParams {
  fromVault: `0x${string}`;
  toVault: `0x${string}`;
  shares: bigint;
  userAddress: `0x${string}`;
}

export interface RebalanceCall {
  to: `0x${string}`;
  data: `0x${string}`;
  value: bigint;
}

export interface RebalanceResult {
  taskId: string;
  success: boolean;
  error?: string;
}

/**
 * Build transaction calls for vault rebalancing
 * Three-step process:
 * 1. Redeem shares from source vault → receive USDC
 * 2. Approve destination vault to spend USDC
 * 3. Deposit USDC into destination vault
 *
 * @param params - Rebalancing parameters
 * @returns Array of transaction calls
 */
export function buildRebalanceCalls(params: RebalanceParams): RebalanceCall[] {
  return [
    // Step 1: Redeem from source vault
    {
      to: params.fromVault,
      data: encodeFunctionData({
        abi: VAULT_ABI,
        functionName: 'redeem',
        args: [params.shares, params.userAddress, params.userAddress]
      }),
      value: BigInt(0)
    },
    // Step 2: Approve destination vault (max approval for efficiency)
    {
      to: USDC_ADDRESS,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [params.toVault, MAX_UINT256]
      }),
      value: BigInt(0)
    },
    // Step 3: Deposit to destination vault (max amount to deposit all received USDC)
    {
      to: params.toVault,
      data: encodeFunctionData({
        abi: VAULT_ABI,
        functionName: 'deposit',
        args: [MAX_UINT256, params.userAddress] // MAX_UINT256 = deposit all
      }),
      value: BigInt(0)
    }
  ];
}

/**
 * Execute rebalancing via ZeroDev Kernel account with session key
 * All gas fees sponsored via bundler paymaster
 *
 * @param smartAccountAddress - User's Kernel smart account address
 * @param params - Rebalancing parameters
 * @param sessionPrivateKey - Session key private key from database
 * @returns Task ID and success status
 */
/**
 * Build scoped call policy permissions for vault operations
 *
 * SECURITY: Uses toCallPolicy instead of toSudoPolicy to limit
 * session key permissions to only approved vault operations.
 *
 * @param approvedVaults - List of vault addresses the session key can interact with
 * @returns Call policy permissions array
 */
function buildScopedPermissions(approvedVaults: `0x${string}`[]) {
  const permissions: Array<{ target: `0x${string}`; selector: Hex }> = [];

  // Add vault operation permissions for each approved vault
  for (const vaultAddress of approvedVaults) {
    permissions.push(
      { target: vaultAddress, selector: FUNCTION_SELECTORS.REDEEM },
      { target: vaultAddress, selector: FUNCTION_SELECTORS.DEPOSIT },
      { target: vaultAddress, selector: FUNCTION_SELECTORS.WITHDRAW }
    );
  }

  // Add USDC approve permission (for all vaults)
  permissions.push({
    target: USDC_ADDRESS,
    selector: FUNCTION_SELECTORS.APPROVE,
  });

  return permissions;
}

export async function executeRebalance(
  smartAccountAddress: `0x${string}`,
  params: RebalanceParams,
  sessionPrivateKey: `0x${string}`,
  approvedVaults?: `0x${string}`[]
): Promise<RebalanceResult> {
  try {
    console.log('[Rebalance] Starting ZeroDev execution with scoped permissions...');

    // 1. Create session key signer from private key
    const sessionKeySigner = privateKeyToAccount(sessionPrivateKey);

    // 2. Create public client
    const publicClient = createPublicClient({
      chain: base,
      transport: http(),
    });

    // 3. Import ZeroDev SDK
    const { createKernelAccount, createKernelAccountClient } = await import('@zerodev/sdk');
    const { KERNEL_V3_1 } = await import('@zerodev/sdk/constants');
    const { toPermissionValidator } = await import('@zerodev/permissions');
    const { toCallPolicy, toSudoPolicy } = await import('@zerodev/permissions/policies');
    const { toECDSASigner } = await import('@zerodev/permissions/signers');

    // 4. Convert session key to ModularSigner for permission validator
    const sessionSigner = await toECDSASigner({ signer: sessionKeySigner });

    // 5. Build policy based on whether approved vaults are provided
    // SECURITY: Use scoped toCallPolicy when vault list is available
    // Fallback to toSudoPolicy for backward compatibility (legacy registrations)
    let policy;
    if (approvedVaults && approvedVaults.length > 0) {
      const permissions = buildScopedPermissions(approvedVaults);
      console.log('[Rebalance] Using scoped policy with', permissions.length, 'permissions');
      // Use CallPolicyVersion enum for SDK compatibility
      const { CallPolicyVersion } = await import('@zerodev/permissions/policies');
      policy = toCallPolicy({
        policyVersion: CallPolicyVersion.V0_0_5,
        permissions,
      });
    } else {
      // DEPRECATED: Legacy path for old registrations without vault list
      console.warn('[Rebalance] Using sudo policy (legacy) - consider re-registering');
      policy = toSudoPolicy({});
    }

    // 6. Create permission validator with session key
    const permissionValidator = await toPermissionValidator(publicClient, {
      signer: sessionSigner,
      entryPoint: ENTRYPOINT_V07,
      policies: [policy],
      kernelVersion: KERNEL_V3_1,
    });

    // 6. Create Kernel account with session key permissions
    const kernelAccount = await createKernelAccount(publicClient, {
      address: smartAccountAddress,
      plugins: {
        sudo: permissionValidator,
      },
      entryPoint: ENTRYPOINT_V07,
      kernelVersion: KERNEL_V3_1,
    });

    // 7. Create Kernel account client for execution (no entryPoint param - comes from account)
    const bundlerUrl = process.env.ZERODEV_BUNDLER_URL ||
      `https://rpc.zerodev.app/api/v2/bundler/${process.env.ZERODEV_PROJECT_ID}`;

    const kernelClient = await createKernelAccountClient({
      account: kernelAccount,
      chain: base,
      bundlerTransport: http(bundlerUrl),
    });

    // 8. Build rebalance calls
    const calls = buildRebalanceCalls(params);

    console.log('[Rebalance] Executing batch transaction...');

    // 9. Execute batch transaction via UserOperation
    // Use encodeCalls (not encodeCallData) as per SDK v5 API
    const userOpHash = await kernelClient.sendUserOperation({
      calls: calls.map(call => ({
        to: call.to,
        value: call.value,
        data: call.data,
      })),
    });

    console.log('[Rebalance] ✓ UserOp submitted:', userOpHash);

    // 10. Wait for transaction receipt
    const receipt = await kernelClient.waitForUserOperationReceipt({
      hash: userOpHash,
    });

    console.log('[Rebalance] ✓ Transaction confirmed:', receipt.receipt.transactionHash);

    return {
      taskId: receipt.receipt.transactionHash,
      success: true
    };
  } catch (error: any) {
    console.error('[Rebalance] ❌ Execution error:', error);
    return {
      taskId: '',
      success: false,
      error: error.message
    };
  }
}

/**
 * Simulate rebalancing to check for errors before execution
 *
 * @param smartAccountAddress - User's smart account
 * @param params - Rebalancing parameters
 * @param sessionPrivateKey - Session key private key
 * @returns true if simulation succeeds
 */
export async function simulateRebalance(
  smartAccountAddress: `0x${string}`,
  params: RebalanceParams,
  sessionPrivateKey: `0x${string}`
): Promise<{ success: boolean; error?: string }> {
  try {
    const calls = buildRebalanceCalls(params);

    // TODO: Add simulation via Tenderly or similar
    console.log('[Rebalance] Simulation would execute:', calls.length, 'calls');

    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Estimate gas cost for rebalancing (for decision making)
 *
 * @returns Estimated gas cost in USD
 */
export function estimateRebalanceGasCost(): number {
  // Conservative estimate for 3 transactions on Base:
  // - Redeem: ~100k gas
  // - Approve: ~50k gas
  // - Deposit: ~100k gas
  // Total: ~250k gas @ 0.1 gwei = ~$0.50
  return 0.5;
}
