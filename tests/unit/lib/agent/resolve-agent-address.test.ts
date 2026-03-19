import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Redis cache
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();

vi.mock("@/lib/redis/client", () => ({
  getCacheInterface: async () => ({
    get: mockGet,
    set: mockSet,
    del: mockDel,
    setNX: vi.fn(),
    eval: vi.fn(),
  }),
}));

// Mock neon SQL client
const mockSql = vi.fn();

vi.mock("@neondatabase/serverless", () => ({
  neon: () => mockSql,
}));

describe("resolveAgentAddress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(null); // No cache by default
    mockSet.mockResolvedValue(undefined);
  });

  async function getResolver() {
    const mod = await import("@/lib/agent/resolve-agent-address");
    return mod.resolveAgentAddress;
  }

  // Path A: Email signup → embedded wallet → EIP-7702
  it("returns eoaAddress for EIP-7702 session (Path A: email)", async () => {
    const resolveAgentAddress = await getResolver();
    mockSql.mockResolvedValue([
      {
        wallet_address: "0xembedded",
        authorization_7702: {
          type: "zerodev-7702-session",
          eoaAddress: "0xEMBEDDED",
        },
      },
    ]);

    const result = await resolveAgentAddress(["0xembedded"]);
    expect(result).toBe("0xEMBEDDED");
  });

  // Path B: External wallet → ERC-4337 → smart wallet
  it("returns smartWalletAddress for ERC-4337 session (Path B: external wallet)", async () => {
    const resolveAgentAddress = await getResolver();
    mockSql.mockResolvedValue([
      {
        wallet_address: "0xbrave",
        authorization_7702: {
          type: "zerodev-erc4337-session",
          eoaAddress: "0xBRAVE",
          smartWalletAddress: "0xSMART_WALLET",
        },
      },
    ]);

    const result = await resolveAgentAddress(["0xbrave", "0xembedded"]);
    expect(result).toBe("0xSMART_WALLET");
  });

  // No registration — return first wallet
  it("returns first wallet address when user has no registration", async () => {
    const resolveAgentAddress = await getResolver();
    mockSql.mockResolvedValue([]);

    const result = await resolveAgentAddress(["0xwallet1", "0xwallet2"]);
    expect(result).toBe("0xwallet1");
  });

  // Cache hit
  it("returns cached value without DB query", async () => {
    const resolveAgentAddress = await getResolver();
    mockGet.mockResolvedValue("0xCACHED_AGENT");

    const result = await resolveAgentAddress(["0xwallet"]);
    expect(result).toBe("0xCACHED_AGENT");
    expect(mockSql).not.toHaveBeenCalled();
  });

  // Cache miss → DB query → cache set
  it("caches the resolved address after DB lookup", async () => {
    const resolveAgentAddress = await getResolver();
    mockSql.mockResolvedValue([
      {
        wallet_address: "0xbrave",
        authorization_7702: {
          type: "zerodev-erc4337-session",
          smartWalletAddress: "0xSMART",
        },
      },
    ]);

    await resolveAgentAddress(["0xbrave"]);
    expect(mockSet).toHaveBeenCalledWith(expect.stringContaining("0xbrave"), "0xSMART", 60);
  });

  // ERC-4337 with missing smartWalletAddress falls back to wallet
  it("returns wallet address if ERC-4337 session has no smartWalletAddress", async () => {
    const resolveAgentAddress = await getResolver();
    mockSql.mockResolvedValue([
      {
        wallet_address: "0xbrave",
        authorization_7702: {
          type: "zerodev-erc4337-session",
          eoaAddress: "0xBRAVE",
          // smartWalletAddress missing
        },
      },
    ]);

    const result = await resolveAgentAddress(["0xbrave"]);
    expect(result).toBe("0xBRAVE");
  });

  // Multiple Privy wallets — finds the registered one
  it("finds registered wallet among multiple Privy wallets", async () => {
    const resolveAgentAddress = await getResolver();
    // Only 0xembedded has a registration
    mockSql.mockResolvedValue([
      {
        wallet_address: "0xembedded",
        authorization_7702: {
          type: "zerodev-7702-session",
          eoaAddress: "0xEMBEDDED",
        },
      },
    ]);

    const result = await resolveAgentAddress(["0xbrave", "0xembedded"]);
    expect(result).toBe("0xEMBEDDED");
  });

  // Redis error — falls through to DB
  it("falls through to DB query on Redis error", async () => {
    const resolveAgentAddress = await getResolver();
    mockGet.mockRejectedValue(new Error("Redis down"));
    mockSql.mockResolvedValue([
      {
        wallet_address: "0xwallet",
        authorization_7702: {
          type: "zerodev-7702-session",
          eoaAddress: "0xWALLET",
        },
      },
    ]);

    const result = await resolveAgentAddress(["0xwallet"]);
    expect(result).toBe("0xWALLET");
  });

  // Empty wallet array
  it("returns null for empty wallet array", async () => {
    const resolveAgentAddress = await getResolver();
    const result = await resolveAgentAddress([]);
    expect(result).toBeNull();
  });
});
