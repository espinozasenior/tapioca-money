import { describe, it, expect, vi, beforeEach } from "vitest";
import { YoPauseChecker } from "@/lib/yo/pause-checker";

// Mock the rpc-client module
vi.mock("@/lib/shared/rpc-client", () => ({
  baseClient: {
    readContract: vi.fn(),
  },
}));

import { baseClient } from "@/lib/shared/rpc-client";

const VAULT_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`;
const VAULT_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as `0x${string}`;

describe("YoPauseChecker", () => {
  let checker: YoPauseChecker;

  beforeEach(() => {
    vi.clearAllMocks();
    checker = new YoPauseChecker();
  });

  it("returns paused=true when on-chain paused() returns true", async () => {
    (baseClient.readContract as any).mockResolvedValue(true);

    const results = await checker.checkPauseStates([VAULT_A]);

    expect(results).toHaveLength(1);
    expect(results[0].paused).toBe(true);
    expect(results[0].depositPaused).toBe(true);
    expect(results[0].redeemPaused).toBe(true);
  });

  it("returns paused=false when on-chain paused() returns false", async () => {
    (baseClient.readContract as any).mockResolvedValue(false);

    const results = await checker.checkPauseStates([VAULT_A]);

    expect(results[0].paused).toBe(false);
  });

  it("checks multiple vaults in parallel", async () => {
    (baseClient.readContract as any)
      .mockResolvedValueOnce(true) // VAULT_A paused
      .mockResolvedValueOnce(false); // VAULT_B not paused

    const results = await checker.checkPauseStates([VAULT_A, VAULT_B]);

    expect(results).toHaveLength(2);
    expect(results[0].paused).toBe(true);
    expect(results[1].paused).toBe(false);
  });

  it("fail-open: returns not-paused on RPC error", async () => {
    (baseClient.readContract as any).mockRejectedValue(new Error("RPC error"));

    const results = await checker.checkPauseStates([VAULT_A]);

    expect(results[0].paused).toBe(false);
  });

  it("fail-open: handles vault without paused() function", async () => {
    // ContractFunctionExecutionError is what viem throws for missing functions
    (baseClient.readContract as any).mockRejectedValue(
      new Error('The contract function "paused" returned no data')
    );

    const results = await checker.checkPauseStates([VAULT_A]);

    expect(results[0].paused).toBe(false);
  });

  it("returns empty array for empty input", async () => {
    const results = await checker.checkPauseStates([]);
    expect(results).toHaveLength(0);
    expect(baseClient.readContract).not.toHaveBeenCalled();
  });
});
