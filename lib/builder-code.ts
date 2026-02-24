import { Attribution } from "ox/erc8021";

export const BUILDER_CODE = "bc_yiayravf";

// Precomputed once — returns Hex string like "0x..."
export const BUILDER_CODE_SUFFIX = Attribution.toDataSuffix({
  codes: [BUILDER_CODE],
});

/** Append ERC-8021 suffix to a single calldata hex string */
export function appendBuilderSuffix(data: `0x${string}`): `0x${string}` {
  const suffix = BUILDER_CODE_SUFFIX.slice(2); // remove "0x"
  return (data + suffix) as `0x${string}`;
}

/** Map over a calls array and append the suffix to every call's data */
export function withBuilderCode<T extends { data: `0x${string}` }>(calls: T[]): T[] {
  return calls.map((call) => ({
    ...call,
    data: appendBuilderSuffix(call.data),
  }));
}
