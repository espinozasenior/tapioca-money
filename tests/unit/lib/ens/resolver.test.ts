import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetEnsAddress } = vi.hoisted(() => ({
  mockGetEnsAddress: vi.fn(),
}));

vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  return {
    ...actual,
    createPublicClient: () => ({ getEnsAddress: mockGetEnsAddress }),
  };
});

import { resolveRecipient, clearResolutionCache } from "@/lib/ens/resolver";

describe("resolveRecipient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearResolutionCache();
  });

  it("returns a 0x address as-is without RPC", async () => {
    const result = await resolveRecipient("0x1234567890123456789012345678901234567890");
    expect(result).toEqual({
      resolved: "0x1234567890123456789012345678901234567890",
    });
    expect(mockGetEnsAddress).not.toHaveBeenCalled();
  });

  it("checksums a lowercase 0x address on return", async () => {
    // viem's isAddress(..., { strict: true }) rejects non-checksummed input.
    // All-lowercase is accepted and we re-apply EIP-55 via getAddress.
    const result = await resolveRecipient("0xabcdef0123456789012345678901234567890abc");
    expect(result).toMatchObject({
      resolved: expect.stringMatching(/^0x[a-fA-F0-9]{40}$/),
    });
  });

  it("resolves a .eth name via ENS", async () => {
    mockGetEnsAddress.mockResolvedValueOnce(
      "0xabcdef0123456789012345678901234567890abc"
    );
    const result = await resolveRecipient("luis.eth");
    expect(result).toMatchObject({
      label: "luis.eth",
      resolved: expect.stringMatching(/^0x/),
    });
    expect(mockGetEnsAddress).toHaveBeenCalledOnce();
  });

  it("resolves a .base.eth name via the same path", async () => {
    mockGetEnsAddress.mockResolvedValueOnce(
      "0x1111111111111111111111111111111111111111"
    );
    const result = await resolveRecipient("luis.base.eth");
    expect(result).toMatchObject({
      label: "luis.base.eth",
      resolved: "0x1111111111111111111111111111111111111111",
    });
  });

  it("returns ENS_RESOLUTION_FAILED when the name is not registered", async () => {
    mockGetEnsAddress.mockResolvedValueOnce(null);
    const result = await resolveRecipient("nonsense.eth");
    expect(result).toEqual({ error: "ENS_RESOLUTION_FAILED" });
  });

  it("returns ENS_RESOLUTION_FAILED on RPC error", async () => {
    mockGetEnsAddress.mockRejectedValueOnce(new Error("network down"));
    const result = await resolveRecipient("luis.eth");
    expect(result).toEqual({ error: "ENS_RESOLUTION_FAILED" });
  });

  it("rejects invalid input (no dot, not 0x)", async () => {
    const result = await resolveRecipient("not-an-address");
    expect(result).toEqual({ error: "INVALID_INPUT" });
    expect(mockGetEnsAddress).not.toHaveBeenCalled();
  });

  it("caches repeated successful resolutions", async () => {
    mockGetEnsAddress.mockResolvedValueOnce(
      "0x2222222222222222222222222222222222222222"
    );
    await resolveRecipient("cached.eth");
    await resolveRecipient("cached.eth");
    expect(mockGetEnsAddress).toHaveBeenCalledTimes(1);
  });
});
