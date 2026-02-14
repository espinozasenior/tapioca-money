import type { ProtocolAdapter } from './adapter';
import type { YieldOpportunity, Position } from '../yield-optimizer/types';
import {
  getMorphoOpportunities,
  getMorphoPosition,
  buildMorphoDepositTx,
  buildMorphoWithdrawTx,
} from '../yield-optimizer/protocols/morpho';

export class MorphoAdapter implements ProtocolAdapter {
  readonly protocol = 'morpho' as const;
  readonly name = 'Morpho Blue';
  readonly enabled = true;

  async getOpportunities(): Promise<YieldOpportunity[]> {
    return getMorphoOpportunities();
  }

  async getPositions(userAddress: `0x${string}`): Promise<Position[]> {
    return getMorphoPosition(userAddress);
  }

  async buildDepositCalls(
    amount: bigint,
    userAddress: `0x${string}`,
    vaultAddress: `0x${string}`,
  ): Promise<{ to: `0x${string}`; data: `0x${string}`; value: bigint }[]> {
    const tx = buildMorphoDepositTx(amount, userAddress, vaultAddress);
    return [
      { to: tx.approve.to as `0x${string}`, data: tx.approve.data, value: 0n },
      { to: tx.supply.to as `0x${string}`, data: tx.supply.data, value: 0n },
    ];
  }

  async buildWithdrawCalls(
    userAddress: `0x${string}`,
    vaultAddress: `0x${string}`,
    shares?: bigint,
    assets?: bigint,
  ): Promise<{ to: `0x${string}`; data: `0x${string}`; value: bigint }[]> {
    const tx = buildMorphoWithdrawTx(userAddress, shares, assets, vaultAddress);
    return [{ to: tx.to as `0x${string}`, data: tx.data, value: 0n }];
  }
}
