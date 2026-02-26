/**
 * YO Protocol Deposit Executor
 * Handles gasless deposit via YO Gateway (approve + gateway.deposit)
 * Uses user's session key authorization for gasless execution via ZeroDev
 */

import { createPublicClient, encodeFunctionData, http, parseUnits, type Address } from "viem";
import { base } from "viem/chains";
import { createDeserializedKernelClient } from "./kernel-client";
import { withBuilderCode } from "@/lib/builder-code";
import { CHAIN_CONFIG } from "@/lib/config";
import {
  YO_GATEWAY_ADDRESS,
  YO_GATEWAY_ABI,
  YO_PARTNER_ID,
  applyYoSlippage,
} from "@/lib/yo/constants";
import { erc20Abi } from "@yo-protocol/core";

export interface YoDepositParams {
  smartAccountAddress: `0x${string}`;
  vaultAddress: `0x${string}`;
  amount: string; // Human-readable (e.g. "10.50")
  underlyingAddress: `0x${string}`; // e.g. USDC address
  underlyingDecimals: number; // e.g. 6 for USDC
  serializedAccount: string;
}

export interface YoDepositResult {
  success: boolean;
  txHash?: string;
  userOpHash?: string;
  error?: string;
}

/**
 * Execute gasless deposit into a YO vault via the Gateway.
 * Batches: approve(underlying → Gateway) + gateway.deposit(vault, amount, minShares, receiver, partnerId)
 */
export async function executeYoGaslessDeposit(params: YoDepositParams): Promise<YoDepositResult> {
  try {
    console.log("[YoDeposit] Starting ZeroDev execution...");
    console.log("[YoDeposit] Vault:", params.vaultAddress);
    console.log("[YoDeposit] Amount:", params.amount);

    const isSimulation = process.env.AGENT_SIMULATION_MODE === "true";
    if (isSimulation) {
      console.log("[YoDeposit] SIMULATION MODE - No real transaction");
      return {
        success: true,
        txHash: `0x${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`,
        userOpHash: `0xUserOp${Math.random().toString(16).slice(2)}`,
      };
    }

    // Create kernel client from serialized account
    const kernelClient = await createDeserializedKernelClient(params.serializedAccount);

    const amountBigInt = parseUnits(params.amount, params.underlyingDecimals);

    // Quote minimum shares out with 0.5% slippage
    const publicClient = createPublicClient({
      chain: base,
      transport: http(CHAIN_CONFIG.rpcUrl),
    });

    const expectedShares = await publicClient.readContract({
      address: YO_GATEWAY_ADDRESS as Address,
      abi: YO_GATEWAY_ABI,
      functionName: "quotePreviewDeposit",
      args: [params.vaultAddress, amountBigInt],
    });

    const minSharesOut = applyYoSlippage(expectedShares);

    // Build approve + deposit calls
    const approveCallData = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [YO_GATEWAY_ADDRESS as Address, amountBigInt],
    });

    const depositCallData = encodeFunctionData({
      abi: YO_GATEWAY_ABI,
      functionName: "deposit",
      args: [
        params.vaultAddress,
        amountBigInt,
        minSharesOut,
        params.smartAccountAddress,
        YO_PARTNER_ID,
      ],
    });

    console.log("[YoDeposit] Executing approve + deposit batch...");

    const userOpHash = await kernelClient.sendUserOperation({
      calls: withBuilderCode([
        {
          to: params.underlyingAddress,
          value: BigInt(0),
          data: approveCallData,
        },
        {
          to: YO_GATEWAY_ADDRESS as `0x${string}`,
          value: BigInt(0),
          data: depositCallData,
        },
      ]),
    });

    console.log("[YoDeposit] UserOp submitted:", userOpHash);

    const receipt = await kernelClient.waitForUserOperationReceipt({
      hash: userOpHash,
    });

    console.log("[YoDeposit] Transaction confirmed:", receipt.receipt.transactionHash);

    return {
      success: true,
      txHash: receipt.receipt.transactionHash,
      userOpHash,
    };
  } catch (error: any) {
    console.error("[YoDeposit] Execution error:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}
