import { encodeFunctionData, parseAbi, type Hex } from 'viem';
import { createSessionKernelClient } from '../zerodev/kernel-client';

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
  approvedVaults?: `0x${string}`[]
): Promise<RebalanceResult> {
  try {
    console.log('[Rebalance] Starting ZeroDev execution with scoped permissions...');

    // Build permissions
    const permissions = (approvedVaults && approvedVaults.length > 0)
      ? buildScopedPermissions(approvedVaults)
      : [];

    if (permissions.length > 0) {
      console.log('[Rebalance] Using scoped policy with', permissions.length, 'permissions');
    } else {
      console.warn('[Rebalance] Using sudo policy (legacy) - consider re-registering');
    }

    const kernelClient = await createSessionKernelClient({
      smartAccountAddress,
      sessionPrivateKey,
      permissions,
    });

    // Build rebalance calls
    const calls = buildRebalanceCalls(params);

    console.log('[Rebalance] Executing batch transaction...');

    const userOpHash = await kernelClient.sendUserOperation({
      calls: calls.map(call => ({
        to: call.to,
        value: call.value,
        data: call.data,
      })),
    });

    console.log('[Rebalance] UserOp submitted:', userOpHash);

    const receipt = await kernelClient.waitForUserOperationReceipt({
      hash: userOpHash,
    });

    console.log('[Rebalance] Transaction confirmed:', receipt.receipt.transactionHash);

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
 */
export function estimateRebalanceGasCost(): number {
  // Conservative estimate for 3 transactions on Base:
  // - Redeem: ~100k gas
  // - Approve: ~50k gas
  // - Deposit: ~100k gas
  // Total: ~250k gas @ 0.1 gwei = ~$0.50
  return 0.5;
}
