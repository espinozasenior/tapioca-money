/**
 * Morpho Blue API Client
 * Official GraphQL API: https://blue-api.morpho.org/graphql
 * Documentation: https://docs.morpho.org/tools/offchain/api/
 *
 * Rate Limits: 5000 requests per 5 minutes
 */

const MORPHO_API_URL = 'https://blue-api.morpho.org/graphql';

export interface MorphoVault {
  address: `0x${string}`;
  name: string;
  symbol: string;
  asset: {
    address: `0x${string}`;
    symbol: string;
    decimals: number;
  };
  totalAssets: string; // BigInt string
  totalAssetsUsd: number;
  totalSupply: string;
  avgNetApy: number; // Average net APY (e.g., 0.05 = 5%)
  netApy: number | null;
  apy: number | null;
}

export interface MorphoUserPosition {
  vault: {
    address: `0x${string}`;
    name: string;
    symbol: string;
  };
  shares: string; // BigInt string
  assets: string; // BigInt string
  assetsUsd: number;
}

/**
 * Morpho GraphQL API Client
 */
export class MorphoClient {
  private apiUrl: string;

  constructor(apiUrl: string = MORPHO_API_URL) {
    this.apiUrl = apiUrl;
  }

  /**
   * Execute GraphQL query against Morpho API
   */
  private async query<T>(query: string, variables?: Record<string, any>): Promise<T> {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`Morpho API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    if (result.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data;
  }

  /**
   * Fetch all vaults for a specific chain and asset
   *
   * @param chainId - Chain ID (e.g., 8453 for Base)
   * @param assetSymbol - Asset symbol (e.g., "USDC", "WETH")
   * @param first - Number of vaults to fetch (default: 50)
   * @returns Array of Morpho vaults sorted by APY descending
   */
  async fetchVaults(
    chainId: number,
    assetSymbol: string,
    first: number = 50
  ): Promise<MorphoVault[]> {
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
              decimals
            }
            totalAssets
            totalAssetsUsd
            totalSupply
            avgNetApy
            netApy
            apy
          }
        }
      }
    `;

    const data = await this.query<{ vaultV2s: { items: MorphoVault[] } }>(query, {
      chainId,
      first,
    });

    // Filter by asset symbol client-side (API doesn't support asset filtering)
    return data.vaultV2s.items.filter(
      (vault) => vault.asset.symbol.toUpperCase() === assetSymbol.toUpperCase()
    );
  }

  /**
   * Fetch a single vault by address
   *
   * @param vaultAddress - Vault contract address
   * @param chainId - Chain ID
   * @returns Vault details or null if not found
   */
  async fetchVault(
    vaultAddress: string,
    chainId: number
  ): Promise<MorphoVault | null> {
    const query = `
      query GetVault($address: String!, $chainId: Int!) {
        vaultV2s(
          where: {
            address_in: [$address]
            chainId_in: [$chainId]
          }
        ) {
          items {
            address
            name
            symbol
            asset {
              address
              symbol
              decimals
            }
            totalAssets
            totalAssetsUsd
            totalSupply
            avgNetApy
            netApy
            apy
          }
        }
      }
    `;

    const data = await this.query<{ vaultV2s: { items: MorphoVault[] } }>(query, {
      address: vaultAddress.toLowerCase(),
      chainId,
    });

    return data.vaultV2s.items[0] || null;
  }

  /**
   * Fetch user's positions across all vaults
   *
   * @param userAddress - User wallet address
   * @param chainId - Chain ID
   * @returns Array of user positions
   */
  async fetchUserPositions(
    userAddress: string,
    chainId: number
  ): Promise<MorphoUserPosition[]> {
    const query = `
      query GetUserPositions($userAddress: String!, $chainId: Int!) {
        vaultAccountV2s(
          where: {
            address_in: [$userAddress]
            vault_: { chainId_in: [$chainId] }
          }
        ) {
          items {
            vault {
              address
              name
              symbol
            }
            shares
            assets
            assetsUsd
          }
        }
      }
    `;

    const data = await this.query<{ vaultAccountV2s: { items: MorphoUserPosition[] } }>(query, {
      userAddress: userAddress.toLowerCase(),
      chainId,
    });

    return data.vaultAccountV2s.items.filter(
      (pos) => BigInt(pos.shares) > 0n // Only return positions with shares
    );
  }

  /**
   * Fetch user's position in a specific vault
   *
   * @param userAddress - User wallet address
   * @param vaultAddress - Vault contract address
   * @param chainId - Chain ID
   * @returns User position or null if none
   */
  async fetchUserPosition(
    userAddress: string,
    vaultAddress: string,
    chainId: number
  ): Promise<MorphoUserPosition | null> {
    const positions = await this.fetchUserPositions(userAddress, chainId);
    return (
      positions.find(
        (pos) => pos.vault.address.toLowerCase() === vaultAddress.toLowerCase()
      ) || null
    );
  }

  /**
   * Find best vault for an asset by APY
   *
   * @param chainId - Chain ID
   * @param assetSymbol - Asset symbol
   * @param minLiquidityUsd - Minimum liquidity in USD (default: 100k)
   * @returns Best vault or null if none found
   */
  async findBestVault(
    chainId: number,
    assetSymbol: string,
    minLiquidityUsd: number = 100_000
  ): Promise<MorphoVault | null> {
    const vaults = await this.fetchVaults(chainId, assetSymbol, 50);

    // Filter by minimum liquidity
    const eligibleVaults = vaults.filter(
      (vault) => vault.totalAssetsUsd >= minLiquidityUsd
    );

    // Return highest APY vault
    return eligibleVaults.length > 0 ? eligibleVaults[0] : null;
  }
}

/**
 * Singleton instance for convenience
 */
export const morphoClient = new MorphoClient();
