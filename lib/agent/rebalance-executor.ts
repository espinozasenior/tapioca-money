import { encodeFunctionData, parseAbi, type Hex, type Address } from "viem";
import {
  createDeserializedKernelClient,
  createSessionKernelClient,
} from "../zerodev/kernel-client";
import { checkSmartAccountActive } from "../zerodev/client-secure";
import { withBuilderCode } from "@/lib/builder-code";
import {
  YO_GATEWAY_ADDRESS,
  YO_GATEWAY_ABI,
  YO_PARTNER_ID,
  applyYoSlippage,
} from "@/lib/yo/constants";
import { USDC_ADDRESS } from "@/lib/config";
import { baseClient } from "@/lib/shared/rpc-client";
import {
  APPROVE_SELECTOR,
  DEPOSIT_SELECTOR,
  REDEEM_SELECTOR,
  WITHDRAW_SELECTOR,
  TRANSFER_SELECTOR,
} from "@/lib/constants/selectors";
import type { Protocol } from "./decision-engine";

const VAULT_ABI = parseAbi([
  "function redeem(uint256 shares, address receiver, address owner) returns (uint256 assets)",
  "function deposit(uint256 assets, address receiver) returns (uint256 shares)",
]);

const ERC20_ABI = parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]);

// Alias selectors to match the FUNCTION_SELECTORS.X pattern used throughout this file
const FUNCTION_SELECTORS = {
  REDEEM: REDEEM_SELECTOR,
  DEPOSIT: DEPOSIT_SELECTOR,
  WITHDRAW: WITHDRAW_SELECTOR,
  APPROVE: APPROVE_SELECTOR,
  TRANSFER: TRANSFER_SELECTOR,
};

export interface RebalanceParams {
  fromVault: `0x${string}`;
  toVault: `0x${string}`;
  shares: bigint;
  userAddress: `0x${string}`;
  fromProtocol?: Protocol;
  toProtocol?: Protocol;
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
 * Build transaction calls for vault rebalancing.
 * Handles 4 cross-protocol paths:
 * - Morpho→Morpho: vault.redeem + usdc.approve(vault) + vault.deposit
 * - YO→YO: vault.approve(gateway) + gateway.redeem + usdc.approve(gateway) + gateway.deposit
 * - Morpho→YO: vault.redeem + usdc.approve(gateway) + gateway.deposit
 * - YO→Morpho: vault.approve(gateway) + gateway.redeem + usdc.approve(vault) + vault.deposit
 */
export async function buildRebalanceCalls(params: RebalanceParams): Promise<RebalanceCall[]> {
  const fromProtocol = params.fromProtocol ?? "morpho";
  const toProtocol = params.toProtocol ?? "morpho";
  const publicClient = baseClient;

  const calls: RebalanceCall[] = [];

  // --- Step 1: Redeem from source ---
  let redeemAmount: bigint;

  if (fromProtocol === "morpho") {
    // ERC4626 previewRedeem on vault directly
    const expectedAssets = await publicClient.readContract({
      address: params.fromVault,
      abi: parseAbi(["function previewRedeem(uint256 shares) view returns (uint256)"]),
      functionName: "previewRedeem",
      args: [params.shares],
    });
    redeemAmount = (expectedAssets * 995n) / 1000n;

    calls.push({
      to: params.fromVault,
      data: encodeFunctionData({
        abi: VAULT_ABI,
        functionName: "redeem",
        args: [params.shares, params.userAddress, params.userAddress],
      }),
      value: BigInt(0),
    });
  } else {
    // YO: approve shares to Gateway, then gateway.redeem
    const expectedAssets = await publicClient.readContract({
      address: YO_GATEWAY_ADDRESS as Address,
      abi: YO_GATEWAY_ABI,
      functionName: "quotePreviewRedeem",
      args: [params.fromVault, params.shares],
    });
    redeemAmount = applyYoSlippage(expectedAssets);

    // Approve vault shares to Gateway
    calls.push({
      to: params.fromVault,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [YO_GATEWAY_ADDRESS as Address, params.shares],
      }),
      value: BigInt(0),
    });

