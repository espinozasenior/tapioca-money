import { encodeFunctionData, parseAbi, createPublicClient, http, type Hex } from 'viem';
import { base } from 'viem/chains';
import { createDeserializedKernelClient, createSessionKernelClient } from '../zerodev/kernel-client';
import { checkSmartAccountActive } from '../zerodev/client-secure';

const VAULT_ABI = parseAbi([
  'function redeem(uint256 shares, address receiver, address owner) returns (uint256 assets)',
  'function deposit(uint256 assets, address receiver) returns (uint256 shares)',
]);

const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
]);

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const MAX_UINT256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

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
 * Uses previewRedeem to calculate expected USDC output for accurate deposit amount.
 */
export async function buildRebalanceCalls(params: RebalanceParams): Promise<RebalanceCall[]> {
  // Calculate expected USDC output from redeem via on-chain preview
  const publicClient = createPublicClient({ chain: base, transport: http() });
  const expectedAssets = await publicClient.readContract({
    address: params.fromVault,
    abi: parseAbi(['function previewRedeem(uint256 shares) view returns (uint256)']),
    functionName: 'previewRedeem',
    args: [params.shares],
  });

  // Apply 0.5% slippage buffer to account for rounding and timing differences
  const depositAmount = expectedAssets * 995n / 1000n;

  if (depositAmount === 0n) {
    throw new Error(`previewRedeem returned 0 for ${params.shares} shares on vault ${params.fromVault}`);
  }

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
    // Step 2: Approve destination vault with exact amount (not MAX_UINT256)
    {
      to: USDC_ADDRESS,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [params.toVault, depositAmount]
      }),
      value: BigInt(0)
    },
    // Step 3: Deposit calculated amount into destination vault
    {
      to: params.toVault,
      data: encodeFunctionData({
        abi: VAULT_ABI,
        functionName: 'deposit',
        args: [depositAmount, params.userAddress]
      }),
      value: BigInt(0)
    }
  ];
}

/**
 * Build scoped call policy permissions for vault operations
 */
function buildScopedPermissions(approvedVaults: `0x${string}`[]) {
  const permissions: Array<{ target: `0x${string}`; selector: Hex }> = [];

  for (const vaultAddress of approvedVaults) {
    permissions.push(
      { target: vaultAddress, selector: FUNCTION_SELECTORS.REDEEM },
      { target: vaultAddress, selector: FUNCTION_SELECTORS.DEPOSIT },
      { target: vaultAddress, selector: FUNCTION_SELECTORS.WITHDRAW }
    );
  }

  permissions.push({
    target: USDC_ADDRESS,
    selector: FUNCTION_SELECTORS.APPROVE,
  });

  return permissions;
}

/**
 * Execute rebalancing via ZeroDev Kernel account with session key
 * All gas fees sponsored via bundler paymaster
 */
