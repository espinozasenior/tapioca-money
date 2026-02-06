/**
 * Vault Executor - Handles ERC4626 vault redeem operations
 * Uses user's session key authorization for gasless execution via ZeroDev
 */

import { encodeFunctionData, parseAbi, createPublicClient, http, type Hex } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const VAULT_ABI = parseAbi([
  'function redeem(uint256 shares, address receiver, address owner) returns (uint256 assets)',
]);

// EntryPoint V0.7 object (required format for ZeroDev SDK v5)
const ENTRYPOINT_V07 = {
  address: "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as `0x${string}`,
  version: "0.7" as const,
};

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
 *
 * @param params - Redeem parameters
 * @returns Result with transaction hash
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
    const { toCallPolicy, toSudoPolicy, CallPolicyVersion } = await import('@zerodev/permissions/policies');
    const { toECDSASigner } = await import('@zerodev/permissions/signers');

    // 4. Convert session key to ModularSigner for permission validator
    const sessionSigner = await toECDSASigner({ signer: sessionKeySigner });

    // 5. Build policy based on whether approved vaults are provided
    let policy;
    if (params.approvedVaults && params.approvedVaults.length > 0) {
      // Build scoped permissions for approved vaults
      const permissions: Array<{ target: `0x${string}`; selector: Hex }> = [];
      for (const vaultAddress of params.approvedVaults) {
        permissions.push({ target: vaultAddress, selector: REDEEM_SELECTOR });
      }
      console.log('[VaultRedeem] Using scoped policy with', permissions.length, 'permissions');
      policy = toCallPolicy({
        policyVersion: CallPolicyVersion.V0_0_5,
        permissions,
      });
    } else {
      // DEPRECATED: Legacy path for old registrations without vault list
      console.warn('[VaultRedeem] Using sudo policy (legacy) - consider re-registering');
      policy = toSudoPolicy({});
    }

    // 6. Create permission validator with session key
    const permissionValidator = await toPermissionValidator(publicClient, {
      signer: sessionSigner,
      entryPoint: ENTRYPOINT_V07,
      policies: [policy],
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

    // 9. Build redeem call
    const redeemCallData = encodeFunctionData({
      abi: VAULT_ABI,
      functionName: 'redeem',
      args: [params.shares, params.receiver, params.receiver], // receiver = owner = user's smart account
    });

    console.log('[VaultRedeem] Executing redeem transaction...');

    // 10. Execute via UserOperation
    const userOpHash = await kernelClient.sendUserOperation({
      calls: [
        {
          to: params.vaultAddress,
          value: BigInt(0),
          data: redeemCallData,
        },
      ],
    });

    console.log('[VaultRedeem] UserOp submitted:', userOpHash);

    // 11. Wait for transaction receipt
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
