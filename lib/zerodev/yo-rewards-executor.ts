/**
 * YO Protocol Rewards Executor
 * Handles gasless Merkl reward claiming via session key + ZeroDev bundler.
 * Follows yo-vault-executor.ts pattern exactly.
 */

import { encodeFunctionData } from "viem";
import { createDeserializedKernelClient } from "./kernel-client";
import { withBuilderCode } from "@/lib/builder-code";
import { MERKL_DISTRIBUTOR_ADDRESS_BASE } from "@/lib/yo/constants";
import { prepareClaimParams, merklDistributorAbi } from "@yo-protocol/core";

export interface YoClaimRewardsParams {
  smartAccountAddress: `0x${string}`;
  serializedAccount: string;
  userAddress: `0x${string}`;
  chainRewards: any; // MerklChainRewards from SDK
}

export interface YoClaimRewardsResult {
  success: boolean;
  txHash?: string;
  userOpHash?: string;
  error?: string;
}

/**
 * Execute gasless Merkl reward claim via the user's session key.
 * Uses prepareClaimParams from SDK to build calldata, then sends via kernel client.
 */
export async function executeYoRewardsClaim(
  params: YoClaimRewardsParams
): Promise<YoClaimRewardsResult> {
  try {
    console.log("[YoRewardsClaim] Starting...");
    console.log("[YoRewardsClaim] User:", params.userAddress);

    const isSimulation = process.env.AGENT_SIMULATION_MODE === "true";
    if (isSimulation) {
      console.log("[YoRewardsClaim] SIMULATION MODE");
      return {
        success: true,
        txHash: `0x${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`,
        userOpHash: `0xUserOp${Math.random().toString(16).slice(2)}`,
      };
    }

    // Prepare claim calldata via SDK
    const claimParams = prepareClaimParams(params.userAddress, params.chainRewards);

    const claimCallData = encodeFunctionData({
      abi: merklDistributorAbi,
      functionName: "claim",
      args: [claimParams.users, claimParams.tokens, claimParams.amounts, claimParams.proofs],
    });

    // Create kernel client from serialized account
    const kernelClient = await createDeserializedKernelClient(params.serializedAccount);

    console.log("[YoRewardsClaim] Executing claim...");

    const userOpHash = await kernelClient.sendUserOperation({
      calls: withBuilderCode([
        {
          to: MERKL_DISTRIBUTOR_ADDRESS_BASE as `0x${string}`,
          value: 0n,
          data: claimCallData as `0x${string}`,
        },
      ]),
    });

    console.log("[YoRewardsClaim] UserOp submitted:", userOpHash);

    const receipt = await kernelClient.waitForUserOperationReceipt({ hash: userOpHash });

    console.log("[YoRewardsClaim] Confirmed:", receipt.receipt.transactionHash);

    return {
      success: true,
      txHash: receipt.receipt.transactionHash,
      userOpHash,
    };
  } catch (error: any) {
    console.error("[YoRewardsClaim] Error:", error);
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
          : "Claim failed. Please try again later.",
    };
  }
}
