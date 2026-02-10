/**
 * Deposit Executor - Handles ERC4626 vault deposit operations (approve + deposit)
 * Uses user's session key authorization for gasless execution via ZeroDev
 */

import { encodeFunctionData, parseAbi, parseUnits, type Hex } from 'viem';
import { createSessionKernelClient } from './kernel-client';

const VAULT_ABI = parseAbi([
  'function deposit(uint256 assets, address receiver) returns (uint256 shares)',
]);

const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
]);

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

// Function selectors for scoped permissions
const APPROVE_SELECTOR = "0x095ea7b3" as Hex; // approve(address,uint256)
const DEPOSIT_SELECTOR = "0x6e553f65" as Hex; // deposit(uint256,address)

export interface VaultDepositParams {
  smartAccountAddress: `0x${string}`;
  vaultAddress: `0x${string}`;
  amount: string; // Amount in USDC (e.g., "10.50")
  sessionPrivateKey: `0x${string}`;
  approvedVaults?: `0x${string}`[];
}

export interface VaultDepositResult {
  success: boolean;
  txHash?: string;
  userOpHash?: string;
  error?: string;
}

/**
 * Execute ERC4626 vault deposit via ZeroDev Kernel account with session key.
 * Batches approve + deposit into a single atomic UserOperation.
 * All gas fees sponsored via bundler paymaster.
 */
export async function executeGaslessDeposit(
  params: VaultDepositParams
): Promise<VaultDepositResult> {
  try {
    console.log('[VaultDeposit] Starting ZeroDev execution...');
    console.log('[VaultDeposit] Vault:', params.vaultAddress);
    console.log('[VaultDeposit] Amount:', params.amount, 'USDC');

    // Check if simulation mode
    const isSimulation = process.env.AGENT_SIMULATION_MODE === 'true';

    if (isSimulation) {
      console.log('[VaultDeposit] SIMULATION MODE - No real transaction');
      const mockHash = `0x${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
      return {
        success: true,
        txHash: mockHash,
        userOpHash: `0xUserOp${Math.random().toString(16).slice(2)}`,
      };
    }

    // Build scoped permissions: approve on USDC + deposit on each approved vault
    const permissions: Array<{ target: `0x${string}`; selector: Hex }> = [];
    if (params.approvedVaults && params.approvedVaults.length > 0) {
      permissions.push({ target: USDC_ADDRESS, selector: APPROVE_SELECTOR });
      for (const vaultAddress of params.approvedVaults) {
        permissions.push({ target: vaultAddress, selector: DEPOSIT_SELECTOR });
      }
      console.log('[VaultDeposit] Using scoped policy with', permissions.length, 'permissions');
    } else {
      console.warn('[VaultDeposit] Using sudo policy (legacy) - consider re-registering');
    }

    const kernelClient = await createSessionKernelClient({
      smartAccountAddress: params.smartAccountAddress,
      sessionPrivateKey: params.sessionPrivateKey,
      permissions,
    });

    // Build approve + deposit calls (batched atomically)
    const amountInUSDC = parseUnits(params.amount, 6);

    const approveCallData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [params.vaultAddress, amountInUSDC],
    });

    const depositCallData = encodeFunctionData({
      abi: VAULT_ABI,
      functionName: 'deposit',
      args: [amountInUSDC, params.smartAccountAddress],
    });

    console.log('[VaultDeposit] Executing approve + deposit batch...');

    // Execute both calls atomically via single UserOperation
    const userOpHash = await kernelClient.sendUserOperation({
      calls: [
        { to: USDC_ADDRESS, value: BigInt(0), data: approveCallData },
        { to: params.vaultAddress, value: BigInt(0), data: depositCallData },
      ],
    });

    console.log('[VaultDeposit] UserOp submitted:', userOpHash);

    const receipt = await kernelClient.waitForUserOperationReceipt({
      hash: userOpHash,
    });

    console.log('[VaultDeposit] Transaction confirmed:', receipt.receipt.transactionHash);

    return {
      success: true,
      txHash: receipt.receipt.transactionHash,
      userOpHash,
    };

  } catch (error: any) {
    console.error('[VaultDeposit] Execution error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}
