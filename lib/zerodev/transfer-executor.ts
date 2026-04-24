/**
 * Transfer Executor with ZeroDev.
 *
 * Customer-paid mode: user approves the ZeroDev ERC-20 paymaster for a capped
 * amount of USDC and the paymaster pulls the fee post-execution. No Tapioca
 * subsidy. See tasks/architecture-usdc-send.md §7 (executor state diagram).
 *
 * Legacy sponsored path (`executeGaslessTransfer`) is kept as a no-op shim that
 * throws — the UI no longer calls it but tests may reference the symbol.
 */

import { encodeFunctionData, erc20Abi, formatUnits, parseUnits } from "viem";
import { createDeserializedKernelClient } from "./kernel-client";
import { withBuilderCode } from "@/lib/builder-code";
import { validateTransferRecipient } from "./transfer-recipient-validator";
import { FEE_CAP_USDC, USDC_ADDRESS, USDC_PAYMASTER_ADDRESS } from "@/lib/config";
import { baseClient } from "@/lib/shared/rpc-client";
import {
  createUsdcPaymaster,
  getPaymasterTreasury,
  parsePaymasterFeeFromReceipt,
} from "./paymaster-client";

export interface UserPaidTransferParams {
  userAddress: `0x${string}`;
  smartAccountAddress: `0x${string}`;
  recipient: `0x${string}`;
  amount: string; // Amount in USDC (e.g., "10.50")
  serializedAccount: string; // Serialized kernel account (v2 session)
}

export interface UserPaidTransferResult {
  hash: string;
  success: boolean;
  error?: string;
  userOpHash?: string;
  /** Actual USDC fee charged by the paymaster (decimal string, 6 dp). */
  feePaid?: string;
}

// Legacy alias kept for external callers/tests — prefer the new names.
export type GaslessTransferParams = UserPaidTransferParams & {
  sessionPrivateKey?: `0x${string}`;
  eip7702SignedAuth?: any;
};
export type GaslessTransferResult = UserPaidTransferResult;

/**
 * Execute a customer-paid USDC transfer via the ZeroDev ERC-20 paymaster.
 *
 * Flow:
 *   1. Pre-read `USDC.allowance(smartAccount, paymaster)` (cheap RPC read).
 *   2. If allowance < FEE_CAP_USDC, prepend a `USDC.approve(paymaster, FEE_CAP_USDC)` call.
 *   3. Always append `USDC.transfer(recipient, amount)`.
 *   4. Submit as ONE batched UserOp with the paymaster-enabled kernel client.
 *   5. Parse `ERC20.Transfer(smartAccount → paymasterTreasury)` from the
 *      receipt logs to surface the actual fee.
 */
export async function executeUserPaidTransfer(
  params: UserPaidTransferParams
): Promise<UserPaidTransferResult> {
  try {
    console.log("[UserPaidTransfer] Starting transfer execution...");
    console.log("[UserPaidTransfer] From:", params.smartAccountAddress);
    console.log("[UserPaidTransfer] To:", params.recipient);
    console.log("[UserPaidTransfer] Amount:", params.amount, "USDC");

    if (process.env.AGENT_SIMULATION_MODE === "true") {
      console.log("[UserPaidTransfer] SIMULATION MODE - No real transaction");
      const mockHash = `0x${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
      return {
        hash: mockHash,
        success: true,
        userOpHash: `0xUserOp${Math.random().toString(16).slice(2)}`,
        feePaid: "0.000000",
      };
    }

    if (!params.serializedAccount) {
      throw new Error("SESSION_UPGRADE_REQUIRED");
    }

    // Step 1: pre-read allowance (OQ-6 optimization — skip approve when already sufficient).
    const currentAllowance = (await baseClient.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "allowance",
      args: [params.smartAccountAddress, USDC_PAYMASTER_ADDRESS],
    })) as bigint;

    const needsApprove = currentAllowance < FEE_CAP_USDC;
    console.log(
      `[UserPaidTransfer] allowance=${currentAllowance} cap=${FEE_CAP_USDC} needsApprove=${needsApprove}`
    );

    // Step 2+3: build batched calls.
    const amountInUsdc = parseUnits(params.amount, 6);
    const calls: Array<{ to: `0x${string}`; value: bigint; data: `0x${string}` }> = [];

    if (needsApprove) {
      calls.push({
        to: USDC_ADDRESS,
        value: 0n,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [USDC_PAYMASTER_ADDRESS, FEE_CAP_USDC],
        }),
      });
    }

    calls.push({
      to: USDC_ADDRESS,
      value: 0n,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [params.recipient, amountInUsdc],
      }),
    });

    // Step 4: submit batched UserOp through the paymaster-enabled kernel client.
    const paymaster = await createUsdcPaymaster();
    const kernelClient = await createDeserializedKernelClient(params.serializedAccount, {
      paymaster,
    });

    const userOpHash = await kernelClient.sendUserOperation({
      calls: withBuilderCode(calls),
    });

    console.log("[UserPaidTransfer] UserOp submitted:", userOpHash);

    const receipt = await kernelClient.waitForUserOperationReceipt({ hash: userOpHash });
    console.log("[UserPaidTransfer] Transaction confirmed:", receipt.receipt.transactionHash);

    // Step 5: parse actual fee from the paymaster-treasury Transfer log.
    let feePaid = "0";
    try {
      const treasury = await getPaymasterTreasury();
      const rawFee = parsePaymasterFeeFromReceipt({
        logs: receipt.receipt.logs as any,
        smartAccount: params.smartAccountAddress,
        paymasterTreasury: treasury,
      });
      feePaid = formatUnits(rawFee, 6);
    } catch (err) {
      console.warn("[UserPaidTransfer] Fee parse failed (non-fatal):", err);
    }

    return {
      hash: receipt.receipt.transactionHash,
      success: true,
      userOpHash,
      feePaid,
    };
  } catch (error: any) {
    console.error("[UserPaidTransfer] Execution error:", error);
    return {
      hash: "",
      success: false,
      error: error.message,
    };
  }
}

/**
 * @deprecated Use `executeUserPaidTransfer`. This alias is kept so existing
 * callers (tests, etc.) don't break in the same PR — they should migrate.
 */
export const executeGaslessTransfer = executeUserPaidTransfer;

/**
 * Validate transfer parameters before execution
 */
export function validateTransferParams(params: Partial<GaslessTransferParams>): {
  valid: boolean;
  error?: string;
} {
  if (!params.recipient) {
    return { valid: false, error: "Recipient address required" };
  }

  if (!params.recipient.match(/^0x[a-fA-F0-9]{40}$/)) {
    return { valid: false, error: "Invalid recipient address format" };
  }

  // Validate recipient is not a blocked address (zero addr, self, known contracts)
  if (params.userAddress) {
    const recipientCheck = validateTransferRecipient(params.recipient, params.userAddress);
    if (!recipientCheck.valid) {
      return { valid: false, error: recipientCheck.reason };
    }
  }

  if (!params.amount) {
    return { valid: false, error: "Amount required" };
  }

  const amount = parseFloat(params.amount);
  if (isNaN(amount) || amount <= 0) {
    return { valid: false, error: "Amount must be greater than 0" };
  }

  if (amount > 500) {
    return { valid: false, error: "Amount exceeds $500 limit per transfer" };
  }

  if (!params.smartAccountAddress || (!params.serializedAccount && !params.sessionPrivateKey)) {
    return { valid: false, error: "Session authorization required" };
  }

  return { valid: true };
}
