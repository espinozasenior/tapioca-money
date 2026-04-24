/**
 * ZeroDev ERC-20 paymaster integration for customer-paid USDC sends.
 *
 * See tasks/architecture-usdc-send.md §6 for the threading model.
 * The paymaster contract (on Base): see `ZERODEV_USDC_PAYMASTER_BASE`.
 */

import { decodeEventLog, erc20Abi, type Hex } from "viem";
import { base } from "viem/chains";
import { baseClient } from "@/lib/shared/rpc-client";
import { USDC_ADDRESS } from "@/lib/config";
import { PAYMASTER_ABI, ZERODEV_USDC_PAYMASTER_BASE } from "./constants";

type UsdcPaymasterClient = Awaited<ReturnType<typeof createUsdcPaymaster>>;

/**
 * Build the ZeroDev paymaster client used for ERC-20-mode sponsorship.
 * Pass the return value as `paymaster` to `createKernelAccountClient`.
 * A missing `ZERODEV_PAYMASTER_RPC` (or explicit `ZERODEV_PROJECT_ID`) throws —
 * the send path has no fallback; it must have a paymaster or it's broken.
 */
export async function createUsdcPaymaster() {
  // Accept any of: the new ZERODEV_PAYMASTER_RPC, the existing PAYMASTER_URL
  // (already configured on some envs), or derive from ZERODEV_PROJECT_ID.
  const paymasterUrl =
    process.env.ZERODEV_PAYMASTER_RPC ||
    process.env.PAYMASTER_URL ||
    (process.env.ZERODEV_PROJECT_ID
      ? `https://rpc.zerodev.app/api/v3/${process.env.ZERODEV_PROJECT_ID}/chain/8453`
      : undefined);

  if (!paymasterUrl) {
    throw new Error(
      "[UsdcPaymaster] ZERODEV_PAYMASTER_RPC or ZERODEV_PROJECT_ID required for customer-paid sends"
    );
  }

  const { createZeroDevPaymasterClient } = await import("@zerodev/sdk");
  const { http } = await import("viem");

  const paymaster = createZeroDevPaymasterClient({
    chain: base,
    transport: http(paymasterUrl),
  });

  return {
    // viem's kernel client calls getPaymasterData during prepareUserOperation.
    // We delegate to sponsorUserOperation with gasToken=USDC for ERC-20 mode.
    getPaymasterData: (userOperation: any) =>
      paymaster.sponsorUserOperation({
        userOperation,
        gasToken: USDC_ADDRESS,
      }),
    // Stub matches viem's PaymasterActions shape; we don't need a special stub
    // because sponsorUserOperation handles both the stub and final data.
    getPaymasterStubData: (userOperation: any) =>
      paymaster.sponsorUserOperation({
        userOperation,
        gasToken: USDC_ADDRESS,
      }),
  };
}

export type { UsdcPaymasterClient };

/**
 * Read the paymaster's treasury address (where USDC fees are pulled).
 * Cached in-module since the value never changes in practice.
 */
let _treasuryCache: `0x${string}` | null = null;

export async function getPaymasterTreasury(): Promise<`0x${string}`> {
  if (_treasuryCache) return _treasuryCache;
  const addr = (await baseClient.readContract({
    address: ZERODEV_USDC_PAYMASTER_BASE,
    abi: PAYMASTER_ABI,
    functionName: "treasury",
  })) as `0x${string}`;
  _treasuryCache = addr;
  return addr;
}

export interface PaymasterFeeParseArgs {
  /** Logs from `receipt.logs` returned by `waitForUserOperationReceipt`. */
  logs: ReadonlyArray<{ address: `0x${string}`; topics: readonly Hex[]; data: Hex }>;
  smartAccount: `0x${string}`;
  paymasterTreasury: `0x${string}`;
}

/**
 * Parse the actual USDC fee charged by the paymaster from the UserOp receipt.
 * Finds the ERC-20 `Transfer(smartAccount → paymasterTreasury)` log.
 * Returns `0n` if not found (caller should log and surface as "fee unknown").
 */
export function parsePaymasterFeeFromReceipt(args: PaymasterFeeParseArgs): bigint {
  const smartAccountLower = args.smartAccount.toLowerCase();
  const treasuryLower = args.paymasterTreasury.toLowerCase();
  const usdcLower = USDC_ADDRESS.toLowerCase();

  for (const log of args.logs) {
    if (log.address.toLowerCase() !== usdcLower) continue;
    try {
      const decoded = decodeEventLog({
        abi: erc20Abi,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (decoded.eventName !== "Transfer") continue;
      const { from, to, value } = decoded.args as { from: Hex; to: Hex; value: bigint };
      if (from.toLowerCase() === smartAccountLower && to.toLowerCase() === treasuryLower) {
        return value;
      }
    } catch {
      // Not a Transfer log; skip.
    }
  }

  return 0n;
}
