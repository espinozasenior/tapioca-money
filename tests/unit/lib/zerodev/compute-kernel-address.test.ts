import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ZeroDev SDK
const mockCreateKernelAccount = vi.fn();
const mockSignerToEcdsaValidator = vi.fn();

vi.mock("@zerodev/sdk", () => ({
  createKernelAccount: (...args: any[]) => mockCreateKernelAccount(...args),
}));

vi.mock("@zerodev/sdk/constants", () => ({
  KERNEL_V3_3: "0.3.3",
}));

vi.mock("@zerodev/ecdsa-validator", () => ({
  signerToEcdsaValidator: (...args: any[]) => mockSignerToEcdsaValidator(...args),
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn().mockReturnValue({ mock: "publicClient" }),
  };
});

vi.mock("@/lib/config", () => ({
  CHAIN_CONFIG: { rpcUrl: "https://mock-rpc.example.com" },
}));

describe("computeKernelAddress", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSignerToEcdsaValidator.mockResolvedValue({ mock: "ecdsaValidator" });
    mockCreateKernelAccount.mockResolvedValue({
      address: "0xDeterministicKernelAddress1234567890abcdef",
    });
  });

  it("should compute a deterministic kernel address from a signer address", async () => {
    const { computeKernelAddress } = await import("@/lib/zerodev/compute-kernel-address");

    const signerAddress = "0x1234567890abcdef1234567890abcdef12345678";
    const result = await computeKernelAddress(signerAddress as `0x${string}`);

    expect(result).toBe("0xDeterministicKernelAddress1234567890abcdef");
  });

  it("should create an ECDSA validator with the signer address", async () => {
    const { computeKernelAddress } = await import("@/lib/zerodev/compute-kernel-address");

    const signerAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    await computeKernelAddress(signerAddress as `0x${string}`);

    expect(mockSignerToEcdsaValidator).toHaveBeenCalledWith(
      expect.anything(), // publicClient
      expect.objectContaining({
        signer: expect.objectContaining({ address: signerAddress }),
        entryPoint: expect.objectContaining({ version: "0.7" }),
        kernelVersion: "0.3.3",
      })
    );
  });

  it("should create kernel account with ECDSA validator as sudo", async () => {
    const { computeKernelAddress } = await import("@/lib/zerodev/compute-kernel-address");

    await computeKernelAddress("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as `0x${string}`);

    expect(mockCreateKernelAccount).toHaveBeenCalledWith(
      expect.anything(), // publicClient
      expect.objectContaining({
        plugins: { sudo: { mock: "ecdsaValidator" } },
        entryPoint: expect.objectContaining({ version: "0.7" }),
        kernelVersion: "0.3.3",
      })
    );
  });

  it("should return the same address for the same signer (deterministic)", async () => {
    const { computeKernelAddress } = await import("@/lib/zerodev/compute-kernel-address");

    const signer = "0xcccccccccccccccccccccccccccccccccccccccc" as `0x${string}`;
    const addr1 = await computeKernelAddress(signer);
    const addr2 = await computeKernelAddress(signer);

    expect(addr1).toBe(addr2);
  });
});
