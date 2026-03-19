import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks
const {
  mockGetClaimableRewards,
  mockHasMerklClaimableRewards,
  mockGetMerklClaimableAmount,
  mockGetMerklTotalClaimable,
  mockCreateYoClient,
  mockGetCachedYoRewards,
  mockSetCachedYoRewards,
} = vi.hoisted(() => ({
  mockGetClaimableRewards: vi.fn(),
  mockHasMerklClaimableRewards: vi.fn(),
  mockGetMerklClaimableAmount: vi.fn(),
  mockGetMerklTotalClaimable: vi.fn(),
  mockCreateYoClient: vi.fn(),
  mockGetCachedYoRewards: vi.fn(),
  mockSetCachedYoRewards: vi.fn(),
}));

vi.mock("@yo-protocol/core", () => ({
  createYoClient: mockCreateYoClient,
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({})),
    http: vi.fn(() => "mock-transport"),
    formatUnits: actual.formatUnits,
  };
});

vi.mock("viem/chains", () => ({
  base: { id: 8453, name: "Base" },
}));

vi.mock("@/lib/config", () => ({
  CHAIN_CONFIG: { chainId: 8453, rpcUrl: "http://localhost" },
}));

vi.mock("@/lib/redis/yo-cache", () => ({
  getCachedYoRewards: mockGetCachedYoRewards,
  setCachedYoRewards: mockSetCachedYoRewards,
}));

// Mock the constants to avoid importing the full yo-protocol/core in tests
vi.mock("@/lib/yo/constants", () => ({
  YO_PARTNER_ID: 0,
}));

