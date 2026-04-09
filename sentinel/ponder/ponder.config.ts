import { createConfig } from "@ponder/core";
import { http } from "viem";
import { morphoVaultAbi, chainlinkAggregatorAbi } from "./abis";

// ---------------------------------------------------------------------------
// Vault addresses — must match sentinel/config.ts VAULT_EXPOSURE_MAP
// Verify with `eth_getCode` before adding — silent "no data" errors otherwise.
// ---------------------------------------------------------------------------

// Morpho vaults on Base (verified deployed)
const MORPHO_VAULTS_BASE = [
  "0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca", // Moonwell Flagship USDC
  "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183", // Steakhouse USDC
] as const;

// Chainlink USDC/USD price feed on Base
const CHAINLINK_USDC_USD_BASE = "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B";

// ---------------------------------------------------------------------------
// RPC configuration via eRPC (upstream: Alchemy)
// ---------------------------------------------------------------------------

const rpcBase = process.env.PONDER_RPC_URL_BASE ?? "http://localhost:4000/main/evm/8453";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export default createConfig({
  database: {
    kind: "postgres",
    connectionString: process.env.DATABASE_URL!,
    schema: "sentinel_ponder",
  },
  networks: {
    base: {
      chainId: 8453,
      transport: http(rpcBase),
    },
  },
  contracts: {
    MorphoVault: {
      abi: morphoVaultAbi,
      network: {
        base: {
          address: MORPHO_VAULTS_BASE as unknown as `0x${string}`[],
          startBlock: 25_000_000,
        },
      },
    },
    ChainlinkPriceFeed: {
      abi: chainlinkAggregatorAbi,
      network: {
        base: {
          address: [CHAINLINK_USDC_USD_BASE] as `0x${string}`[],
          startBlock: 25_000_000,
        },
      },
    },
  },
});
