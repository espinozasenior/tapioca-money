/**
 * YO Protocol VaultExecutor implementation
 *
 * Wraps the existing executeYoGaslessDeposit and executeYoVaultRedeem
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
import { DepositError } from "@/lib/agent/vault-executor";
import { executeYoGaslessDeposit } from "@/lib/zerodev/yo-deposit-executor";
import { executeYoVaultRedeem } from "@/lib/zerodev/yo-vault-executor";
import { YO_VAULTS } from "@/lib/yo/constants";

export class YoVaultExecutor implements VaultExecutor {
  async deposit(ctx: ExecutorContext, params: DepositParams): Promise<DepositResult> {
    // Resolve underlying token info from YO vault config
    const vaultConfig = Object.values(YO_VAULTS).find(
      (v) => v.address.toLowerCase() === params.vaultAddress.toLowerCase()
    );
    if (!vaultConfig) {
      throw new DepositError("UNKNOWN_VAULT", "Unknown YO vault address");
    }

    const underlyingAddress =
      vaultConfig.underlying.address[8453 as keyof typeof vaultConfig.underlying.address];
    if (!underlyingAddress) {
      throw new DepositError("CHAIN_UNSUPPORTED", "YO vault not available on Base");
    }

    return executeYoGaslessDeposit({
      smartAccountAddress: ctx.smartAccountAddress,
      vaultAddress: params.vaultAddress,
      amount: params.amount,
      underlyingAddress: underlyingAddress as `0x${string}`,
      underlyingDecimals: vaultConfig.underlying.decimals,
      serializedAccount: ctx.serializedAccount,
    });
  }

  async redeem(ctx: ExecutorContext, params: RedeemParams): Promise<RedeemResult> {
    return executeYoVaultRedeem({
      smartAccountAddress: ctx.smartAccountAddress,
      vaultAddress: params.vaultAddress,
      shares: params.shares,
      receiver: params.receiver,
      serializedAccount: ctx.serializedAccount,
    });
  }
}
