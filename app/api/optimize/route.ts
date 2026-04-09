// Auto-Optimization API Endpoint
import { NextRequest, NextResponse } from "next/server";
import { yieldDecisionEngine } from "@/lib/agent/decision-engine";
import { transformPosition, transformVaultToOpportunity } from "@/lib/morpho/transforms";
import { transformYoVaultToOpportunity, transformYoPosition } from "@/lib/yo/transforms";
import {
  requireAuthForAddress,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth/middleware";
import { resolveAgentAddress } from "@/lib/agent/resolve-agent-address";
import { hasActivePositions } from "@/lib/agent/position-check";
import { PauseService } from "@/lib/shared/pause-service";
import { YoPauseChecker } from "@/lib/yo/pause-checker";
import { MorphoPauseChecker } from "@/lib/morpho/pause-checker";

const pauseService = new PauseService([new YoPauseChecker(), new MorphoPauseChecker()], {
  ttlMs: 60_000,
});

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
    const rawOpportunities = [...morphoOpportunities, ...yoOpportunities].sort(
      (a, b) => b.apy - a.apy
    );

    // If no address, return public vault list (no auth required).
    // INTENTIONAL PUBLIC ACCESS (M-6): This path is called during registration
    // (client-secure.ts) before the user has a stored session. It only exposes
    // vault metadata (names, APYs, addresses) which is already public on-chain.
    if (!address) {
      // ADR-001: Enrich opportunities with pause state (public path — opportunities only)
      const pauseStates = await pauseService.checkVaultPauseStates(
        rawOpportunities.map((o) => ({ address: o.address as `0x${string}`, protocol: o.protocol }))
      );
      const allOpportunities = rawOpportunities.map((o) => ({
        ...o,
        paused: pauseStates.get(o.address.toLowerCase() as `0x${string}`)?.paused ?? false,
      }));

      return NextResponse.json(
        {
          decision: null,
          opportunities: allOpportunities,
          positions: [],
          timestamp: Date.now(),
        },
        {
          headers: {
            "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
          },
        }
      );
    }

    // SECURITY: Verify the caller is authenticated and owns the requested address.
    // The address param may be a walletAddress (new frontend) or agentAddress (old frontend).
    // Try direct Privy wallet match first; if that fails, check if it's a registered agent address.
    let authResult = await requireAuthForAddress(request, address);
    let queryAddress = address as `0x${string}`;

    if (
      !authResult.authenticated &&
      authResult.error === "Address does not belong to authenticated user"
    ) {
      // The requested address doesn't match any Privy wallet. This happens when:
      // 1. Old frontend sends agentAddress (smart wallet) instead of walletAddress
      // 2. User switched Privy accounts and frontend has stale addresses in state
      // In both cases: authenticate by JWT only, resolve the user's actual agent address.
      const { authenticateRequest } = await import("@/lib/auth/middleware");
      const jwtAuth = await authenticateRequest(request);
      if (!jwtAuth.authenticated) {
        return unauthorizedResponse(jwtAuth.error || "Unauthorized");
      }
      const allWallets = jwtAuth.allWalletAddresses ?? [];
      const resolvedAgent = await resolveAgentAddress(allWallets);
      // Use the authenticated user's agent address regardless of what the frontend sent
      authResult = jwtAuth;
      queryAddress = (resolvedAgent ?? allWallets[0] ?? address) as `0x${string}`;
    } else if (!authResult.authenticated) {
      return unauthorizedResponse(authResult.error || "Unauthorized");
    } else {
      // Auth passed with walletAddress — resolve agentAddress for position queries
      const allWallets = authResult.allWalletAddresses ?? [address.toLowerCase()];
      const agentAddr = (await resolveAgentAddress(allWallets)) ?? address;
      queryAddress = agentAddr as `0x${string}`;
    }

    // P3 optimization: Short-circuit when user has zero positions across all vaults.
    // Saves ~600ms by skipping evaluateRebalancing + position fetches entirely.
    const allVaultAddresses = [
      ...morphoVaults.map((v) => v.address as `0x${string}`),
      ...yoVaults.map((v) => v.address as `0x${string}`),
    ];

    const hasPositions = await hasActivePositions(queryAddress, allVaultAddresses);
    if (!hasPositions) {
      // Enrich opportunities with pause state before returning
      const pauseStates = await pauseService.checkVaultPauseStates(
        rawOpportunities.map((o) => ({ address: o.address as `0x${string}`, protocol: o.protocol }))
      );
      const allOpportunities = rawOpportunities.map((o) => ({
        ...o,
        paused: pauseStates.get(o.address.toLowerCase() as `0x${string}`)?.paused ?? false,
      }));

      return NextResponse.json({
        decision: {
          shouldRebalance: false,
          estimatedGasCost: "0",
          estimatedSlippage: 0,
          netGain: 0,
          reason: "No active positions",
          from: null,
          to: null,
        },
        opportunities: allOpportunities,
        positions: [],
        timestamp: Date.now(),
      });
    }

    // Pass pre-fetched vaults to avoid redundant API calls (P0-1 fix)
    const decision = await yieldDecisionEngine.evaluateRebalancing(queryAddress, null, {
      morpho: morphoVaults,
      yo: yoVaults,
    });

    // Pass pre-fetched morpho vaults to avoid N+1 fetchVault calls (P1-3 fix)
    const [morphoPositions, yoPositions] = await Promise.all([
      yieldDecisionEngine.getMorphoPositionsWithApy(queryAddress, morphoVaults),
      yieldDecisionEngine.getYoPositionsWithApy(queryAddress, yoVaults, {
        includeHistory: false,
      }),
    ]);

    const transformedMorphoPositions = morphoPositions.map((p) =>
      transformPosition(p, morphoOpportunities)
    );
    const transformedYoPositions = yoPositions.map((p) => transformYoPosition(p, yoOpportunities));
    const mergedPositions = [...transformedMorphoPositions, ...transformedYoPositions].filter(
      (p): p is NonNullable<typeof p> => p != null
    );

    // ADR-001: Single merged pause check for all unique vaults (P2 optimization)
    // Combines opportunity vaults + position-only vaults (e.g. excluded by quality
    // gates but user still has funds) into one PauseService call.
    const allVaultEntries = new Map<string, { address: `0x${string}`; protocol: string }>();
    for (const o of rawOpportunities) {
      const key = o.address.toLowerCase();
      allVaultEntries.set(key, { address: key as `0x${string}`, protocol: o.protocol });
    }
    for (const p of mergedPositions) {
      const key = p.vaultAddress.toLowerCase();
      if (!allVaultEntries.has(key)) {
        allVaultEntries.set(key, {
          address: key as `0x${string}`,
          protocol: p.protocol ?? "morpho",
        });
      }
    }
    const pauseStates = await pauseService.checkVaultPauseStates(
      Array.from(allVaultEntries.values())
    );

    const allOpportunities = rawOpportunities.map((o) => ({
      ...o,
      paused: pauseStates.get(o.address.toLowerCase() as `0x${string}`)?.paused ?? false,
    }));

    const allPositions = mergedPositions.map((p) => ({
      ...p,
      paused: pauseStates.get(p.vaultAddress.toLowerCase() as `0x${string}`)?.paused ?? false,
    }));

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
        // Resolve underlying from the target vault's metadata
        const targetUnderlying = decision.targetVault.underlyingSymbol ?? "USDC";
        const targetUnderlyingAddr = decision.targetVault.underlyingAddress ?? ("0x" as any);
        const targetDecimals =
          targetUnderlying === "WETH" ? 18 : targetUnderlying === "cbBTC" ? 8 : 6;
        decisionTo = transformYoVaultToOpportunity({
          id: "",
          address: decision.targetVault.address,
          name: decision.targetVault.name,
          apy: decision.targetVault.apy,
          tvlUsd: decision.targetVault.liquidityUsd,
          underlying: {
            address: targetUnderlyingAddr,
            symbol: targetUnderlying,
            decimals: targetDecimals,
          },
          totalAssets: 0n,
          totalShares: 0n,
        });
      } else {
        decisionTo = transformVaultToOpportunity({
          address: decision.targetVault.address,
          name: decision.targetVault.name,
          asset: { symbol: decision.targetVault.underlyingSymbol ?? "USDC" },
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

    // SECURITY: Verify authenticated user owns the requested address
    const authResult = await requireAuthForAddress(request, address);
    if (!authResult.authenticated) {
      if (authResult.error === "Address does not belong to authenticated user") {
        return forbiddenResponse(authResult.error);
      }
      return unauthorizedResponse(authResult.error);
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
