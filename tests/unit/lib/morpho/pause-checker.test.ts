import { describe, it, expect, vi, beforeEach } from "vitest";
import { MorphoPauseChecker } from "@/lib/morpho/pause-checker";

// Mock the rpc-client module
vi.mock("@/lib/shared/rpc-client", () => ({
  baseClient: {
    readContract: vi.fn(),
  },
}));

import { baseClient } from "@/lib/shared/rpc-client";

const VAULT_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`;
const VAULT_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as `0x${string}`;

describe("MorphoPauseChecker", () => {
  let checker: MorphoPauseChecker;

  beforeEach(() => {
    vi.clearAllMocks();
    checker = new MorphoPauseChecker();
  });

  it("returns paused=true when guardian has paused the vault", async () => {
    (baseClient.readContract as any).mockResolvedValue(true);

    const results = await checker.checkPauseStates([VAULT_A]);

    expect(results).toHaveLength(1);
    expect(results[0].paused).toBe(true);
    expect(results[0].depositPaused).toBe(true);
    expect(results[0].redeemPaused).toBe(true);
  });

  it("returns paused=false when vault is active", async () => {
    (baseClient.readContract as any).mockResolvedValue(false);

    const results = await checker.checkPauseStates([VAULT_A]);

    expect(results[0].paused).toBe(false);
  });

  it("checks multiple vaults in parallel", async () => {
    (baseClient.readContract as any).mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const results = await checker.checkPauseStates([VAULT_A, VAULT_B]);

    expect(results).toHaveLength(2);
    expect(results[0].paused).toBe(false);
    expect(results[1].paused).toBe(true);
  });

  it("fail-open: returns not-paused on RPC error", async () => {
    (baseClient.readContract as any).mockRejectedValue(new Error("RPC timeout"));

    const results = await checker.checkPauseStates([VAULT_A]);

    expect(results[0].paused).toBe(false);
  });

  it("fail-open: handles vault without paused() function", async () => {
    (baseClient.readContract as any).mockRejectedValue(
      new Error('The contract function "paused" returned no data')
    );

    const results = await checker.checkPauseStates([VAULT_A]);

    expect(results[0].paused).toBe(false);
  });
});
