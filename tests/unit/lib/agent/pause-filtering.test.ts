import { describe, it, expect, vi, beforeEach } from "vitest";
import { YieldDecisionEngine } from "@/lib/agent/decision-engine";
import { MorphoClient } from "@/lib/morpho/api-client";
import { PauseService } from "@/lib/shared/pause-service";
import { createVaultPauseState } from "@/lib/shared/vault-pause-state";

// Mock MorphoClient
vi.mock("@/lib/morpho/api-client", () => ({
  MorphoClient: class {
    fetchUserPositions = vi.fn();
    fetchVault = vi.fn();
    fetchVaults = vi.fn();
  },
}));

// Mock YoApiClient
vi.mock("@/lib/yo/api-client", () => {
  const mock = {
    fetchVaults: vi.fn().mockResolvedValue([]),
    fetchUserPositions: vi.fn().mockResolvedValue([]),
  };
  return {
    YoApiClient: class {
      fetchVaults = mock.fetchVaults;
      fetchUserPositions = mock.fetchUserPositions;
    },
    yoApiClient: mock,
  };
});

// Mock pause checkers (not the service itself — we test with a real PauseService + mock checker)
vi.mock("@/lib/yo/pause-checker", () => ({ YoPauseChecker: class {} }));
vi.mock("@/lib/morpho/pause-checker", () => ({ MorphoPauseChecker: class {} }));

const USER = "0x1234567890123456789012345678901234567890" as `0x${string}`;
const CURRENT_VAULT = "0x1111111111111111111111111111111111111111";
const BETTER_VAULT = "0x2222222222222222222222222222222222222222";
const PAUSED_VAULT = "0x3333333333333333333333333333333333333333";

describe("Decision Engine — Pause Filtering (ADR-001)", () => {
  let mockMorphoClient: any;
  let mockPauseChecker: any;
  let pauseService: PauseService;
  let engine: YieldDecisionEngine;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockMorphoClient = new MorphoClient();

    const { yoApiClient } = await import("@/lib/yo/api-client");
    (yoApiClient.fetchVaults as any).mockResolvedValue([]);
    (yoApiClient.fetchUserPositions as any).mockResolvedValue([]);

    // Create a mock checker that marks PAUSED_VAULT as deposit-paused
    mockPauseChecker = {
      checkPauseStates: vi.fn(async (addrs: `0x${string}`[]) =>
        addrs.map((a) =>
          createVaultPauseState(a, {
            depositPaused: a.toLowerCase() === PAUSED_VAULT.toLowerCase(),
            redeemPaused: false,
          })
        )
      ),
    };
    pauseService = new PauseService([mockPauseChecker], { ttlMs: 60_000 });
    engine = new YieldDecisionEngine(mockMorphoClient, undefined, pauseService);
  });

  it("filters out target vaults with deposits paused", async () => {
    mockMorphoClient.fetchUserPositions.mockResolvedValue([
      {
        vault: { address: CURRENT_VAULT },
        assetsUsd: 1000,
        shares: "100",
        assets: "1000",
      },
    ]);
    // PAUSED_VAULT has best APY but is paused, BETTER_VAULT is the fallback
    mockMorphoClient.fetchVaults.mockResolvedValue([
      {
        address: CURRENT_VAULT,
        name: "Current",
        avgNetApy: 0.05,
        totalAssetsUsd: 1_000_000,
      },
      {
        address: PAUSED_VAULT,
        name: "Paused Best",
        avgNetApy: 0.2, // 20% — best but paused
        totalAssetsUsd: 1_000_000,
      },
      {
        address: BETTER_VAULT,
        name: "Better",
        avgNetApy: 0.1, // 10% — next best, not paused
        totalAssetsUsd: 1_000_000,
      },
    ]);

    const result = await engine.evaluateRebalancing(USER);

    expect(result.shouldRebalance).toBe(true);
    // Should pick BETTER_VAULT, not PAUSED_VAULT
    expect(result.targetVault?.address).toBe(BETTER_VAULT);
  });

  it("blocks rebalance when source vault has redeems paused", async () => {
    // Override checker: mark CURRENT_VAULT as redeem-paused
    mockPauseChecker.checkPauseStates.mockImplementation(async (addrs: `0x${string}`[]) =>
      addrs.map((a) =>
        createVaultPauseState(a, {
          depositPaused: false,
          redeemPaused: a.toLowerCase() === CURRENT_VAULT.toLowerCase(),
        })
      )
    );

    mockMorphoClient.fetchUserPositions.mockResolvedValue([
      {
        vault: { address: CURRENT_VAULT },
        assetsUsd: 1000,
        shares: "100",
        assets: "1000",
      },
    ]);
    mockMorphoClient.fetchVaults.mockResolvedValue([
      {
        address: CURRENT_VAULT,
        name: "Current",
        avgNetApy: 0.05,
        totalAssetsUsd: 1_000_000,
      },
      {
        address: BETTER_VAULT,
        name: "Better",
        avgNetApy: 0.1,
        totalAssetsUsd: 1_000_000,
      },
    ]);

    const result = await engine.evaluateRebalancing(USER);

    expect(result.shouldRebalance).toBe(false);
    expect(result.reason).toBe("Current vault has redeems paused");
  });

  it("works normally when no vaults are paused", async () => {
    // Override checker: nothing paused
    mockPauseChecker.checkPauseStates.mockImplementation(async (addrs: `0x${string}`[]) =>
      addrs.map((a) => createVaultPauseState(a, { depositPaused: false, redeemPaused: false }))
    );

    mockMorphoClient.fetchUserPositions.mockResolvedValue([
      {
        vault: { address: CURRENT_VAULT },
        assetsUsd: 1000,
        shares: "100",
        assets: "1000",
      },
    ]);
    mockMorphoClient.fetchVaults.mockResolvedValue([
      {
        address: CURRENT_VAULT,
        name: "Current",
        avgNetApy: 0.05,
        totalAssetsUsd: 1_000_000,
      },
      {
        address: BETTER_VAULT,
        name: "Better",
        avgNetApy: 0.1,
        totalAssetsUsd: 1_000_000,
      },
    ]);

    const result = await engine.evaluateRebalancing(USER);

    expect(result.shouldRebalance).toBe(true);
    expect(result.targetVault?.address).toBe(BETTER_VAULT);
  });

  it("works without pause service (null — backward compat)", async () => {
    const engineNoPause = new YieldDecisionEngine(mockMorphoClient);

    mockMorphoClient.fetchUserPositions.mockResolvedValue([
      {
        vault: { address: CURRENT_VAULT },
        assetsUsd: 1000,
        shares: "100",
        assets: "1000",
      },
    ]);
    mockMorphoClient.fetchVaults.mockResolvedValue([
      {
        address: CURRENT_VAULT,
        name: "Current",
        avgNetApy: 0.05,
        totalAssetsUsd: 1_000_000,
      },
      {
        address: BETTER_VAULT,
        name: "Better",
        avgNetApy: 0.1,
        totalAssetsUsd: 1_000_000,
      },
    ]);

    const result = await engineNoPause.evaluateRebalancing(USER);

    expect(result.shouldRebalance).toBe(true);
    expect(mockPauseChecker.checkPauseStates).not.toHaveBeenCalled();
  });
});
