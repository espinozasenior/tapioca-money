import { gql } from "graphql-tag";

export const GET_VAULTS = gql`
  query GetVaults($chainId: Int!, $first: Int!) {
    vaultV2s(
      first: $first
      where: {
        chainId_in: [$chainId]
        netApy_gte: 0.025
        totalAssetsUsd_gte: 1000000
        listed: true
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
        whitelisted
        performanceFee
        managementFee
        liquidity
        liquidityUsd
        idleAssetsUsd
        warnings {
          type
          level
        }
        curators {
          items {
            name
            addresses {
              address
            }
          }
        }
        owner {
          address
        }
      }
    }
  }
`;

export const GET_VAULT = gql`
  query GetVault($address: String!, $chainId: Int!) {
    vaultV2ByAddress(address: $address, chainId: $chainId) {
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
      whitelisted
      performanceFee
      managementFee
      liquidity
      liquidityUsd
      idleAssetsUsd
      warnings {
        type
        level
      }
      curators {
        items {
          name
          addresses {
            address
          }
        }
      }
      owner {
        address
      }
    }
  }
`;

export const GET_USER_POSITIONS = gql`
  query GetUserPositions($userAddress: String!, $chainId: Int!) {
    userByAddress(address: $userAddress, chainId: $chainId) {
      vaultV2Positions {
        shares
        assets
        assetsUsd
        pnl
        pnlUsd
        vault {
          address
          name
          symbol
        }
      }
    }
  }
`;

export const GET_USER_FIRST_DEPOSIT = gql`
  query GetUserFirstDeposit($userAddress: String!, $vaultAddress: String!, $chainId: Int!) {
    vaultV2transactions(
      where: {
        userAddress_in: [$userAddress]
        vaultAddress_in: [$vaultAddress]
        chainId_in: [$chainId]
        type_in: [Deposit]
      }
      orderBy: Time
      orderDirection: Asc
      first: 1
    ) {
      items {
        timestamp
      }
    }
  }
`;
