// Morpho GraphQL API integration for dynamic vault discovery
// https://docs.morpho.org/build/earn/tutorials/get-data

import { CHAIN_CONFIG, USDC_ADDRESS } from "./config";

const MORPHO_API_URL = "https://blue-api.morpho.org/graphql";

export interface MorphoVault {
  address: `0x${string}`;
  name: string;
  symbol: string;
  totalAssets: string;
  totalAssetsUsd: number;
  apy: {
    netApy: number;
    monthlyApy: number;
  };
  curator?: string;
}

export interface MorphoVaultsResponse {
  vaults: {
    items: Array<{
      address: string;
      name: string;
      symbol: string;
      asset?: {
        address: string;
      };
      state: {
        totalAssets: string;
        totalAssetsUsd: number;
        netApy: number;
        monthlyApy: number;
      };
      metadata?: {
        curators?: Array<{ name: string }>;
      };
    }>;
  };
}

/**
 * Fetch USDC vaults on Base Mainnet from Morpho API
 */
export async function fetchMorphoUsdcVaults(): Promise<MorphoVault[]> {
  const query = `
    query GetUsdcVaults($chainId: Int!) {
      vaults(
        where: { 
          chainId_in: [$chainId],
          whitelisted: true
        }
        first: 100
      ) {
        items {
          address
          name
          symbol
          asset {
            address
          }
          state {
            totalAssets
            totalAssetsUsd
            netApy
            monthlyApy
          }
          metadata {
            curators {
              name
            }
          }
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
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Morpho API error response:", errorText);
      throw new Error(`Morpho API error: ${response.status}`);
    }

    const data = await response.json() as { data: MorphoVaultsResponse };
    
    if (!data.data?.vaults?.items) {
      console.warn("No vaults returned from Morpho API");
      return [];
    }

    // Filter for USDC vaults only
    const usdcVaults = data.data.vaults.items.filter((vault) => 
      vault.asset?.address?.toLowerCase() === USDC_ADDRESS.toLowerCase()
    );

    return usdcVaults.map((vault) => ({
      address: vault.address as `0x${string}`,
      name: vault.name,
      symbol: vault.symbol,
      totalAssets: vault.state.totalAssets,
      totalAssetsUsd: vault.state.totalAssetsUsd,
      apy: {
        netApy: vault.state.netApy,
        monthlyApy: vault.state.monthlyApy,
      },
      curator: vault.metadata?.curators?.[0]?.name,
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
