/**
 * Morpho VaultExecutor implementation
 *
 * Wraps the existing executeGaslessDeposit and executeVaultRedeem
 * functions behind the unified VaultExecutor interface.
 */

import type {
  VaultExecutor,
  ExecutorContext,
  DepositParams,
  DepositResult,
  RedeemParams,
  RedeemResult,
} from "@/lib/agent/vault-executor";
import { extractLegacy7702Fields } from "@/lib/agent/vault-executor";
import { executeGaslessDeposit } from "@/lib/zerodev/deposit-executor";
import { executeVaultRedeem } from "@/lib/zerodev/vault-executor";

export class MorphoVaultExecutor implements VaultExecutor {
  async deposit(ctx: ExecutorContext, params: DepositParams): Promise<DepositResult> {
    const legacy = extractLegacy7702Fields(ctx.decryptedAuth);

    return executeGaslessDeposit({
      smartAccountAddress: ctx.smartAccountAddress,
      vaultAddress: params.vaultAddress,
      amount: params.amount,
      serializedAccount: ctx.serializedAccount,
      sessionPrivateKey: legacy?.sessionPrivateKey,
      approvedVaults: ctx.approvedVaults,
      eip7702SignedAuth: legacy?.eip7702SignedAuth,
    });
  }

  async redeem(ctx: ExecutorContext, params: RedeemParams): Promise<RedeemResult> {
    const legacy = extractLegacy7702Fields(ctx.decryptedAuth);

    return executeVaultRedeem({
      smartAccountAddress: ctx.smartAccountAddress,
      vaultAddress: params.vaultAddress,
      shares: params.shares,
      receiver: params.receiver,
      serializedAccount: ctx.serializedAccount,
      sessionPrivateKey: legacy?.sessionPrivateKey,
      approvedVaults: ctx.approvedVaults,
    });
  }
}
