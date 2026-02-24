// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useWallet } from "@/hooks/useWallet";

// Mock dependencies
const mockGetAccessToken = vi.fn();
const mockUsePrivy = vi.fn();
const mockUseWallets = vi.fn();
const mockReadContract = vi.fn();
const mockSendTransaction = vi.fn();

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => mockUsePrivy(),
  useWallets: () => mockUseWallets(),
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: () => ({
      readContract: mockReadContract,
    }),
    createWalletClient: () => ({
      sendTransaction: mockSendTransaction,
    }),
    custom: vi.fn(),
    http: vi.fn(),
  };
});

describe("useWallet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();

    // Default mocks
    mockUsePrivy.mockReturnValue({
      authenticated: true,
      ready: true,
      getAccessToken: mockGetAccessToken,
    });

    mockUseWallets.mockReturnValue({
      wallets: [
        {
          address: "0xuser",
          getEthereumProvider: vi.fn().mockResolvedValue({ request: vi.fn() }),
        },
      ],
    });

    mockGetAccessToken.mockResolvedValue("mock-token");
  });

  it("should return connected status when ready", () => {
    const { result } = renderHook(() => useWallet());
    expect(result.current.status).toBe("connected");
    expect(result.current.wallet?.address).toBe("0xuser");
  });

  it("should return disconnected status when not authenticated", () => {
    mockUsePrivy.mockReturnValue({ authenticated: false, ready: true });
    mockUseWallets.mockReturnValue({ wallets: [] });

    const { result } = renderHook(() => useWallet());
    expect(result.current.status).toBe("disconnected");
  });

  it("should fetch balances", async () => {
    mockReadContract.mockResolvedValue(1000000n); // 1 USDC

    const { result } = renderHook(() => useWallet());

    // Check initial state
    expect(result.current.wallet).toBeDefined();

    if (result.current.wallet) {
      const balances = await result.current.wallet.balances(["USDC"]);
      expect(balances.usdc.amount).toBe("1");
      expect(mockReadContract).toHaveBeenCalled();
    }
  });

  it("should send tokens via wallet", async () => {
    mockSendTransaction.mockResolvedValue("0xtxhash");

    const { result } = renderHook(() => useWallet());

    if (result.current.wallet) {
      // Use a valid 20-byte hex address
      const validRecipient = "0x1234567890123456789012345678901234567890";
      const res = await result.current.wallet.send(validRecipient, "USDC", "10");
      expect(res.hash).toBe("0xtxhash");
      expect(mockSendTransaction).toHaveBeenCalled();
    }
  });

  it("should send sponsored tokens via API", async () => {
    // Mock status check
    (global.fetch as any)
      .mockResolvedValueOnce({
        json: async () => ({ isEnabled: true }),
      })
      // Mock transfer execution
      .mockResolvedValueOnce({
        json: async () => ({ success: true, hash: "0xtxhash" }),
      });

    const { result } = renderHook(() => useWallet());

    if (result.current.wallet) {
      const hash = await result.current.wallet.sendSponsored("0xrecipient", "USDC", "10");
      expect(hash).toBe("0xtxhash");

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/transfer/send"),
        expect.objectContaining({ method: "POST" })
      );
    }
  });

  it("should enable gasless transfers", async () => {
    (global.fetch as any).mockResolvedValue({
      json: async () => ({ success: true, smartAccountAddress: "0xsmart" }),
    });

    const { result } = renderHook(() => useWallet());

    if (result.current.wallet) {
      const res = await result.current.wallet.enableGaslessTransfers();
      expect(res.smartAccountAddress).toBe("0xsmart");

      expect(global.fetch).toHaveBeenCalledWith(
        "/api/transfer/register",
        expect.objectContaining({ method: "POST" })
      );
    }
  });
});
