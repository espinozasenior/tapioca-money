// Auto-Optimization API Endpoint
import { NextRequest, NextResponse } from "next/server";
import { yieldDecisionEngine } from "@/lib/agent/decision-engine";
import type { MorphoVault } from "@/lib/morpho/api-client";

// Transform MorphoVault to legacy Opportunity format
function transformVaultToOpportunity(vault: MorphoVault) {
  return {
    id: vault.address,
    protocol: "morpho",
    name: vault.name,
    asset: "USDC",
    apy: vault.avgNetApy ?? vault.netApy ?? 0,
    address: vault.address,
    riskScore: 0, // Not available in new SDK yet, default to 0
    tvl: vault.totalAssetsUsd?.toString() ?? "0",
    liquidityDepth: vault.totalAssets?.toString() ?? "0",
    // Legacy Yield.xyz compatibility
    providerId: "morpho",
    network: "base",
    metadata: {
      name: vault.name,
      description: `Earn yield on USDC via Morpho Vault`,
      vaultAddress: vault.address,
      isVault: true,
    },
    rewardRate: {
      total: vault.avgNetApy ?? vault.netApy ?? 0,
    },
    status: {
      enter: true,
      exit: true,
    },
    mechanics: {
      type: "vault",
    },
  };
}

// Transform Morpho position to legacy Position format
export function transformPositionToLegacy(pos: any, opportunities?: any[]) {
  if (!pos) return null;

  // Match position to its yield opportunity by vault address for name/description
  const matchedYield = opportunities?.find(
    (o: any) =>
      o.metadata?.vaultAddress?.toLowerCase() === pos.vault.address.toLowerCase() ||
      o.address?.toLowerCase() === pos.vault.address.toLowerCase()
  );

  const enteredAt = pos.enteredAt || Date.now();
  const now = Date.now();
  const msElapsed = Math.max(0, now - enteredAt);
  const daysActive = Math.floor(msElapsed / (1000 * 60 * 60 * 24));
  const yearsElapsed = msElapsed / (1000 * 60 * 60 * 24 * 365.25);

  const assetsUsdc = Number(pos.assets) / 1e6;
  const apy = matchedYield?.apy ?? pos.apy ?? 0;

  // Real earnings calculation (using Morpho API PnL or fallback)
  let totalEarned = 0;

  if (pos.pnlUsd != null) {
    // Direct USD float from Morpho API — most accurate
    totalEarned = pos.pnlUsd;
  } else if (pos.pnl) {
    // PnL from Morpho API is in underlying asset units (BigInt string)
    // Convert to USDC (divide by 1e6)
    totalEarned = Number(pos.pnl) / 1e6;
  } else {
    // Fallback: Estimate based on time
    totalEarned = assetsUsdc * apy * yearsElapsed;
  }

  const monthlyRate = (assetsUsdc * apy) / 12;

  return {
    protocol: "morpho",
    vaultAddress: pos.vault.address,
    vaultName: matchedYield?.name ?? pos.vault.name,
    vaultDescription: matchedYield?.metadata?.description,
    apy: apy,
    enteredAt: enteredAt,
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

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const address = searchParams.get("address") as `0x${string}` | null;
  const balance = searchParams.get("balance");

  try {
    // Get all available vaults
    const vaults = await yieldDecisionEngine.getAvailableVaults();
    const transformedOpportunities = vaults.map(transformVaultToOpportunity);

    // If no address, just return opportunities
    if (!address) {
      return NextResponse.json({
        decision: null,
        opportunities: transformedOpportunities,
        positions: [],
        timestamp: Date.now(),
      });
    }

    // Evaluate rebalancing
    // Note: The legacy 'balance' param was used to simulate, but the new engine fetches on-chain positions
    // We can pass the user address to evaluate
    const decision = await yieldDecisionEngine.evaluateRebalancing(address);

    // Get current positions
    const currentPositions = await yieldDecisionEngine.getUserPositionsWithApy(address);

    return NextResponse.json({
      decision: {
        shouldRebalance: decision.shouldRebalance,
        estimatedGasCost: "0", // Sponsored
        estimatedSlippage: 0, // Minimal for vaults
        netGain: decision.estimatedAnnualGain,
        reason: decision.reason,
        from: decision.currentVault
          ? transformPositionToLegacy(
              {
                vault: {
                  address: decision.currentVault.address,
                  name: decision.currentVault.name,
                },
                shares: decision.currentVault.shares,
                assets: decision.currentVault.assets,
                apy: decision.currentVault.apy,
                assetsUsd: 0, // Not needed for simple display
              },
              transformedOpportunities
            )
          : null,
        to: decision.targetVault
          ? transformVaultToOpportunity({
              address: decision.targetVault.address,
              name: decision.targetVault.name,
              avgNetApy: decision.targetVault.apy,
              totalAssetsUsd: decision.targetVault.liquidityUsd,
              // other fields undefined
            } as any)
          : null,
      },
      opportunities: transformedOpportunities,
      positions: currentPositions.map((p) =>
        transformPositionToLegacy(p, transformedOpportunities)
      ),
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Optimization error:", error);
    return NextResponse.json({ error: "Failed to evaluate optimization" }, { status: 500 });
  }
}

// POST endpoint for triggering autonomous rebalance
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address } = body;

    if (!address) {
      return NextResponse.json({ error: "Missing address" }, { status: 400 });
    }

    const decision = await yieldDecisionEngine.evaluateRebalancing(address as `0x${string}`);

    if (!decision.shouldRebalance) {
      return NextResponse.json({
        executed: false,
        reason: decision.reason,
      });
    }

    // In the new architecture, the agent runs on the server via cron.
    // This endpoint is just for the UI to check/simulate.
    // If we wanted to trigger it manually, we'd need to call the agent executor.
    // For now, we return the decision as a recommendation.

    return NextResponse.json({
      executed: false,
      decision: {
        shouldRebalance: decision.shouldRebalance,
        estimatedGasCost: "0",
        estimatedSlippage: 0,
        netGain: decision.estimatedAnnualGain,
        reason: decision.reason,
      },
      message: "Rebalance recommended. Enable Autonomous Agent to execute automatically.",
    });
  } catch (error) {
    console.error("Rebalance error:", error);
    return NextResponse.json({ error: "Failed to execute rebalance" }, { status: 500 });
  }
}
