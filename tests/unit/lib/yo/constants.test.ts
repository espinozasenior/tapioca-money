import { describe, it, expect } from "vitest";
import { keccak256, toBytes } from "viem";

describe("Merkl Constants", () => {
  it("MERKL_CLAIM_SELECTOR matches keccak256 of claim function signature", async () => {
    const { MERKL_CLAIM_SELECTOR } = await import("@/lib/yo/constants");

    // claim(address[],address[],uint256[],bytes32[][])
    const expectedSelector = keccak256(
      toBytes("claim(address[],address[],uint256[],bytes32[][])")
    ).slice(0, 10);

    expect(MERKL_CLAIM_SELECTOR).toBe(expectedSelector);
    expect(MERKL_CLAIM_SELECTOR).toBe("0x71ee95c0");
  });

  it("exports MERKL_DISTRIBUTOR_ADDRESS_BASE as correct address", async () => {
    const { MERKL_DISTRIBUTOR_ADDRESS_BASE } = await import("@/lib/yo/constants");
    expect(MERKL_DISTRIBUTOR_ADDRESS_BASE).toBe("0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae");
  });

  it("exports YO_TOKEN with correct shape", async () => {
    const { YO_TOKEN } = await import("@/lib/yo/constants");
    expect(YO_TOKEN.address).toBe("0x3C1a1c9C2D073E5bC4e7AF97f0d7caC7a82E2262");
    expect(YO_TOKEN.symbol).toBe("YO");
    expect(YO_TOKEN.decimals).toBe(18);
  });

  it("exports merklDistributorAbi with claim function", async () => {
    const { merklDistributorAbi } = await import("@/lib/yo/constants");
    const claimFn = merklDistributorAbi.find((item: any) => item.name === "claim");
    expect(claimFn).toBeDefined();
    expect(claimFn!.inputs).toHaveLength(4);
  });
});
