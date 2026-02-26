/**
 * YO Protocol Data Transforms
 * Converts YO-specific types to unified Tapioca types (YieldOpportunity, YieldPosition)
 */

import type { YoVault, YoUserPosition } from "./types";

export function transformYoVaultToOpportunity(vault: YoVault) {
  return {
    id: vault.address as string,
    protocol: "yo" as const,
    name: vault.name,
    asset: vault.underlying.symbol,
    apy: vault.apy,
    address: vault.address as string,
    riskScore: 0,
    tvl: vault.tvlUsd,
    metadata: {
      name: vault.name,
      description: `Earn yield on ${vault.underlying.symbol} via YO Protocol`,
      vaultAddress: vault.address as string,
    },
    // YO-specific fields (no Morpho-style warnings/curators)
    totalAssetsUsd: vault.tvlUsd,
    warnings: undefined,
    whitelisted: undefined,
    curators: undefined,
    performanceFee: undefined,
    managementFee: undefined,
    liquidityUsd: undefined,
  };
}

export type YoVaultOpportunity = ReturnType<typeof transformYoVaultToOpportunity>;

export function transformYoPosition(
  pos: YoUserPosition & { apy: number },
  opportunities?: YoVaultOpportunity[]
) {
  const matchedYield = opportunities?.find(
    (o) =>
      o.metadata.vaultAddress?.toLowerCase() === pos.vaultAddress.toLowerCase() ||
      o.address?.toLowerCase() === pos.vaultAddress.toLowerCase()
  );

  const enteredAt = pos.enteredAt || Date.now();
  const now = Date.now();
  const msElapsed = Math.max(0, now - enteredAt);
  const daysActive = Math.floor(msElapsed / (1000 * 60 * 60 * 24));
  const yearsElapsed = msElapsed / (1000 * 60 * 60 * 24 * 365.25);

  const assetsUsd = pos.assetsUsd;
  const apy = matchedYield?.apy ?? pos.apy;

  const totalEarned = assetsUsd * apy * yearsElapsed;
  const monthlyRate = (assetsUsd * apy) / 12;

  return {
    protocol: "yo" as const,
    vaultAddress: pos.vaultAddress as string,
    vaultName: matchedYield?.name ?? pos.vaultName,
    vaultDescription: matchedYield?.metadata?.description,
    apy,
    enteredAt,
    id: `yo-${pos.vaultAddress}`,
    yieldId: matchedYield?.id ?? `yo-${pos.vaultAddress}`,
    shares: pos.shares.toString(),
    assets: pos.assets.toString(),
    amount: assetsUsd.toFixed(2),
    amountUsd: assetsUsd.toFixed(2),
    createdAt: new Date(enteredAt).toISOString(),
    rewards: {
      totalEarned: totalEarned.toFixed(4),
      earnedThisMonth: (monthlyRate * (Math.min(daysActive, 30) / 30)).toFixed(4),
      monthlyRate: monthlyRate.toFixed(2),
      daysActive,
    },
  };
}
