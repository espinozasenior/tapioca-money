/**
 * YO Protocol Vault Executor
 * Handles gasless redeem via YO Gateway (approve shares to Gateway + gateway.redeem)
 * Uses user's session key authorization for gasless execution via ZeroDev
 */

import { createPublicClient, encodeFunctionData, http, type Address } from "viem";
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
import { yoApiClient } from "@/lib/yo/api-client";
import { erc20Abi } from "@yo-protocol/core";

export interface YoRedeemParams {
  smartAccountAddress: `0x${string}`;
  vaultAddress: `0x${string}`;
  shares: bigint;
  receiver: `0x${string}`;
  serializedAccount: string;
}

export interface YoRedeemResult {
  success: boolean;
  txHash?: string;
  userOpHash?: string;
  redeemStatus?: "instant" | "queued";
  error?: string;
}

/**
 * Execute gasless redeem from a YO vault via the Gateway.
 * Batches: approve(vaultToken → Gateway) + gateway.redeem(vault, shares, minAssets, receiver, partnerId)
 */
export async function executeYoVaultRedeem(params: YoRedeemParams): Promise<YoRedeemResult> {
  try {
    console.log("[YoRedeem] Starting ZeroDev execution...");
    console.log("[YoRedeem] Vault:", params.vaultAddress);
    console.log("[YoRedeem] Shares:", params.shares.toString());

    const isSimulation = process.env.AGENT_SIMULATION_MODE === "true";
    if (isSimulation) {
      console.log("[YoRedeem] SIMULATION MODE - No real transaction");
      return {
        success: true,
        txHash: `0x${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`,
        userOpHash: `0xUserOp${Math.random().toString(16).slice(2)}`,
        redeemStatus: "instant",
      };
    }

    const kernelClient = await createDeserializedKernelClient(params.serializedAccount);

    // Quote minimum assets out with 0.5% slippage
    const publicClient = createPublicClient({
      chain: base,
      transport: http(CHAIN_CONFIG.rpcUrl),
    });

    const expectedAssets = await publicClient.readContract({
      address: YO_GATEWAY_ADDRESS as Address,
      abi: YO_GATEWAY_ABI,
      functionName: "quotePreviewRedeem",
      args: [params.vaultAddress, params.shares],
    });

    const minAssetsOut = applyYoSlippage(expectedAssets);

    // Approve vault shares to Gateway (vault token is the share token)
    const approveCallData = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [YO_GATEWAY_ADDRESS as Address, params.shares],
    });

    const redeemCallData = encodeFunctionData({
      abi: YO_GATEWAY_ABI,
      functionName: "redeem",
      args: [params.vaultAddress, params.shares, minAssetsOut, params.receiver, YO_PARTNER_ID],
    });

    console.log("[YoRedeem] Executing approve + redeem batch...");

    const userOpHash = await kernelClient.sendUserOperation({
      calls: withBuilderCode([
        {
          to: params.vaultAddress, // Approve the vault share token
          value: BigInt(0),
          data: approveCallData,
        },
        {
          to: YO_GATEWAY_ADDRESS as `0x${string}`,
          value: BigInt(0),
          data: redeemCallData,
        },
      ]),
    });

    console.log("[YoRedeem] UserOp submitted:", userOpHash);

    const receipt = await kernelClient.waitForUserOperationReceipt({
      hash: userOpHash,
    });

    console.log("[YoRedeem] Transaction confirmed:", receipt.receipt.transactionHash);
    const pending = await yoApiClient.fetchPendingRedemptions(params.vaultAddress, params.receiver);
    const redeemStatus =
      pending.pendingAssets > 0n || pending.pendingShares > 0n ? "queued" : "instant";

    return {
      success: true,
      txHash: receipt.receipt.transactionHash,
      userOpHash,
      redeemStatus,
    };
  } catch (error: any) {
    console.error("[YoRedeem] Execution error:", error);
    const msg: string = error.message || "";
    const isRateLimit = msg.includes("0x3e4983f6");
    const isValidationFailure =
      !isRateLimit && (msg.includes("AA23") || msg.includes("validateUserOp"));
    return {
      success: false,
      error: isRateLimit
        ? "Agent daily operation limit reached. Please re-register your agent to reset the limit, or try again tomorrow."
        : isValidationFailure
          ? "Session key validation failed. Please re-register your agent to update permissions."
          : msg,
    };
  }
}
