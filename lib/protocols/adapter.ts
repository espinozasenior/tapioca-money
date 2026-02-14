import type { YieldOpportunity, Position } from '../yield-optimizer/types';

export interface ProtocolAdapter {
  readonly protocol: 'morpho' | 'aave' | 'moonwell';

  readonly name: string;

  readonly enabled: boolean;

  getOpportunities(): Promise<YieldOpportunity[]>;

  getPositions(userAddress: `0x${string}`): Promise<Position[]>;

  buildDepositCalls(
    amount: bigint,
    userAddress: `0x${string}`,
    vaultAddress: `0x${string}`,
  ): Promise<{ to: `0x${string}`; data: `0x${string}`; value: bigint }[]>;

  buildWithdrawCalls(
    userAddress: `0x${string}`,
    vaultAddress: `0x${string}`,
    shares?: bigint,
    assets?: bigint,
  ): Promise<{ to: `0x${string}`; data: `0x${string}`; value: bigint }[]>;
}

export class ProtocolRegistry {
  private adapters: Map<string, ProtocolAdapter> = new Map();

  register(adapter: ProtocolAdapter): void {
    this.adapters.set(adapter.protocol, adapter);
  }

  get(protocol: string): ProtocolAdapter | undefined {
    return this.adapters.get(protocol);
  }

  getAll(): ProtocolAdapter[] {
    return Array.from(this.adapters.values());
  }

  getEnabled(): ProtocolAdapter[] {
    return this.getAll().filter(a => a.enabled);
  }

  async getAllOpportunities(): Promise<YieldOpportunity[]> {
    const results = await Promise.allSettled(
      this.getEnabled().map(a => a.getOpportunities())
    );
    return results
      .filter((r): r is PromiseFulfilledResult<YieldOpportunity[]> => r.status === 'fulfilled')
      .flatMap(r => r.value);
  }

  async getAllPositions(userAddress: `0x${string}`): Promise<Position[]> {
    const results = await Promise.allSettled(
      this.getEnabled().map(a => a.getPositions(userAddress))
    );
    return results
      .filter((r): r is PromiseFulfilledResult<Position[]> => r.status === 'fulfilled')
      .flatMap(r => r.value);
  }
}
