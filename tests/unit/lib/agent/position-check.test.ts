import { describe, it, expect, vi, beforeEach } from "vitest";
import { hasActivePositions } from "@/lib/agent/position-check";

// Hoist mocks so they're available before module evaluation
const { mockMulticall } = vi.hoisted(() => ({
  mockMulticall: vi.fn(),
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      multicall: mockMulticall,
    })),
  };
});

describe("hasActivePositions", () => {
  const agentAddress = "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`;
  const vaultAddresses: `0x${string}`[] = [
    "0xaaaa000000000000000000000000000000000001",
    "0xbbbb000000000000000000000000000000000002",
    "0xcccc000000000000000000000000000000000003",
    "0xdddd000000000000000000000000000000000004",
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when all vault balances are zero", async () => {
    mockMulticall.mockResolvedValue([
      { status: "success", result: 0n },
      { status: "success", result: 0n },
      { status: "success", result: 0n },
      { status: "success", result: 0n },
    ]);

    const result = await hasActivePositions(agentAddress, vaultAddresses);
    expect(result).toBe(false);
  });

  it("returns true when at least one vault has balance > 0", async () => {
    mockMulticall.mockResolvedValue([
      { status: "success", result: 0n },
      { status: "success", result: 0n },
      { status: "success", result: 5_000_000n },
      { status: "success", result: 0n },
    ]);

    const result = await hasActivePositions(agentAddress, vaultAddresses);
    expect(result).toBe(true);
  });

  it("returns true on RPC error (fail-open — assume positions exist)", async () => {
    mockMulticall.mockRejectedValue(new Error("RPC timeout"));

    const result = await hasActivePositions(agentAddress, vaultAddresses);
    expect(result).toBe(true);
  });

  it("uses multicall to batch all vault checks in one RPC call", async () => {
    mockMulticall.mockResolvedValue(vaultAddresses.map(() => ({ status: "success", result: 0n })));

    await hasActivePositions(agentAddress, vaultAddresses);

    // Multicall called exactly once
    expect(mockMulticall).toHaveBeenCalledTimes(1);

    // The contracts array should have one entry per vault
    const callArg = mockMulticall.mock.calls[0][0];
    expect(callArg.contracts).toHaveLength(vaultAddresses.length);

    // Each contract call should target the correct vault address with balanceOf
    for (let i = 0; i < vaultAddresses.length; i++) {
      expect(callArg.contracts[i].address).toBe(vaultAddresses[i]);
      expect(callArg.contracts[i].functionName).toBe("balanceOf");
      expect(callArg.contracts[i].args).toEqual([agentAddress]);
    }
  });

  it("checks both Morpho and YO vaults (accepts any vault address list)", async () => {
    const morphoVault = "0x1111000000000000000000000000000000000001" as `0x${string}`;
    const yoVault = "0x2222000000000000000000000000000000000002" as `0x${string}`;
    const mixedVaults = [morphoVault, yoVault];

    mockMulticall.mockResolvedValue([
      { status: "success", result: 0n },
      { status: "success", result: 0n },
    ]);

    await hasActivePositions(agentAddress, mixedVaults);

    const callArg = mockMulticall.mock.calls[0][0];
    expect(callArg.contracts).toHaveLength(2);
    expect(callArg.contracts[0].address).toBe(morphoVault);
    expect(callArg.contracts[1].address).toBe(yoVault);
  });

  it("returns false for empty vault list", async () => {
    const result = await hasActivePositions(agentAddress, []);
    expect(result).toBe(false);
    // Should not even call multicall for empty list
    expect(mockMulticall).not.toHaveBeenCalled();
  });

  it("treats individual vault failures as having a position (fail-open per vault)", async () => {
    // If a single vault's balanceOf call fails in the multicall, treat it as
    // potentially having a position (fail-open)
    mockMulticall.mockResolvedValue([
      { status: "success", result: 0n },
      { status: "failure", error: new Error("revert") },
      { status: "success", result: 0n },
      { status: "success", result: 0n },
    ]);

    const result = await hasActivePositions(agentAddress, vaultAddresses);
    expect(result).toBe(true);
  });
});
