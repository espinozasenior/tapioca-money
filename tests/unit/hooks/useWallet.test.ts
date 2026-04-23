// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useWallet } from "@/hooks/useWallet";

// Mock dependencies
const mockGetAccessToken = vi.fn();
const mockUsePrivy = vi.fn();
const mockUseWalletSelection = vi.fn();
const mockReadContract = vi.fn();
const mockSendTransaction = vi.fn();

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => mockUsePrivy(),
}));

vi.mock("@/hooks/useWalletSelection", () => ({
  useWalletSelection: () => mockUseWalletSelection(),
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

    mockUseWalletSelection.mockReturnValue({
      activeWallet: {
        address: "0xuser",
        walletClientType: "privy",
        chainType: "ethereum",
        raw: {
          address: "0xuser",
          getEthereumProvider: vi.fn().mockResolvedValue({ request: vi.fn() }),
        },
      },
      activeWalletType: "embedded",
      isEvmWallet: true,
      isSolanaWallet: false,
      supportsSmartAccount: true,
      allWallets: [],
      selectWallet: vi.fn(),
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
    mockUseWalletSelection.mockReturnValue({
      activeWallet: null,
      activeWalletType: null,
      isEvmWallet: false,
      isSolanaWallet: false,
      supportsSmartAccount: false,
      allWallets: [],
      selectWallet: vi.fn(),
    });

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
    // Session already on v2 → no inline setup needed.
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ isEnabled: true, permissionsVersion: 2 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, hash: "0xtxhash", feePaid: "0.03" }),
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

  describe("sendUsdc phase emission", () => {
    const validAddress = "0x1234567890123456789012345678901234567890";

    it("emits submitting → confirming → success when session is v2", async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ isEnabled: true, permissionsVersion: 2 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            hash: "0xtx",
            userOpHash: "0xuo",
            feePaid: "0.02",
          }),
        });

      const { result } = renderHook(() => useWallet());
      const phases: string[] = [];
      const ctxs: any[] = [];
      const out = await result.current.wallet!.sendUsdc(
        { to: validAddress, amount: "10" },
        (ctx) => {
          phases.push(ctx.phase);
          ctxs.push(ctx);
        }
      );

      expect(phases).toEqual(["submitting", "submitting", "confirming", "success"]);
      expect(ctxs[2]).toMatchObject({ phase: "confirming", userOpHash: "0xuo" });
      expect(ctxs[3]).toMatchObject({
        phase: "success",
        txHash: "0xtx",
        feePaid: "0.02",
      });
      expect(out).toEqual({ hash: "0xtx", userOpHash: "0xuo", feePaid: "0.02" });
    });

    it("runs inline session setup for a brand-new user (isEnabled=false)", async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ isEnabled: false }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, smartAccountAddress: "0xsmart" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, hash: "0xtx", feePaid: "0.02" }),
        });

      const { result } = renderHook(() => useWallet());
      const phases: string[] = [];

      await result.current.wallet!.sendUsdc({ to: validAddress, amount: "5" }, (ctx) =>
        phases.push(ctx.phase)
      );

      // FR-25: signing_session + registering fire on the inline setup path
      expect(phases).toContain("signing_session");
      expect(phases).toContain("registering");
      expect(phases).toContain("success");

      // Register endpoint was called with Bearer token
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        "/api/transfer/register",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer mock-token",
          }),
        })
      );
    });

    it("runs inline upgrade when stored permissionsVersion < 2", async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ isEnabled: true, permissionsVersion: 1 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, hash: "0xtx" }),
        });

      const { result } = renderHook(() => useWallet());
      const phases: string[] = [];
      await result.current.wallet!.sendUsdc({ to: validAddress, amount: "5" }, (ctx) =>
        phases.push(ctx.phase)
      );

      expect(phases).toContain("signing_session");
    });

    it("treats missing permissionsVersion as v1 and runs setup", async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ isEnabled: true }), // no version field
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, hash: "0xtx" }),
        });

      const { result } = renderHook(() => useWallet());
      const phases: string[] = [];
      await result.current.wallet!.sendUsdc({ to: validAddress, amount: "5" }, (ctx) =>
        phases.push(ctx.phase)
      );
      expect(phases).toContain("signing_session");
    });

    it("sends Idempotency-Key header to /api/transfer/send", async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ isEnabled: true, permissionsVersion: 2 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, hash: "0xtx" }),
        });

      const { result } = renderHook(() => useWallet());
      await result.current.wallet!.sendUsdc({
        to: validAddress,
        amount: "5",
        idempotencyKey: "fixed-key-xyz",
      });

      expect(global.fetch).toHaveBeenLastCalledWith(
        "/api/transfer/send",
        expect.objectContaining({
          headers: expect.objectContaining({
            "Idempotency-Key": "fixed-key-xyz",
          }),
        })
      );
    });

    it("throws SendError with code from server on failure and emits error phase", async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ isEnabled: true, permissionsVersion: 2 }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({
            success: false,
            error: "Gas too high",
            code: "PAYMASTER_UNAVAILABLE",
          }),
        });

      const { result } = renderHook(() => useWallet());
      const phases: string[] = [];
      await expect(
        result.current.wallet!.sendUsdc(
          { to: validAddress, amount: "5" },
          (ctx) => phases.push(ctx.phase)
        )
      ).rejects.toMatchObject({ code: "PAYMASTER_UNAVAILABLE" });

      expect(phases).toContain("error");
    });

    it("surfaces SESSION_SETUP_FAILED when registration fails", async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ isEnabled: false }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: false, error: "bad signature" }),
        });

      const { result } = renderHook(() => useWallet());
      await expect(
        result.current.wallet!.sendUsdc({ to: validAddress, amount: "5" })
      ).rejects.toMatchObject({ code: "SESSION_SETUP_FAILED" });
    });

    it("passes `label` through to /api/transfer/send body", async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ isEnabled: true, permissionsVersion: 2 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, hash: "0xtx" }),
        });

      const { result } = renderHook(() => useWallet());
      await result.current.wallet!.sendUsdc({
        to: validAddress,
        amount: "5",
        label: "vitalik.eth",
      });

      const sendCall = (global.fetch as any).mock.calls.find(
        ([url]: [string]) => url === "/api/transfer/send"
      );
      expect(sendCall).toBeDefined();
      const body = JSON.parse(sendCall[1].body);
      expect(body.label).toBe("vitalik.eth");
    });
  });
});
