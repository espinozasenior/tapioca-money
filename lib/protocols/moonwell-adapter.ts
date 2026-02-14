import type { ProtocolAdapter } from './adapter';
import type { YieldOpportunity, Position } from '../yield-optimizer/types';
import {
  getMoonwellOpportunities,
  getMoonwellPosition,
  buildMoonwellDepositTx,
  buildMoonwellWithdrawTx,
} from '../yield-optimizer/protocols/moonwell';

export class MoonwellAdapter implements ProtocolAdapter {
  readonly protocol = 'moonwell' as const;
  readonly name = 'Moonwell';
  readonly enabled = true;

  async getOpportunities(): Promise<YieldOpportunity[]> {
    return getMoonwellOpportunities();
  }

  async getPositions(userAddress: `0x${string}`): Promise<Position[]> {
    const position = await getMoonwellPosition(userAddress);
    return position ? [position] : [];
  }

  async buildDepositCalls(
    amount: bigint,
    userAddress: `0x${string}`,
    _vaultAddress: `0x${string}`,
  ): Promise<{ to: `0x${string}`; data: `0x${string}`; value: bigint }[]> {
    const tx = buildMoonwellDepositTx(amount, userAddress);
    return [
      { to: tx.approve.to as `0x${string}`, data: tx.approve.data as `0x${string}`, value: 0n },
      { to: tx.mint.to as `0x${string}`, data: tx.mint.data as `0x${string}`, value: 0n },
    ];
  }

  async buildWithdrawCalls(
    userAddress: `0x${string}`,
    _vaultAddress: `0x${string}`,
    _shares?: bigint,
    assets?: bigint,
  ): Promise<{ to: `0x${string}`; data: `0x${string}`; value: bigint }[]> {
    const amount = assets || 0n;
    const tx = buildMoonwellWithdrawTx(amount, userAddress);
    return [{ to: tx.to as `0x${string}`, data: tx.data as `0x${string}`, value: 0n }];
  }
}
