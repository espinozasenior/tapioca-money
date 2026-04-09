import { createConfig } from "@ponder/core";
import { http } from "viem";
import { morphoVaultAbi, yoVaultAbi, chainlinkAggregatorAbi, curvePoolAbi } from "./abis";

// ---------------------------------------------------------------------------
// Vault addresses — sourced from sentinel/config.ts VAULT_EXPOSURE_MAP
// ---------------------------------------------------------------------------

// Morpho vaults on Base
const MORPHO_VAULTS_BASE = [
  "0x0DB2B2E3A45e6e9e30B68C4461bBe42BFA125011", // Usual Boosted USDC (Re7)
  "0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca", // Moonwell Flagship USDC
  "0xbEef047a543E45807105E51A8BBEFCc5950fcfBa", // Steakhouse USDC
] as const;

// YO Protocol vault on Base
const YO_VAULTS_BASE = [
  "0x4879712c5D1A98C0B88Fb700daFF5c65d12Fd729", // yoUSD
] as const;

// Chainlink price feeds on Base
const CHAINLINK_USDC_USD_BASE = "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B";

// Curve DEX pools on Ethereum — P0 depeg signal source
const CURVE_USR_USDC_ETH = "0x5D13179c5fa40b87D53Ff67ca26245D3D6B76E01";

// ---------------------------------------------------------------------------
// RPC configuration via eRPC
// ---------------------------------------------------------------------------

const rpcBase = process.env.PONDER_RPC_URL_BASE ?? "http://localhost:4000/main/evm/8453";

const rpcEthereum = process.env.PONDER_RPC_URL_ETH ?? "http://localhost:4000/main/evm/1";

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
    ethereum: {
      chainId: 1,
      transport: http(rpcEthereum),
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
    YoVault: {
      abi: yoVaultAbi,
      network: {
        base: {
          address: YO_VAULTS_BASE as unknown as `0x${string}`[],
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
    CurveDexPool: {
      abi: curvePoolAbi,
      network: {
        ethereum: {
          address: [CURVE_USR_USDC_ETH] as `0x${string}`[],
          startBlock: 21_000_000,
        },
      },
    },
  },
});
