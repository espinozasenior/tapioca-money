import { describe, it, expect } from "vitest";
import { encodeEventTopics, encodeAbiParameters, getAddress, parseAbi } from "viem";
import { parsePaymasterFeeFromReceipt } from "@/lib/zerodev/paymaster-client";
import { USDC_ADDRESS } from "@/lib/config";

const transferAbi = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

function fakeUsdcTransferLog(from: `0x${string}`, to: `0x${string}`, value: bigint) {
  const topics = encodeEventTopics({
    abi: transferAbi,
    eventName: "Transfer",
    args: { from, to },
  });
  const data = encodeAbiParameters([{ type: "uint256" }], [value]);
  return {
    address: USDC_ADDRESS,
    topics,
    data,
  };
}

const SMART_ACCOUNT = getAddress("0xaaaa000000000000000000000000000000000001");
const TREASURY = getAddress("0xbbbb000000000000000000000000000000000002");
const OTHER = getAddress("0xcccc000000000000000000000000000000000003");

describe("parsePaymasterFeeFromReceipt", () => {
  it("returns the value of a matching smartAccount → treasury transfer", () => {
    const logs = [fakeUsdcTransferLog(SMART_ACCOUNT, TREASURY, 30_000n)];
    const fee = parsePaymasterFeeFromReceipt({
      logs,
      smartAccount: SMART_ACCOUNT,
      paymasterTreasury: TREASURY,
    });
    expect(fee).toBe(30_000n);
  });

  it("ignores transfers that are not to the treasury", () => {
    const logs = [
      fakeUsdcTransferLog(SMART_ACCOUNT, OTHER, 100_000n), // the user's own send
    ];
    const fee = parsePaymasterFeeFromReceipt({
      logs,
      smartAccount: SMART_ACCOUNT,
      paymasterTreasury: TREASURY,
    });
    expect(fee).toBe(0n);
  });

  it("returns 0n when no matching log is found", () => {
    const fee = parsePaymasterFeeFromReceipt({
      logs: [],
      smartAccount: SMART_ACCOUNT,
      paymasterTreasury: TREASURY,
    });
    expect(fee).toBe(0n);
  });

  it("matches case-insensitively on addresses", () => {
    const logs = [fakeUsdcTransferLog(SMART_ACCOUNT, TREASURY, 7_500n)];
    // Inject different-case variants on both sides to verify normalisation.
    const fee = parsePaymasterFeeFromReceipt({
      logs,
      smartAccount: SMART_ACCOUNT.toLowerCase() as `0x${string}`,
      paymasterTreasury: TREASURY.toLowerCase() as `0x${string}`,
    });
    expect(fee).toBe(7_500n);
  });

  it("picks the paymaster log out of a multi-log receipt", () => {
    const logs = [
      fakeUsdcTransferLog(SMART_ACCOUNT, OTHER, 5_000_000n), // user send
      fakeUsdcTransferLog(SMART_ACCOUNT, TREASURY, 20_000n), // fee
    ];
    const fee = parsePaymasterFeeFromReceipt({
      logs,
      smartAccount: SMART_ACCOUNT,
      paymasterTreasury: TREASURY,
    });
    expect(fee).toBe(20_000n);
  });
});
