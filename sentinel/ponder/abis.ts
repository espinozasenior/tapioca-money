/**
 * Minimal ABIs for Ponder event indexing.
 * Only the events we need to track — not full contract ABIs.
 */

/** ERC4626 vault events (Morpho MetaMorpho vaults) */
export const morphoVaultAbi = [
  {
    type: "event",
    name: "Deposit",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "assets", type: "uint256", indexed: false },
      { name: "shares", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdraw",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "receiver", type: "address", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "assets", type: "uint256", indexed: false },
      { name: "shares", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

/** YO Protocol vault events (ERC4626-compatible) */
export const yoVaultAbi = [
  {
    type: "event",
    name: "Deposit",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "assets", type: "uint256", indexed: false },
      { name: "shares", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdraw",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "receiver", type: "address", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "assets", type: "uint256", indexed: false },
      { name: "shares", type: "uint256", indexed: false },
    ],
  },
] as const;

/** Chainlink Aggregator V3 — AnswerUpdated event for price feeds */
export const chainlinkAggregatorAbi = [
  {
    type: "event",
    name: "AnswerUpdated",
    inputs: [
      { name: "current", type: "int256", indexed: true },
      { name: "roundId", type: "uint256", indexed: true },
      { name: "updatedAt", type: "uint256", indexed: false },
    ],
  },
] as const;

/** Curve StableSwap pool — TokenExchange event for DEX depeg detection */
export const curvePoolAbi = [
  {
    type: "event",
    name: "TokenExchange",
    inputs: [
      { name: "buyer", type: "address", indexed: true },
      { name: "sold_id", type: "int128", indexed: false },
      { name: "tokens_sold", type: "uint256", indexed: false },
      { name: "bought_id", type: "int128", indexed: false },
      { name: "tokens_bought", type: "uint256", indexed: false },
    ],
  },
] as const;
