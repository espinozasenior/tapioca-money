/**
 * Vault Executor - Handles ERC4626 vault redeem operations
 * Uses user's session key authorization for gasless execution via ZeroDev
 */

import { encodeFunctionData, parseAbi, type Hex } from 'viem';
import { createSessionKernelClient } from './kernel-client';

const VAULT_ABI = parseAbi([
  'function redeem(uint256 shares, address receiver, address owner) returns (uint256 assets)',
]);

// Function selector for scoped permissions
const REDEEM_SELECTOR = "0xba087652" as Hex; // redeem(uint256,address,address)

export interface VaultRedeemParams {
  smartAccountAddress: `0x${string}`;
  vaultAddress: `0x${string}`;
  shares: bigint;
  receiver: `0x${string}`; // Usually same as smartAccountAddress
  sessionPrivateKey: `0x${string}`;
  approvedVaults?: `0x${string}`[];
}

export interface VaultRedeemResult {
  success: boolean;
  txHash?: string;
  userOpHash?: string;
  error?: string;
}

/**
 * Execute ERC4626 vault redeem via ZeroDev Kernel account with session key
 * All gas fees sponsored via bundler paymaster
 */
export async function executeVaultRedeem(
  params: VaultRedeemParams
): Promise<VaultRedeemResult> {
  try {
    console.log('[VaultRedeem] Starting ZeroDev execution...');
    console.log('[VaultRedeem] Vault:', params.vaultAddress);
    console.log('[VaultRedeem] Shares:', params.shares.toString());

    // Check if simulation mode
    const isSimulation = process.env.AGENT_SIMULATION_MODE === 'true';

    if (isSimulation) {
      console.log('[VaultRedeem] SIMULATION MODE - No real transaction');
      const mockHash = `0x${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
      return {
        success: true,
        txHash: mockHash,
        userOpHash: `0xUserOp${Math.random().toString(16).slice(2)}`,
      };
    }

    // Build scoped permissions for approved vaults
    const permissions: Array<{ target: `0x${string}`; selector: Hex }> = [];
    if (params.approvedVaults && params.approvedVaults.length > 0) {
      for (const vaultAddress of params.approvedVaults) {
        permissions.push({ target: vaultAddress, selector: REDEEM_SELECTOR });
      }
      console.log('[VaultRedeem] Using scoped policy with', permissions.length, 'permissions');
    } else {
      console.warn('[VaultRedeem] Using sudo policy (legacy) - consider re-registering');
    }

    const kernelClient = await createSessionKernelClient({
      smartAccountAddress: params.smartAccountAddress,
      sessionPrivateKey: params.sessionPrivateKey,
      permissions,
    });

    // Build redeem call
    const redeemCallData = encodeFunctionData({
      abi: VAULT_ABI,
      functionName: 'redeem',
      args: [params.shares, params.receiver, params.receiver],
    });

    console.log('[VaultRedeem] Executing redeem transaction...');

    const userOpHash = await kernelClient.sendUserOperation({
      calls: [
        { to: params.vaultAddress, value: BigInt(0), data: redeemCallData },
      ],
    });

    console.log('[VaultRedeem] UserOp submitted:', userOpHash);

    const receipt = await kernelClient.waitForUserOperationReceipt({
      hash: userOpHash,
    });

    console.log('[VaultRedeem] Transaction confirmed:', receipt.receipt.transactionHash);

    return {
      success: true,
      txHash: receipt.receipt.transactionHash,
      userOpHash,
    };

  } catch (error: any) {
    console.error('[VaultRedeem] Execution error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}
