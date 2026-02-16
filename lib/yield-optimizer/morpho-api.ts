// Morpho GraphQL API integration for dynamic vault discovery
// https://docs.morpho.org/build/earn/tutorials/get-data

import { CHAIN_CONFIG, USDC_ADDRESS } from "./config";

const MORPHO_API_URL = "https://api.morpho.org/graphql";

export interface MorphoVault {
  address: `0x${string}`;
  name: string;
  symbol: string;
  totalAssets: string;
  totalAssetsUsd: number;
  apy: {
    netApy: number;
    avgNetApy: number;
  };
  curator?: string;
  // Risk & Safety Fields
  warnings?: Array<{ type: string; level: "YELLOW" | "RED" }>;
  whitelisted?: boolean;
  curators?: { items?: Array<{ name: string; addresses?: Array<{ address: string }> }> };
  performanceFee?: number;
  managementFee?: number;
  liquidityUsd?: number;
}

interface VaultV2Item {
  address: string;
  name: string;
  symbol: string;
  asset: {
    address: string;
    symbol: string;
  };
  totalAssets: string;
  totalAssetsUsd: number;
  netApy: number | null;
  avgNetApy: number | null;
  warnings: Array<{ type: string; level: string }>;
  whitelisted: boolean;
  curators: { items: Array<{ name: string; addresses?: Array<{ address: string }> }> };
  performanceFee: number;
  managementFee: number;
  liquidityUsd: number;
}

/**
 * Fetch USDC vaults on Base Mainnet from Morpho API (vaultV2s endpoint)
 */
export async function fetchMorphoUsdcVaults(): Promise<MorphoVault[]> {
  const query = `
    query GetVaults($chainId: Int!, $first: Int!) {
      vaultV2s(
        first: $first
        where: {
          chainId_in: [$chainId]
        }
        orderBy: NetApy
        orderDirection: Desc
      ) {
        items {
          address
          name
          symbol
          asset {
            address
            symbol
          }
          totalAssets
          totalAssetsUsd
          netApy
          avgNetApy
          warnings {
            type
            level
          }
          whitelisted
          curators {
            items {
              name
              addresses {
                address
              }
            }
          }
          performanceFee
          managementFee
          liquidityUsd
        }
      }
    }
  `;

  try {
    const response = await fetch(MORPHO_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: {
          chainId: CHAIN_CONFIG.chainId,
          first: 100,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Morpho API error response:", errorText);
      throw new Error(`Morpho API error: ${response.status}`);
    }

    const data = await response.json() as { data: { vaultV2s: { items: VaultV2Item[] } } };

    if (!data.data?.vaultV2s?.items) {
      console.warn("No vaults returned from Morpho API");
      return [];
    }

    // Filter for USDC vaults only
    const usdcVaults = data.data.vaultV2s.items.filter((vault) =>
      vault.asset?.address?.toLowerCase() === USDC_ADDRESS.toLowerCase()
    );

    return usdcVaults.map((vault) => ({
      address: vault.address as `0x${string}`,
      name: vault.name,
      symbol: vault.symbol,
      totalAssets: vault.totalAssets,
      totalAssetsUsd: vault.totalAssetsUsd,
      apy: {
        netApy: vault.netApy ?? vault.avgNetApy ?? 0,
        avgNetApy: vault.avgNetApy ?? 0,
      },
      curator: vault.curators?.items?.[0]?.name,
      // Risk & Safety fields
      warnings: vault.warnings as MorphoVault["warnings"],
      whitelisted: vault.whitelisted,
      curators: vault.curators,
      performanceFee: vault.performanceFee,
      managementFee: vault.managementFee,
      liquidityUsd: vault.liquidityUsd,
    }));
  } catch (error) {
    console.error("Failed to fetch Morpho vaults:", error);
    return [];
  }
}

/**
 * Get the best USDC vault by APY
 */
export async function getBestUsdcVault(): Promise<MorphoVault | null> {
  const vaults = await fetchMorphoUsdcVaults();

  if (vaults.length === 0) {
    return null;
  }

  // Sort by net APY descending and return the best one
  return vaults.sort((a, b) => b.apy.netApy - a.apy.netApy)[0];
}

/**
 * Get vault by address
 */
export async function getVaultByAddress(
  address: `0x${string}`
): Promise<MorphoVault | null> {
  const vaults = await fetchMorphoUsdcVaults();
  return vaults.find((v) => v.address.toLowerCase() === address.toLowerCase()) || null;
}