export async function executeRebalance(
  smartAccountAddress: `0x${string}`,
  params: RebalanceParams,
  sessionPrivateKey: `0x${string}`,
  approvedVaults?: `0x${string}`[],
  eip7702SignedAuth?: any,
  serializedAccount?: string,
): Promise<RebalanceResult> {
  try {
    console.log('[Rebalance] Starting ZeroDev execution with scoped permissions...');

    // PRE-EXECUTION: Verify EIP-7702 delegation is active on-chain
    const delegationStatus = await checkSmartAccountActive(smartAccountAddress);
    if (!delegationStatus.active) {
      console.error('[Rebalance] Delegation not active for:', smartAccountAddress);
      return {
        taskId: '',
        success: false,
        error: 'EIP-7702 delegation not active on-chain. User must re-register.',
      };
    }
    if (delegationStatus.isDelegation) {
      const { KernelVersionToAddressesMap, KERNEL_V3_3 } = await import('@zerodev/sdk/constants');
      const expectedImpl = KernelVersionToAddressesMap[KERNEL_V3_3].accountImplementationAddress;
      if (delegationStatus.implementationAddress?.toLowerCase() !== expectedImpl.toLowerCase()) {
        console.error('[Rebalance] Delegation target mismatch:', delegationStatus.implementationAddress);
        return {
          taskId: '',
          success: false,
          error: `EIP-7702 delegated to wrong implementation: ${delegationStatus.implementationAddress}`,
        };
      }
    }

    // Create kernel client — prefer deserialized account (new pattern)
    let kernelClient;
    if (serializedAccount) {
      console.log('[Rebalance] Using deserialized kernel client');
      kernelClient = await createDeserializedKernelClient(serializedAccount);
    } else {
      // Legacy path
      console.warn('[Rebalance] Using legacy session key path — user should re-register');
      const permissions = (approvedVaults && approvedVaults.length > 0)
        ? buildScopedPermissions(approvedVaults)
        : [];
      kernelClient = await createSessionKernelClient({
        smartAccountAddress,
        sessionPrivateKey,
        permissions,
        eip7702SignedAuth,
      });
    }

    // Build rebalance calls
    const calls = await buildRebalanceCalls(params);

    console.log('[Rebalance] Executing batch transaction...');

    let userOpHash: string;
    try {
      userOpHash = await kernelClient.sendUserOperation({
        calls: calls.map(call => ({
          to: call.to,
          value: call.value,
          data: call.data,
        })),
      });
    } catch (sendError: any) {
      if (sendError.message?.includes('paymaster')) {
        return { taskId: '', success: false, error: 'Gas sponsorship failed. Paymaster may be out of funds.' };
      }
      if (sendError.message?.includes('nonce')) {
        return { taskId: '', success: false, error: 'UserOp nonce error. Retry may be needed.' };
      }
      throw sendError;
    }

    console.log('[Rebalance] UserOp submitted:', userOpHash);

    const receipt = await kernelClient.waitForUserOperationReceipt({
      hash: userOpHash as `0x${string}`,
    });

    // Check UserOp execution status
    if (!receipt.success) {
      console.error('[Rebalance] UserOp REVERTED:', {
        hash: userOpHash,
        reason: receipt.reason,
        txHash: receipt.receipt.transactionHash,
      });
      return {
        taskId: receipt.receipt.transactionHash,
        success: false,
        error: `UserOp reverted on-chain: ${receipt.reason || 'unknown reason'}`,
      };
    }

    console.log('[Rebalance] Transaction confirmed:', receipt.receipt.transactionHash);

    // POST-EXECUTION: Verify delegation is still active on-chain
    const { verifyDelegationAfterExecution } = await import('../zerodev/kernel-client');
    const delegationConfirmed = await verifyDelegationAfterExecution(
      smartAccountAddress,
      receipt.receipt.transactionHash,
    );
    if (!delegationConfirmed) {
      console.error('[Rebalance] WARNING: Delegation not confirmed after execution');
    }

    return {
      taskId: receipt.receipt.transactionHash,
      success: true
    };
  } catch (error: any) {
    console.error('[Rebalance] Execution error:', error);
    return {
      taskId: '',
      success: false,
      error: error.message
    };
  }
}

/**
 * Simulate rebalancing to check for errors before execution
 */
export async function simulateRebalance(
  smartAccountAddress: `0x${string}`,
  params: RebalanceParams,
  sessionPrivateKey: `0x${string}`
): Promise<{ success: boolean; error?: string }> {
  try {
    const calls = await buildRebalanceCalls(params);

    // Simulate each call using eth_call to detect reverts before execution
    const publicClient = createPublicClient({ chain: base, transport: http() });

    for (let i = 0; i < calls.length; i++) {
      try {
        await publicClient.call({
          to: calls[i].to,
          data: calls[i].data,
          account: smartAccountAddress,
        });
      } catch (simError: any) {
        const stepNames = ['redeem', 'approve', 'deposit'];
        return {
          success: false,
          error: `Simulation failed at step ${i + 1} (${stepNames[i] || 'unknown'}): ${simError.message}`,
        };
      }
    }

    console.log('[Rebalance] Simulation passed:', calls.length, 'calls');
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
 */
export function estimateRebalanceGasCost(): number {
  // Conservative estimate for 3 transactions on Base:
  // - Redeem: ~100k gas
  // - Approve: ~50k gas
  // - Deposit: ~100k gas
  // Total: ~250k gas @ 0.1 gwei = ~$0.50
  return 0.5;
}