describe("fetchClaimableRewards", () => {
  const mockYoClient = {
    getClaimableRewards: mockGetClaimableRewards,
    hasMerklClaimableRewards: mockHasMerklClaimableRewards,
    getMerklClaimableAmount: mockGetMerklClaimableAmount,
    getMerklTotalClaimable: mockGetMerklTotalClaimable,
  };

  const testAddress = "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`;

  const mockChainRewards = {
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
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateYoClient.mockReturnValue(mockYoClient);
    mockGetCachedYoRewards.mockResolvedValue(null);
    mockSetCachedYoRewards.mockResolvedValue(undefined);
  });

  it("returns cached result when available", async () => {
    const cachedResult = {
      chainId: 8453,
      tokens: [],
      totalClaimable: "1000000000000000000",
      totalClaimableFormatted: "1",
      hasClaimable: true,
      totalClaimableUsd: null,
    };
    mockGetCachedYoRewards.mockResolvedValue(cachedResult);

    const { fetchClaimableRewards } = await import("@/lib/yo/rewards-client");
    const result = await fetchClaimableRewards(testAddress);

    expect(result).toEqual(cachedResult);
    expect(mockGetClaimableRewards).not.toHaveBeenCalled();
  });

  it("skips cache when skipCache is true", async () => {
    const cachedResult = { chainId: 8453, tokens: [], hasClaimable: true };
    mockGetCachedYoRewards.mockResolvedValue(cachedResult);

    mockGetClaimableRewards.mockResolvedValue(null);

    const { fetchClaimableRewards } = await import("@/lib/yo/rewards-client");
    const result = await fetchClaimableRewards(testAddress, true);

    expect(mockGetCachedYoRewards).not.toHaveBeenCalled();
    expect(mockGetClaimableRewards).toHaveBeenCalledWith(testAddress);
    expect(result).toBeNull();
  });

  it("returns null when SDK returns null", async () => {
    mockGetClaimableRewards.mockResolvedValue(null);

    const { fetchClaimableRewards } = await import("@/lib/yo/rewards-client");
    const result = await fetchClaimableRewards(testAddress);

    expect(result).toBeNull();
  });

  it("returns null when no claimable rewards", async () => {
    mockGetClaimableRewards.mockResolvedValue(mockChainRewards);
    mockHasMerklClaimableRewards.mockReturnValue(false);

    const { fetchClaimableRewards } = await import("@/lib/yo/rewards-client");
    const result = await fetchClaimableRewards(testAddress);

    expect(result).toBeNull();
  });

  it("returns mapped rewards when SDK has claimable rewards", async () => {
    mockGetClaimableRewards.mockResolvedValue(mockChainRewards);
    mockHasMerklClaimableRewards.mockReturnValue(true);
    mockGetMerklClaimableAmount.mockReturnValue(1000000000000000000n);
    mockGetMerklTotalClaimable.mockReturnValue(1000000000000000000n);

    const { fetchClaimableRewards } = await import("@/lib/yo/rewards-client");
    const result = await fetchClaimableRewards(testAddress);

    expect(result).not.toBeNull();
    expect(result!.chainId).toBe(8453);
    expect(result!.hasClaimable).toBe(true);
    expect(result!.tokens).toHaveLength(1);
    expect(result!.tokens[0].symbol).toBe("YO");
    expect(result!.tokens[0].address).toBe("0x3C1a1c9C2D073E5bC4e7AF97f0d7caC7a82E2262");
    expect(result!.tokens[0].claimable).toBe("1000000000000000000");
    expect(result!.tokens[0].claimableFormatted).toBe("1");
    expect(result!.totalClaimable).toBe("1000000000000000000");
    expect(result!.totalClaimableFormatted).toBe("1");
    expect(result!.totalClaimableUsd).toBeNull();
    expect(result!.rawChainRewards).toBe(mockChainRewards);
  });

  it("caches result after fetching from SDK", async () => {
    mockGetClaimableRewards.mockResolvedValue(mockChainRewards);
    mockHasMerklClaimableRewards.mockReturnValue(true);
    mockGetMerklClaimableAmount.mockReturnValue(1000000000000000000n);
    mockGetMerklTotalClaimable.mockReturnValue(1000000000000000000n);

    const { fetchClaimableRewards } = await import("@/lib/yo/rewards-client");
    await fetchClaimableRewards(testAddress);

    expect(mockSetCachedYoRewards).toHaveBeenCalledTimes(1);
    expect(mockSetCachedYoRewards).toHaveBeenCalledWith(
      testAddress,
      8453,
      expect.objectContaining({ hasClaimable: true })
    );
  });

  it("filters out tokens with zero claimable amount", async () => {
    const rewardsWithZero = {
      ...mockChainRewards,
      rewards: [
        ...mockChainRewards.rewards,
        {
          token: {
            address: "0xOtherToken",
            symbol: "OTHER",
            decimals: 18,
            name: "Other",
            chainId: 8453,
          },
          amount: "500",
          claimed: "500",
          proofs: [],
        },
      ],
    };

    mockGetClaimableRewards.mockResolvedValue(rewardsWithZero);
    mockHasMerklClaimableRewards.mockReturnValue(true);
    // First call returns positive, second returns 0
    mockGetMerklClaimableAmount.mockReturnValueOnce(1000000000000000000n).mockReturnValueOnce(0n);
    mockGetMerklTotalClaimable.mockReturnValue(1000000000000000000n);

    const { fetchClaimableRewards } = await import("@/lib/yo/rewards-client");
    const result = await fetchClaimableRewards(testAddress);

    expect(result!.tokens).toHaveLength(1);
    expect(result!.tokens[0].symbol).toBe("YO");
  });

  it("returns null when all tokens have zero claimable", async () => {
    mockGetClaimableRewards.mockResolvedValue(mockChainRewards);
    mockHasMerklClaimableRewards.mockReturnValue(true);
    mockGetMerklClaimableAmount.mockReturnValue(0n);

    const { fetchClaimableRewards } = await import("@/lib/yo/rewards-client");
    const result = await fetchClaimableRewards(testAddress);

    expect(result).toBeNull();
  });
});
