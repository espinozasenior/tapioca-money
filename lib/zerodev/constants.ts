/**
 * Shared ZeroDev constants — single source of truth.
 */

import { getAddress } from "viem";

/** EntryPoint V0.7 object (required format for ZeroDev SDK v5) */
export const ENTRYPOINT_V07 = {
  address: "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as `0x${string}`,
  version: "0.7" as const,
};

export const ZERODEV_USDC_PAYMASTER_BASE = getAddress(
  "0x7EE87982c03463DbAfe27A50b3D8e4FfAf1435F7"
);

export const PAYMASTER_ABI = [
  {
    inputs: [],
    name: "treasury",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
