/**
 * Gasless Transfer Executor with ZeroDev
 * Executes USDC transfers using transfer-only session keys
 */

import { base } from 'viem/chains';
import { createPublicClient, http, encodeFunctionData, erc20Abi, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

// EntryPoint V0.7 object (required format for ZeroDev SDK v5)
const ENTRYPOINT_V07 = {
  address: "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as `0x${string}`,
  version: "0.7" as const,
};

export interface GaslessTransferParams {
  userAddress: `0x${string}`;
  smartAccountAddress: `0x${string}`;
  recipient: `0x${string}`;
  amount: string; // Amount in USDC (e.g., "10.50")
  sessionPrivateKey: `0x${string}`;
}

export interface GaslessTransferResult {
  hash: string;
  success: boolean;
  error?: string;
  userOpHash?: string;
}

/**
 * Execute gasless USDC transfer via ZeroDev bundler
 *
 * Flow:
 * 1. Load session key from private key
 * 2. Create permission validator with transfer-only policy
 * 3. Create Kernel account with session key permissions
 * 4. Build USDC transfer call
 * 5. Execute via bundler (gasless)
 * 6. Wait for receipt and return hash
 *
 * @param params - Transfer parameters
 * @returns Transfer result with transaction hash
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
      console.log('[GaslessTransfer] 🎭 SIMULATION MODE - No real transaction');
      const mockHash = `0x${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
      return {
        hash: mockHash,
        success: true,
        userOpHash: `0xUserOp${Math.random().toString(16).slice(2)}`,
      };
    }

    // 1. Create session key signer from private key
    const sessionKeySigner = privateKeyToAccount(params.sessionPrivateKey);

    // 2. Create public client
    const publicClient = createPublicClient({
      chain: base,
      transport: http(),
    });

    // 3. Import ZeroDev SDK
    const { createKernelAccount, createKernelAccountClient } = await import('@zerodev/sdk');
    const { KERNEL_V3_1 } = await import('@zerodev/sdk/constants');
    const { toPermissionValidator } = await import('@zerodev/permissions');
    const { toCallPolicy, CallPolicyVersion } = await import('@zerodev/permissions/policies');
    const { toECDSASigner } = await import('@zerodev/permissions/signers');

    // 4. Convert session key to ModularSigner for permission validator
    const sessionSigner = await toECDSASigner({ signer: sessionKeySigner });

    // 5. Create call policy restricted to USDC.transfer()
    const transferSelector = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: ['0x0000000000000000000000000000000000000000', BigInt(0)],
    }).slice(0, 10) as `0x${string}`; // Extract 4-byte selector

    // 6. Create permission validator with session key
    const permissionValidator = await toPermissionValidator(publicClient, {
      signer: sessionSigner,
      entryPoint: ENTRYPOINT_V07,
      policies: [
        toCallPolicy({
          policyVersion: CallPolicyVersion.V0_0_5,
          permissions: [
            {
              target: USDC_ADDRESS,
              selector: transferSelector,
            },
          ],
        }),
      ],
      kernelVersion: KERNEL_V3_1,
    });

    // 7. Create Kernel account with session key permissions
    const kernelAccount = await createKernelAccount(publicClient, {
      address: params.smartAccountAddress,
      plugins: {
        sudo: permissionValidator,
      },
      entryPoint: ENTRYPOINT_V07,
      kernelVersion: KERNEL_V3_1,
    });

    // 8. Create Kernel account client for execution
    const bundlerUrl = process.env.ZERODEV_BUNDLER_URL ||
      `https://rpc.zerodev.app/api/v2/bundler/${process.env.ZERODEV_PROJECT_ID}`;

    const kernelClient = await createKernelAccountClient({
      account: kernelAccount,
      chain: base,
      bundlerTransport: http(bundlerUrl),
    });

    // 9. Build USDC transfer call
    // USDC has 6 decimals, so we need to convert the amount
    const amountInUSDC = parseUnits(params.amount, 6);

    const transferCallData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [params.recipient, amountInUSDC],
    });

    console.log('[GaslessTransfer] Building transfer call...');

    // 10. Execute transfer via UserOperation
    const userOpHash = await kernelClient.sendUserOperation({
      calls: [
        {
          to: USDC_ADDRESS,
          value: BigInt(0),
          data: transferCallData,
        },
      ],
    });

    console.log('[GaslessTransfer] ✓ UserOp submitted:', userOpHash);

    // 11. Wait for transaction receipt
    const receipt = await kernelClient.waitForUserOperationReceipt({
      hash: userOpHash,
    });

    console.log('[GaslessTransfer] ✓ Transaction confirmed:', receipt.receipt.transactionHash);

    return {
      hash: receipt.receipt.transactionHash,
      success: true,
      userOpHash,
    };

  } catch (error: any) {
    console.error('[GaslessTransfer] ❌ Execution error:', error);
    return {
      hash: '',
      success: false,
      error: error.message,
    };
  }
}

/**
 * Validate transfer parameters before execution
 *
 * @param params - Transfer parameters to validate
 * @returns Validation result with error message if invalid
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
