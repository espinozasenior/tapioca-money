/**
 * Vault Executor - Handles ERC4626 vault redeem operations
 * Uses user's session key authorization for gasless execution via ZeroDev
 */

import { createPublicClient, encodeFunctionData, http, parseAbi, type Hex } from 'viem';
import { base } from 'viem/chains';
import { createDeserializedKernelClient, createSessionKernelClient } from './kernel-client';
import { CHAIN_CONFIG } from '@/lib/yield-optimizer/config';

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
  serializedAccount?: string; // Serialized kernel account (new pattern)
  // Legacy fields
  sessionPrivateKey?: `0x${string}`;
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

    // Create kernel client — prefer deserialized account (new pattern)
    let kernelClient;
    if (params.serializedAccount) {
      console.log('[VaultRedeem] Using deserialized kernel client');
      kernelClient = await createDeserializedKernelClient(params.serializedAccount);
    } else if (params.sessionPrivateKey) {
      console.warn('[VaultRedeem] Using legacy session key path — user should re-register');
      const permissions: Array<{ target: `0x${string}`; selector: Hex }> = [];
      if (params.approvedVaults && params.approvedVaults.length > 0) {
        for (const vaultAddress of params.approvedVaults) {
          permissions.push({ target: vaultAddress, selector: REDEEM_SELECTOR });
        }
      }
      kernelClient = await createSessionKernelClient({
        smartAccountAddress: params.smartAccountAddress,
        sessionPrivateKey: params.sessionPrivateKey,
        permissions,
      });
    } else {
      throw new Error('No serializedAccount or sessionPrivateKey provided. User must register.');
    }

    // Pre-flight: simulate vault call directly to catch access control failures early
    const publicClient = createPublicClient({
      chain: base,
      transport: http(CHAIN_CONFIG.rpcUrl),
    });

    try {
      await publicClient.simulateContract({
        account: params.smartAccountAddress,
        address: params.vaultAddress,
        abi: VAULT_ABI,
        functionName: 'redeem',
        args: [params.shares, params.receiver, params.receiver],
      });
    } catch (simError: any) {
      const reason = simError.shortMessage || simError.message;
      console.error('[VaultRedeem] Pre-flight vault simulation failed:', reason);
      return {
        success: false,
        error: `Vault rejected the redeem: ${reason}. ` +
          `This vault may restrict access to agent-operated accounts. ` +
          `Try redeeming directly from your wallet instead of through the agent.`,
      };
    }
    console.log('[VaultRedeem] Pre-flight simulation passed');

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
    const msg: string = error.message || '';
    const isRateLimit =
      msg.includes('AA23') ||
      msg.includes('0x3e4983f6') ||
      msg.includes('validateUserOp');
    return {
      success: false,
      error: isRateLimit
        ? 'Agent daily operation limit reached. Please re-register your agent to reset the limit, or try again tomorrow.'
        : msg,
    };
  }
}
