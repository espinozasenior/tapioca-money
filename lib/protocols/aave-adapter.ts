import type { ProtocolAdapter } from './adapter';
import type { YieldOpportunity, Position } from '../yield-optimizer/types';
import { getAaveOpportunities, getAavePosition, buildAaveDepositTx, buildAaveWithdrawTx } from '../yield-optimizer/protocols/aave';

/**
 * Aave V3 Protocol Adapter for Base Mainnet
 * Implements the ProtocolAdapter interface for Aave V3 lending markets
 */
export class AaveAdapter implements ProtocolAdapter {
  readonly protocol = 'aave' as const;
  readonly name = 'Aave V3';
  readonly enabled = true; // Now enabled on Base mainnet

  async getOpportunities(): Promise<YieldOpportunity[]> {
    return getAaveOpportunities();
  }

  async getPositions(userAddress: `0x${string}`): Promise<Position[]> {
    const position = await getAavePosition(userAddress);
    return position ? [position] : [];
  }

  async buildDepositCalls(amount: bigint, userAddress: `0x${string}`, _vaultAddress: `0x${string}`) {
    const tx = buildAaveDepositTx(amount, userAddress);
    return [
      { to: tx.approve.to as `0x${string}`, data: tx.approve.data as `0x${string}`, value: 0n },
      { to: tx.supply.to as `0x${string}`, data: tx.supply.data as `0x${string}`, value: 0n },
    ];
  }

  async buildWithdrawCalls(userAddress: `0x${string}`, _vaultAddress: `0x${string}`, _shares?: bigint, assets?: bigint) {
    const amount = assets || 0n;
    const tx = buildAaveWithdrawTx(amount, userAddress);
    return [{ to: tx.to as `0x${string}`, data: tx.data as `0x${string}`, value: 0n }];
  }
}