    calls.push({
      to: YO_GATEWAY_ADDRESS as `0x${string}`,
      data: encodeFunctionData({
        abi: YO_GATEWAY_ABI,
        functionName: "redeem",
        args: [params.fromVault, params.shares, redeemAmount, params.userAddress, YO_PARTNER_ID],
      }),
      value: BigInt(0),
    });
  }

  if (redeemAmount === 0n) {
    throw new Error(
      `previewRedeem returned 0 for ${params.shares} shares on vault ${params.fromVault}`
    );
  }

  // --- Step 2: Approve + Deposit into destination ---
  if (toProtocol === "morpho") {
    // Approve USDC to vault, then vault.deposit
    calls.push({
      to: USDC_ADDRESS,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [params.toVault, redeemAmount],
      }),
      value: BigInt(0),
    });
    calls.push({
      to: params.toVault,
      data: encodeFunctionData({
        abi: VAULT_ABI,
        functionName: "deposit",
        args: [redeemAmount, params.userAddress],
      }),
      value: BigInt(0),
    });
  } else {
    // YO: Approve USDC to Gateway, then gateway.deposit
    const minSharesOut = await publicClient.readContract({
      address: YO_GATEWAY_ADDRESS as Address,
      abi: YO_GATEWAY_ABI,
      functionName: "quotePreviewDeposit",
      args: [params.toVault, redeemAmount],
    });
    const minSharesSlippage = applyYoSlippage(minSharesOut);

    calls.push({
      to: USDC_ADDRESS,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [YO_GATEWAY_ADDRESS as Address, redeemAmount],
      }),
      value: BigInt(0),
    });
    calls.push({
      to: YO_GATEWAY_ADDRESS as `0x${string}`,
      data: encodeFunctionData({
        abi: YO_GATEWAY_ABI,
        functionName: "deposit",
        args: [params.toVault, redeemAmount, minSharesSlippage, params.userAddress, YO_PARTNER_ID],
      }),
      value: BigInt(0),
    });
  }

  return calls;
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
  serializedAccount?: string
): Promise<RebalanceResult> {
  try {
    console.log("[Rebalance] Starting ZeroDev execution with scoped permissions...");

    // PRE-EXECUTION: Verify EIP-7702 delegation is active on-chain
    const delegationStatus = await checkSmartAccountActive(smartAccountAddress);
    if (!delegationStatus.active) {
      console.error("[Rebalance] Delegation not active for:", smartAccountAddress);
      return {
        taskId: "",
        success: false,
        error: "EIP-7702 delegation not active on-chain. User must re-register.",
      };
    }
    if (delegationStatus.isDelegation) {
      const { KernelVersionToAddressesMap, KERNEL_V3_3 } = await import("@zerodev/sdk/constants");
      const expectedImpl = KernelVersionToAddressesMap[KERNEL_V3_3].accountImplementationAddress;
      if (delegationStatus.implementationAddress?.toLowerCase() !== expectedImpl.toLowerCase()) {
        console.error(
          "[Rebalance] Delegation target mismatch:",
          delegationStatus.implementationAddress
        );
        return {
          taskId: "",
          success: false,
          error: `EIP-7702 delegated to wrong implementation: ${delegationStatus.implementationAddress}`,
        };
      }
    }

    // Create kernel client — prefer deserialized account (new pattern)
    let kernelClient;
    if (serializedAccount) {
      console.log("[Rebalance] Using deserialized kernel client");
      kernelClient = await createDeserializedKernelClient(serializedAccount);
    } else {
      // Legacy path
      console.warn("[Rebalance] Using legacy session key path — user should re-register");
      const permissions =
        approvedVaults && approvedVaults.length > 0 ? buildScopedPermissions(approvedVaults) : [];
      kernelClient = await createSessionKernelClient({
        smartAccountAddress,
        sessionPrivateKey,
        permissions,
        eip7702SignedAuth,
      });
    }

    // Build rebalance calls
    const calls = await buildRebalanceCalls(params);

    console.log("[Rebalance] Executing batch transaction...");

    let userOpHash: string;
    try {
      userOpHash = await kernelClient.sendUserOperation({
        calls: withBuilderCode(
          calls.map((call) => ({
            to: call.to,
            value: call.value,
            data: call.data,
          }))
        ),
      });
    } catch (sendError: any) {
      if (sendError.message?.includes("paymaster")) {
        return {
          taskId: "",
          success: false,
          error: "Gas sponsorship failed. Paymaster may be out of funds.",
        };
      }
      if (sendError.message?.includes("nonce")) {
        return { taskId: "", success: false, error: "UserOp nonce error. Retry may be needed." };
      }
      throw sendError;
    }

    console.log("[Rebalance] UserOp submitted:", userOpHash);

    const receipt = await kernelClient.waitForUserOperationReceipt({
      hash: userOpHash as `0x${string}`,
    });

    // Check UserOp execution status
    if (!receipt.success) {
      console.error("[Rebalance] UserOp REVERTED:", {
        hash: userOpHash,
        reason: receipt.reason,
        txHash: receipt.receipt.transactionHash,
      });
      return {
        taskId: receipt.receipt.transactionHash,
        success: false,
        error: `UserOp reverted on-chain: ${receipt.reason || "unknown reason"}`,
      };
    }

    console.log("[Rebalance] Transaction confirmed:", receipt.receipt.transactionHash);

    // POST-EXECUTION: Verify delegation is still active on-chain
    const { verifyDelegationAfterExecution } = await import("../zerodev/kernel-client");
    const delegationConfirmed = await verifyDelegationAfterExecution(
      smartAccountAddress,
      receipt.receipt.transactionHash
    );
    if (!delegationConfirmed) {
      console.error("[Rebalance] WARNING: Delegation not confirmed after execution");
    }

    return {
      taskId: receipt.receipt.transactionHash,
      success: true,
    };
  } catch (error: any) {
    console.error("[Rebalance] Execution error:", error);
    return {
      taskId: "",
      success: false,
      error: error.message,
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
    const publicClient = baseClient;

    for (let i = 0; i < calls.length; i++) {
      try {
        await publicClient.call({
          to: calls[i].to,
          data: calls[i].data,
          account: smartAccountAddress,
        });
      } catch (simError: any) {
        const stepNames = ["redeem", "approve", "deposit"];
        return {
          success: false,
          error: `Simulation failed at step ${i + 1} (${stepNames[i] || "unknown"}): ${simError.message}`,
        };
      }
    }

    console.log("[Rebalance] Simulation passed:", calls.length, "calls");
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}
