// Auto-Optimization API Endpoint
import { NextRequest, NextResponse } from "next/server";
import { yieldDecisionEngine } from "@/lib/agent/decision-engine";
import { transformPosition, transformVaultToOpportunity } from "@/lib/morpho/transforms";
import { transformYoVaultToOpportunity, transformYoPosition } from "@/lib/yo/transforms";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const address = searchParams.get("address") as `0x${string}` | null;

  try {
    // Get all available vaults from both protocols in parallel
    const [morphoVaults, yoVaults] = await Promise.all([
      yieldDecisionEngine.getAvailableMorphoVaults(),
      yieldDecisionEngine.getAvailableYoVaults(),
    ]);

    const morphoOpportunities = morphoVaults.map(transformVaultToOpportunity);
    const yoOpportunities = yoVaults.map(transformYoVaultToOpportunity);
    const allOpportunities = [...morphoOpportunities, ...yoOpportunities].sort(
      (a, b) => b.apy - a.apy
    );

    // If no address, just return opportunities
    if (!address) {
      return NextResponse.json({
        decision: null,
        opportunities: allOpportunities,
        positions: [],
        timestamp: Date.now(),
      });
    }

    // Pass pre-fetched vaults to avoid redundant API calls (P0-1 fix)
    const decision = await yieldDecisionEngine.evaluateRebalancing(
      address,
      null,
      { morpho: morphoVaults, yo: yoVaults }
    );

    // Pass pre-fetched morpho vaults to avoid N+1 fetchVault calls (P1-3 fix)
    const [morphoPositions, yoPositions] = await Promise.all([
      yieldDecisionEngine.getMorphoPositionsWithApy(address, morphoVaults),
      yieldDecisionEngine.getYoPositionsWithApy(address, yoVaults),
    ]);

    const transformedMorphoPositions = morphoPositions.map((p) =>
      transformPosition(p, morphoOpportunities)
    );
    const transformedYoPositions = yoPositions.map((p) => transformYoPosition(p, yoOpportunities));
    const allPositions = [...transformedMorphoPositions, ...transformedYoPositions];

    // Transform decision vaults based on protocol
    let decisionFrom = null;
    if (decision.currentVault) {
      if (decision.currentVault.protocol === "yo") {
        decisionFrom = transformYoPosition(
          {
            vaultAddress: decision.currentVault.address,
            vaultName: decision.currentVault.name,
            vaultId: "",
            shares: BigInt(decision.currentVault.shares),
            assets: BigInt(decision.currentVault.assets),
            assetsUsd: 0,
            apy: decision.currentVault.apy,
          },
          yoOpportunities
        );
      } else {
        decisionFrom = transformPosition(
          {
            vault: {
              address: decision.currentVault.address,
              name: decision.currentVault.name,
              symbol: "",
            },
            shares: decision.currentVault.shares,
            assets: decision.currentVault.assets,
            apy: decision.currentVault.apy,
            assetsUsd: 0,
            pnl: null,
            pnlUsd: null,
          },
          morphoOpportunities
        );
      }
    }

    let decisionTo = null;
    if (decision.targetVault) {
      if (decision.targetVault.protocol === "yo") {
        decisionTo = transformYoVaultToOpportunity({
          id: "",
          address: decision.targetVault.address,
          name: decision.targetVault.name,
          apy: decision.targetVault.apy,
          tvlUsd: decision.targetVault.liquidityUsd,
          underlying: { address: "0x" as any, symbol: "USDC", decimals: 6 },
          totalAssets: 0n,
          totalShares: 0n,
        });
      } else {
        decisionTo = transformVaultToOpportunity({
          address: decision.targetVault.address,
          name: decision.targetVault.name,
          asset: { symbol: "USDC" },
          avgNetApy: decision.targetVault.apy,
          totalAssetsUsd: decision.targetVault.liquidityUsd,
        } as any);
      }
    }

    return NextResponse.json({
      decision: {
        shouldRebalance: decision.shouldRebalance,
        estimatedGasCost: "0",
        estimatedSlippage: 0,
        netGain: decision.estimatedAnnualGain,
        reason: decision.reason,
        from: decisionFrom,
        to: decisionTo,
      },
      opportunities: allOpportunities,
      positions: allPositions,
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
