/**
 * Gasless Transfer Executor with ZeroDev
 * Executes USDC transfers using transfer-only session keys
 */

import { encodeFunctionData, erc20Abi, parseUnits } from 'viem';
import { createSessionKernelClient } from './kernel-client';

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

export interface GaslessTransferParams {
  userAddress: `0x${string}`;
  smartAccountAddress: `0x${string}`;
  recipient: `0x${string}`;
  amount: string; // Amount in USDC (e.g., "10.50")
  sessionPrivateKey: `0x${string}`;
  eip7702SignedAuth?: any;
}

export interface GaslessTransferResult {
  hash: string;
  success: boolean;
  error?: string;
  userOpHash?: string;
}

/**
 * Execute gasless USDC transfer via ZeroDev bundler
 */
export async function executeGaslessTransfer(
  params: GaslessTransferParams
): Promise<GaslessTransferResult> {
  try {
    console.log('[GaslessTransfer] Starting transfer execution...');
    console.log('[GaslessTransfer] From:', params.smartAccountAddress);
    console.log('[GaslessTransfer] To:', params.recipient);
    console.log('[GaslessTransfer] Amount:', params.amount, 'USDC');

    // Check if simulation mode
    const isSimulation = process.env.AGENT_SIMULATION_MODE === 'true';

    if (isSimulation) {
      console.log('[GaslessTransfer] SIMULATION MODE - No real transaction');
      const mockHash = `0x${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
      return {
        hash: mockHash,
        success: true,
        userOpHash: `0xUserOp${Math.random().toString(16).slice(2)}`,
      };
    }

    // Build transfer-only permission on USDC
    const transferSelector = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: ['0x0000000000000000000000000000000000000000', BigInt(0)],
    }).slice(0, 10) as `0x${string}`;

    const kernelClient = await createSessionKernelClient({
      smartAccountAddress: params.smartAccountAddress,
      sessionPrivateKey: params.sessionPrivateKey,
      eip7702SignedAuth: params.eip7702SignedAuth,
      permissions: [
        { target: USDC_ADDRESS, selector: transferSelector },
      ],
    });

    // Build USDC transfer call
    const amountInUSDC = parseUnits(params.amount, 6);

    const transferCallData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [params.recipient, amountInUSDC],
    });

    console.log('[GaslessTransfer] Building transfer call...');

    const userOpHash = await kernelClient.sendUserOperation({
      calls: [
        { to: USDC_ADDRESS, value: BigInt(0), data: transferCallData },
      ],
    });

    console.log('[GaslessTransfer] UserOp submitted:', userOpHash);

    const receipt = await kernelClient.waitForUserOperationReceipt({
      hash: userOpHash,
    });

    console.log('[GaslessTransfer] Transaction confirmed:', receipt.receipt.transactionHash);

    return {
      hash: receipt.receipt.transactionHash,
      success: true,
      userOpHash,
    };

  } catch (error: any) {
    console.error('[GaslessTransfer] Execution error:', error);
    return {
      hash: '',
      success: false,
      error: error.message,
    };
  }
}

/**
 * Validate transfer parameters before execution
 */
export function validateTransferParams(
  params: Partial<GaslessTransferParams>
): { valid: boolean; error?: string } {
  if (!params.recipient) {
    return { valid: false, error: 'Recipient address required' };
  }

  if (!params.recipient.match(/^0x[a-fA-F0-9]{40}$/)) {
    return { valid: false, error: 'Invalid recipient address format' };
  }

  if (!params.amount) {
    return { valid: false, error: 'Amount required' };
  }

  const amount = parseFloat(params.amount);
  if (isNaN(amount) || amount <= 0) {
    return { valid: false, error: 'Amount must be greater than 0' };
  }

  if (amount > 500) {
    return { valid: false, error: 'Amount exceeds $500 limit per transfer' };
  }

  if (!params.smartAccountAddress || !params.sessionPrivateKey) {
    return { valid: false, error: 'Session authorization required' };
  }

  return { valid: true };
}
