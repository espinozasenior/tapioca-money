import type { MorphoUserPosition, MorphoVault } from "./api-client";

export function transformVaultToOpportunity(vault: MorphoVault) {
  return {
    id: vault.address as string,
    protocol: "morpho" as const,
    name: vault.name,
    asset: vault.asset.symbol,
    apy: vault.avgNetApy ?? vault.netApy ?? 0,
    address: vault.address as string,
    riskScore: 0,
    tvl: vault.totalAssetsUsd,
    metadata: {
      name: vault.name,
      description: `Earn yield on ${vault.asset.symbol} via Morpho Vault`,
      vaultAddress: vault.address as string,
    },
    // Native Morpho fields used by VaultSafetyDetails
    totalAssetsUsd: vault.totalAssetsUsd,
    warnings: vault.warnings,
    whitelisted: vault.whitelisted,
    curators: vault.curators,
    performanceFee: vault.performanceFee,
    managementFee: vault.managementFee,
    liquidityUsd: vault.liquidityUsd,
  };
}

export type MorphoVaultOpportunity = ReturnType<typeof transformVaultToOpportunity>;

export function transformPosition(
  pos: (MorphoUserPosition & { apy: number }) | null,
  opportunities?: MorphoVaultOpportunity[]
) {
  if (!pos) return null;

  const matchedYield = opportunities?.find(
    (o) =>
      o.metadata.vaultAddress?.toLowerCase() === pos.vault.address.toLowerCase() ||
      o.address?.toLowerCase() === pos.vault.address.toLowerCase()
  );

  const enteredAt = pos.enteredAt || Date.now();
  const now = Date.now();
  const msElapsed = Math.max(0, now - enteredAt);
  const daysActive = Math.floor(msElapsed / (1000 * 60 * 60 * 24));
  const yearsElapsed = msElapsed / (1000 * 60 * 60 * 24 * 365.25);

  const assetsUsdc = Number(pos.assets) / 1e6;
  const apy = matchedYield?.apy ?? pos.apy;

  let totalEarned = 0;
  if (pos.pnlUsd != null) {
    totalEarned = pos.pnlUsd;
  } else if (pos.pnl) {
    totalEarned = Number(pos.pnl) / 1e6;
  } else {
    totalEarned = assetsUsdc * apy * yearsElapsed;
  }

  const monthlyRate = (assetsUsdc * apy) / 12;

  return {
    protocol: "morpho" as const,
    vaultAddress: pos.vault.address as string,
    vaultName: matchedYield?.name ?? pos.vault.name,
    vaultDescription: matchedYield?.metadata?.description,
    apy,
    enteredAt,
    id: `morpho-${pos.vault.address}`,
    yieldId: matchedYield?.id ?? `morpho-${pos.vault.address}`,
    shares: pos.shares.toString(),
    assets: pos.assets.toString(),
    amount: assetsUsdc.toFixed(2),
    amountUsd: Number(pos.assetsUsd).toFixed(2),
    createdAt: new Date(enteredAt).toISOString(),
    rewards: {
      totalEarned: totalEarned.toFixed(4),
      earnedThisMonth: (monthlyRate * (Math.min(daysActive, 30) / 30)).toFixed(4),
      monthlyRate: monthlyRate.toFixed(2),
      daysActive,
    },
  };
}
