// Auto-Optimization API Endpoint
import { NextRequest, NextResponse } from "next/server";
import { yieldDecisionEngine } from "@/lib/agent/decision-engine";
import { transformPosition, transformVaultToOpportunity } from "@/lib/morpho/transforms";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const address = searchParams.get("address") as `0x${string}` | null;

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

    const decision = await yieldDecisionEngine.evaluateRebalancing(address);
    const currentPositions = await yieldDecisionEngine.getUserPositionsWithApy(address);

    return NextResponse.json({
      decision: {
        shouldRebalance: decision.shouldRebalance,
        estimatedGasCost: "0", // Sponsored
        estimatedSlippage: 0, // Minimal for vaults
        netGain: decision.estimatedAnnualGain,
        reason: decision.reason,
        from: decision.currentVault
          ? transformPosition(
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
              transformedOpportunities
            )
          : null,
        to: decision.targetVault
          ? transformVaultToOpportunity({
              address: decision.targetVault.address,
              name: decision.targetVault.name,
              avgNetApy: decision.targetVault.apy,
              totalAssetsUsd: decision.targetVault.liquidityUsd,
            } as any)
          : null,
      },
      opportunities: transformedOpportunities,
      positions: currentPositions.map((p) => transformPosition(p, transformedOpportunities)),
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
