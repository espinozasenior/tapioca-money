import { describe, it, expect, vi, beforeEach } from "vitest";
import { MorphoClient } from "@/lib/morpho/api-client";
import { GET_USER_POSITIONS, GET_USER_FIRST_DEPOSIT } from "@/lib/morpho/queries";

// Mock global fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

// Mock redis cache
vi.mock("@/lib/redis/morpho-cache", () => ({
  getCachedUserPositions: vi.fn().mockResolvedValue(null),
  setCachedUserPositions: vi.fn(),
}));

describe("MorphoClient - GraphQL", () => {
  let client: MorphoClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new MorphoClient();
  });

  it("should fetch entry time using GraphQL", async () => {
    const mockTimestamp = 1672531200; // seconds
    const expectedTime = mockTimestamp * 1000;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          vaultV2transactions: {
            items: [{ timestamp: mockTimestamp.toString() }],
          },
        },
      }),
    });

    const time = await client.getEntryTime("0xUser", "0xVault");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(time).toBe(expectedTime);

    // Check if query contained correct operation name or structure
    const callArgs = fetchMock.mock.calls[0][1];
    expect(JSON.parse(callArgs.body).query).toContain("GetUserFirstDeposit");
  });

  it("should return PnL from user positions query", async () => {
    // Mock user positions response
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          userByAddress: {
            vaultV2Positions: [
              {
                shares: "1000",
                assets: "1000",
                assetsUsd: 1000,
                pnl: "50000000", // 50 USDC (6 decimals)
                vault: {
                  address: "0xVault",
                  name: "Test Vault",
                  symbol: "tvUSDC",
                },
              },
            ],
          },
        },
      }),
    });

    // Mock entry time response (since fetchUserPositions calls getEntryTime)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          vaultV2transactions: { items: [] }, // No history found, defaults to now
        },
      }),
    });

    const positions = await client.fetchUserPositions("0xUser", 1);

    expect(positions).toHaveLength(1);
    expect(positions[0].pnl).toBe("50000000");
    // Verify it called positions query
    const callArgs = fetchMock.mock.calls[0][1];
    expect(JSON.parse(callArgs.body).query).toContain("GetUserPositions");
  });
});
