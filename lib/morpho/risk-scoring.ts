export interface RiskBreakdown {
  score: number; // 0-1
  level: "low" | "medium" | "high";
  factors: {
    warnings: number;
    whitelist: number;
    curator: number;
    fees: number;
    liquidity: number;
    size: number;
  };
  reasoning: string[];
}

// Trusted curator list
const TRUSTED_CURATORS = [
  "steakhouse",
  "gauntlet",
  "re7",
  "morpho",
  "block analitica",
  "blockanalitica",
];

export function isTrustedCurator(curatorName: string): boolean {
  if (!curatorName) return false;
  const normalized = curatorName.toLowerCase();
  return TRUSTED_CURATORS.some((trusted) => normalized.includes(trusted));
}

export function calculateRiskScore(vault: {
  warnings?: Array<{ type: string; level: string }>;
  whitelisted?: boolean;
  curators?: { items?: Array<{ name: string; addresses?: Array<{ address: string }> }> | null } | null;
  performanceFee?: number;
  managementFee?: number;
  liquidityUsd?: number | null;
  totalAssetsUsd?: number | null;
}): number {
  let score = 0;

  // 1. Warning System (0-0.4)
  if (vault.warnings?.some((w) => w.level === "RED")) {
    return 1.0; // Exclude entirely
  }
  if (vault.warnings?.some((w) => w.level === "YELLOW")) {
    score += 0.2;
  }

  // 2. Whitelist Status (0-0.2)
  if (vault.whitelisted === false) {
    score += 0.2;
  }

  // 3. Curator Reputation (0-0.2)
  const curatorNames = vault.curators?.items?.map((c) => c.name?.toLowerCase() || "") || [];
  const hasTrustedCurator = curatorNames.some((name) =>
    TRUSTED_CURATORS.some((trusted) => name.includes(trusted))
  );
  if (!hasTrustedCurator && curatorNames.length > 0) {
    score += 0.2;
  }
  if (curatorNames.length === 0) {
    score += 0.15; // Unknown curator
  }

  // 4. Fee Structure (0-0.15)
  if ((vault.performanceFee ?? 0) > 0.2) {
    score += 0.1; // >20% performance fee
  }
  if ((vault.managementFee ?? 0) > 0.02) {
    score += 0.05; // >2% annual fee
  }

  // 5. Liquidity Risk (0-0.15)
  if (vault.liquidityUsd != null && vault.totalAssetsUsd != null && vault.totalAssetsUsd > 0) {
    const liquidityRatio = vault.liquidityUsd / vault.totalAssetsUsd;
    if (liquidityRatio < 0.1) {
      score += 0.15; // <10% liquid = high risk
    } else if (liquidityRatio < 0.3) {
      score += 0.08; // <30% liquid = moderate risk
    }
  }

  // 6. Size/Maturity (0-0.1)
  if ((vault.totalAssetsUsd ?? 0) < 100000) {
    score += 0.1; // <$100k TVL = unproven
  }

  return Math.min(score, 1.0);
}

export function getRiskLevel(score: number): "low" | "medium" | "high" {
  if (score <= 0.3) return "low";
  if (score <= 0.6) return "medium";
  return "high";
}

export function getRiskColor(level: "low" | "medium" | "high"): string {
  return {
    low: "#10B981", // green-500
    medium: "#F59E0B", // amber-500
    high: "#EF4444", // red-500
  }[level];
}

export function getRiskBreakdown(vault: {
  warnings?: Array<{ type: string; level: string }>;
  whitelisted?: boolean;
  curators?: { items?: Array<{ name: string; addresses?: Array<{ address: string }> }> | null } | null;
  performanceFee?: number;
  managementFee?: number;
  liquidityUsd?: number | null;
  totalAssetsUsd?: number | null;
}): RiskBreakdown {
  const score = calculateRiskScore(vault);
  const level = getRiskLevel(score);
  const reasoning: string[] = [];
  const factors = {
    warnings: 0,
    whitelist: 0,
    curator: 0,
    fees: 0,
    liquidity: 0,
    size: 0,
  };

  // Analyze each factor
  if (vault.warnings?.some((w) => w.level === "RED")) {
    factors.warnings = 0.4;
    reasoning.push("Vault has critical warnings from Morpho");
  } else if (vault.warnings?.some((w) => w.level === "YELLOW")) {
    factors.warnings = 0.2;
    reasoning.push("Vault has warnings to review");
  }

  if (vault.whitelisted === false) {
    factors.whitelist = 0.2;
    reasoning.push("Vault is not whitelisted by Morpho");
  } else if (vault.whitelisted === true) {
    reasoning.push("Vault is whitelisted by Morpho ✓");
  }

  const curatorNames = vault.curators?.items?.map((c) => c.name?.toLowerCase() || "") || [];
  const hasTrustedCurator = curatorNames.some((name) =>
    TRUSTED_CURATORS.some((trusted) => name.includes(trusted))
  );

  if (curatorNames.length === 0) {
    factors.curator = 0.15;
    reasoning.push("Curator information unknown");
  } else if (!hasTrustedCurator) {
    factors.curator = 0.2;
    reasoning.push(`Curator "${curatorNames[0] || "Unknown"}" is not widely recognized`);
  } else {
    reasoning.push(`Curated by trusted team: ${curatorNames[0]}`);
  }

  if ((vault.performanceFee ?? 0) > 0.2 || (vault.managementFee ?? 0) > 0.02) {
    const fees: string[] = [];
    if ((vault.performanceFee ?? 0) > 0.2) {
      factors.fees += 0.1;
      fees.push(`${(vault.performanceFee! * 100).toFixed(1)}% performance`);
    }
    if ((vault.managementFee ?? 0) > 0.02) {
      factors.fees += 0.05;
      fees.push(`${(vault.managementFee! * 100).toFixed(2)}% annual`);
    }
    if (fees.length > 0) {
      reasoning.push(`High fees: ${fees.join(", ")}`);
    }
  }

  if (vault.liquidityUsd != null && vault.totalAssetsUsd != null && vault.totalAssetsUsd > 0) {
    const liquidityRatio = vault.liquidityUsd / vault.totalAssetsUsd;
    if (liquidityRatio < 0.1) {
      factors.liquidity = 0.15;
      reasoning.push(`Low liquidity: only ${(liquidityRatio * 100).toFixed(0)}% available`);
    } else if (liquidityRatio < 0.3) {
      factors.liquidity = 0.08;
      reasoning.push(`Moderate liquidity: ${(liquidityRatio * 100).toFixed(0)}% available`);
    } else {
      reasoning.push(`Good liquidity: ${(liquidityRatio * 100).toFixed(0)}% available`);
    }
  }

  if ((vault.totalAssetsUsd ?? 0) < 100000) {
    factors.size = 0.1;
    reasoning.push(`Small TVL: $${((vault.totalAssetsUsd ?? 0) / 1000).toFixed(0)}k (less tested)`);
  } else if ((vault.totalAssetsUsd ?? 0) < 1000000) {
    reasoning.push(`Moderate TVL: $${((vault.totalAssetsUsd ?? 0) / 1000000).toFixed(1)}m`);
  } else {
    reasoning.push(`Strong TVL: $${((vault.totalAssetsUsd ?? 0) / 1000000).toFixed(1)}m`);
  }

  return {
    score,
    level,
    factors,
    reasoning,
  };
}
