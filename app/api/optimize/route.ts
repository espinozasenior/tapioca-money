// Auto-Optimization API Endpoint
import { NextRequest, NextResponse } from "next/server";
import { optimize, getAllOpportunities, getCurrentPosition } from "@/lib/yield-optimizer";

// Transform opportunity to include legacy compatibility fields
function transformOpportunity(o: any) {
  return {
    ...o,
    tvl: o.tvl.toString(),
    liquidityDepth: o.liquidityDepth.toString(),
    // Legacy Yield.xyz compatibility
    providerId: o.protocol,
    network: "base",
    metadata: {
      // Preserve original metadata (vaultAddress, curator, isVault, etc)
      ...o.metadata,
      // Add/override legacy fields
      name: o.name,
      description: o.metadata?.description || `Earn yield on USDC via ${o.protocol}`,
    },
    rewardRate: {
      total: o.apy,
    },
    status: {
      enter: true,
      exit: true,
    },
    mechanics: {
      type: o.metadata?.isVault ? "vault" : "lending",
    },
  };
}

// Transform position to include legacy compatibility fields
function transformPosition(p: any) {
  if (!p) return null;
  return {
    protocol: p.protocol,
    vaultAddress: p.vaultAddress,
    apy: p.apy,
    enteredAt: p.enteredAt,
    id: `${p.protocol}-${p.vaultAddress}`,
    yieldId: `base-usdc-${p.protocol}`,
    shares: p.shares.toString(),
    assets: p.assets.toString(),
    amount: (Number(p.assets) / 1e6).toFixed(2),
    amountUsd: (Number(p.assets) / 1e6).toFixed(2),
    createdAt: new Date(p.enteredAt).toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const address = searchParams.get("address") as `0x${string}` | null;
  const balance = searchParams.get("balance");

  try {
    const opportunities = await getAllOpportunities();
    const transformedOpportunities = opportunities.map(transformOpportunity);

    // If no address, just return opportunities
    if (!address) {
      return NextResponse.json({
        decision: null,
        opportunities: transformedOpportunities,
        positions: [],
        timestamp: Date.now(),
      });
    }

    const usdcBalance = balance ? BigInt(balance) : BigInt(0);
    const decision = await optimize(address, usdcBalance);
    const currentPosition = await getCurrentPosition(address);

    return NextResponse.json({
      decision: {
        ...decision,
        estimatedGasCost: decision.estimatedGasCost.toString(),
        from: decision.from ? transformPosition(decision.from) : null,
        to: decision.to ? transformOpportunity(decision.to) : null,
      },
      opportunities: transformedOpportunities,
      positions: currentPosition ? [transformPosition(currentPosition)] : [],
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
    const { address, balance } = body;

    if (!address) {
      return NextResponse.json({ error: "Missing address" }, { status: 400 });
    }

    const usdcBalance = balance ? BigInt(balance) : 0n;
    const decision = await optimize(address as `0x${string}`, usdcBalance);

    if (!decision.shouldRebalance) {
      return NextResponse.json({
        executed: false,
        reason: decision.reason,
      });
    }

    // In production, this would:
    // 1. Build the transaction using GOAT SDK
    // 2. Sign with Crossmint wallet (server-side agent key)
    // 3. Submit to chain
    // For now, return the decision for client-side execution

    return NextResponse.json({
      executed: false, // Would be true after actual execution
      decision: {
        ...decision,
        estimatedGasCost: decision.estimatedGasCost.toString(),
      },
      message: "Rebalance recommended - client should execute",
    });
  } catch (error) {
    console.error("Rebalance error:", error);
    return NextResponse.json({ error: "Failed to execute rebalance" }, { status: 500 });
  }
}
