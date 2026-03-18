import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Hoisted mocks
const {
  mockSendUserOperation,
  mockWaitForUserOperationReceipt,
  mockCreateDeserializedKernelClient,
} = vi.hoisted(() => ({
  mockSendUserOperation: vi.fn(),
  mockWaitForUserOperationReceipt: vi.fn(),
  mockCreateDeserializedKernelClient: vi.fn(),
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({})),
    http: vi.fn(() => "mock-transport"),
    encodeFunctionData: vi.fn(() => "0xencodedClaimData"),
  };
});

vi.mock("viem/chains", () => ({
  base: { id: 8453, name: "Base" },
}));

vi.mock("@/lib/zerodev/kernel-client", () => ({
  createDeserializedKernelClient: mockCreateDeserializedKernelClient,
}));

vi.mock("@/lib/config", () => ({
  CHAIN_CONFIG: { chainId: 8453, rpcUrl: "http://localhost" },
}));

vi.mock("@/lib/builder-code", () => ({
  withBuilderCode: vi.fn((calls: any[]) => calls),
}));

vi.mock("@yo-protocol/core", () => ({
  prepareClaimParams: vi.fn(() => ({
    users: ["0xUser"],
    tokens: ["0xToken"],
    amounts: [1000000000000000000n],
    proofs: [["0xproof"]],
  })),
  merklDistributorAbi: [
    {
      inputs: [
        { type: "address[]", name: "users" },
        { type: "address[]", name: "tokens" },
        { type: "uint256[]", name: "amounts" },
        { type: "bytes32[][]", name: "proofs" },
      ],
      name: "claim",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
  ],
}));

vi.mock("@/lib/yo/constants", () => ({
  MERKL_DISTRIBUTOR_ADDRESS_BASE: "0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae",
  YO_PARTNER_ID: 0,
}));

import { executeYoRewardsClaim } from "@/lib/zerodev/yo-rewards-executor";

describe("executeYoRewardsClaim", () => {
  const mockKernelClient = {
    sendUserOperation: mockSendUserOperation,
    waitForUserOperationReceipt: mockWaitForUserOperationReceipt,
  };

  const originalEnv = process.env;

  const defaultParams = {
    smartAccountAddress: "0xAccount" as `0x${string}`,
    serializedAccount: "serialized-account-data",
    userAddress: "0xUser" as `0x${string}`,
    chainRewards: {
      chainId: 8453,
      rewards: [
        {
          token: {
            address: "0x3C1a1c9C2D073E5bC4e7AF97f0d7caC7a82E2262",
            symbol: "YO",
            decimals: 18,
            name: "YO Token",
            chainId: 8453,
          },
          amount: "1000000000000000000",
          claimed: "0",
          proofs: ["0xproof1"],
        },
      ],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.AGENT_SIMULATION_MODE;

    mockCreateDeserializedKernelClient.mockResolvedValue(mockKernelClient);
    mockSendUserOperation.mockResolvedValue("0xOpHash");
    mockWaitForUserOperationReceipt.mockResolvedValue({
      receipt: { transactionHash: "0xTxHash" },
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns mock result in simulation mode", async () => {
    process.env.AGENT_SIMULATION_MODE = "true";

    const result = await executeYoRewardsClaim(defaultParams);

    expect(result.success).toBe(true);
    expect(result.txHash).toBeDefined();
    expect(result.userOpHash).toBeDefined();
    expect(mockSendUserOperation).not.toHaveBeenCalled();
    expect(mockCreateDeserializedKernelClient).not.toHaveBeenCalled();
  });

  it("executes claim via kernel client", async () => {
    const result = await executeYoRewardsClaim(defaultParams);

    expect(result.success).toBe(true);
    expect(result.txHash).toBe("0xTxHash");
    expect(result.userOpHash).toBe("0xOpHash");
    expect(mockCreateDeserializedKernelClient).toHaveBeenCalledWith("serialized-account-data");
    expect(mockSendUserOperation).toHaveBeenCalledTimes(1);
    expect(mockWaitForUserOperationReceipt).toHaveBeenCalledWith({ hash: "0xOpHash" });
  });

  it("sends call to Merkl Distributor address", async () => {
    await executeYoRewardsClaim(defaultParams);

    const calls = mockSendUserOperation.mock.calls[0][0].calls;
    expect(calls).toHaveLength(1);
    expect(calls[0].to).toBe("0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae");
    expect(calls[0].value).toBe(0n);
    expect(calls[0].data).toBe("0xencodedClaimData");
  });

  it("handles rate limit errors", async () => {
    mockSendUserOperation.mockRejectedValue(new Error("0x3e4983f6: rate limit exceeded"));

    const result = await executeYoRewardsClaim(defaultParams);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Agent daily operation limit reached");
  });

  it("handles AA23 validation failures", async () => {
    mockSendUserOperation.mockRejectedValue(new Error("AA23 reverted 0x007e472e"));

    const result = await executeYoRewardsClaim(defaultParams);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Session key validation failed");
  });

  it("handles generic errors", async () => {
    mockSendUserOperation.mockRejectedValue(new Error("Some unexpected error"));

    const result = await executeYoRewardsClaim(defaultParams);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Some unexpected error");
  });

  it("handles validateUserOp errors", async () => {
    mockSendUserOperation.mockRejectedValue(new Error("validateUserOp failed"));

    const result = await executeYoRewardsClaim(defaultParams);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Session key validation failed");
  });
});
