/**
 * Morpho API Client Tests
 * Verifies correct GraphQL queries and response parsing after API migration
 * from blue-api.morpho.org to api.morpho.org
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { MorphoClient } from '@/lib/morpho/api-client';

// Mock Redis cache to always miss (force API calls)
vi.mock('@/lib/redis/morpho-cache', () => ({
  getCachedVaults: vi.fn().mockResolvedValue(null),
  setCachedVaults: vi.fn().mockResolvedValue(undefined),
  getCachedUserPositions: vi.fn().mockResolvedValue(null),
  setCachedUserPositions: vi.fn().mockResolvedValue(undefined),
  getCachedBestVault: vi.fn().mockResolvedValue(null),
  setCachedBestVault: vi.fn().mockResolvedValue(undefined),
}));

const EXPECTED_API_URL = 'https://api.morpho.org/graphql';

function mockFetchResponse(data: any, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 400 ? 'Bad Request' : 'Error',
    json: () => Promise.resolve(data),
  });
}

function getRequestBody(fetchMock: ReturnType<typeof vi.fn>): { query: string; variables: any } {
  const call = fetchMock.mock.calls[0];
  return JSON.parse(call[1].body);
}

describe('MorphoClient', () => {
  let client: MorphoClient;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    client = new MorphoClient();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('fetchUserPositions', () => {
    test('sends userByAddress query to correct endpoint', async () => {
      global.fetch = mockFetchResponse({
        data: { userByAddress: { vaultV2Positions: [] } },
      });

      await client.fetchUserPositions('0xABC123', 8453);

      expect(global.fetch).toHaveBeenCalledWith(EXPECTED_API_URL, expect.any(Object));

      const body = getRequestBody(global.fetch as any);
      expect(body.query).toContain('userByAddress');
      expect(body.query).toContain('vaultV2Positions');
      expect(body.query).not.toContain('vaultAccountV2s');
      expect(body.variables.userAddress).toBe('0xabc123'); // lowercased
      expect(body.variables.chainId).toBe(8453);
    });

    test('parses vaultV2Positions response shape', async () => {
      global.fetch = mockFetchResponse({
        data: {
          userByAddress: {
            vaultV2Positions: [
              {
                shares: '1000000',
                assets: '1000000',
                assetsUsd: 1.0,
                vault: {
                  address: '0xvault1',
                  name: 'Test Vault',
                  symbol: 'TV',
                },
              },
              {
                shares: '0', // zero shares — should be filtered
                assets: '0',
                assetsUsd: 0,
                vault: {
                  address: '0xvault2',
                  name: 'Empty Vault',
                  symbol: 'EV',
                },
              },
            ],
          },
        },
      });

      const positions = await client.fetchUserPositions('0xuser', 8453);

      expect(positions).toHaveLength(1);
      expect(positions[0].vault.address).toBe('0xvault1');
      expect(positions[0].shares).toBe('1000000');
      expect(positions[0].assets).toBe('1000000');
      expect(positions[0].assetsUsd).toBe(1.0);
    });

    test('returns empty array when user not found', async () => {
      global.fetch = mockFetchResponse({
        data: { userByAddress: null },
      });

      const positions = await client.fetchUserPositions('0xnonexistent', 8453);

      expect(positions).toEqual([]);
    });
  });

  describe('fetchVault', () => {
    test('sends vaultV2ByAddress query to correct endpoint', async () => {
      global.fetch = mockFetchResponse({
        data: { vaultV2ByAddress: null },
      });

      await client.fetchVault('0xVAULT_ADDR', 8453);

      expect(global.fetch).toHaveBeenCalledWith(EXPECTED_API_URL, expect.any(Object));

      const body = getRequestBody(global.fetch as any);
      expect(body.query).toContain('vaultV2ByAddress');
      expect(body.query).not.toContain('vaultV2s(');
      expect(body.variables.address).toBe('0xvault_addr'); // lowercased
      expect(body.variables.chainId).toBe(8453);
    });

    test('parses direct vault object response', async () => {
      const vaultData = {
        address: '0xvault123',
        name: 'High Yield USDC',
        symbol: 'hyUSDC',
        asset: { address: '0xusdc', symbol: 'USDC', decimals: 6 },
        totalAssets: '5000000000000',
        totalAssetsUsd: 5000000,
        totalSupply: '5000000000000',
        avgNetApy: 0.08,
        netApy: 0.08,
        apy: 0.085,
      };

      global.fetch = mockFetchResponse({
        data: { vaultV2ByAddress: vaultData },
      });

      const vault = await client.fetchVault('0xvault123', 8453);

      expect(vault).not.toBeNull();
      expect(vault!.address).toBe('0xvault123');
      expect(vault!.avgNetApy).toBe(0.08);
      expect(vault!.asset.symbol).toBe('USDC');
    });

    test('returns null for unknown vault', async () => {
      global.fetch = mockFetchResponse({
        data: { vaultV2ByAddress: null },
      });

      const vault = await client.fetchVault('0xunknown', 8453);

      expect(vault).toBeNull();
    });
  });

  describe('fetchVaults', () => {
    test('uses correct endpoint and vaultV2s list query', async () => {
      global.fetch = mockFetchResponse({
        data: {
          vaultV2s: {
            items: [
              {
                address: '0xv1',
                name: 'USDC Vault',
                symbol: 'vUSDC',
                asset: { address: '0xusdc', symbol: 'USDC', decimals: 6 },
                totalAssets: '1000000000',
                totalAssetsUsd: 1000,
                totalSupply: '1000000000',
                avgNetApy: 0.05,
                netApy: 0.05,
                apy: 0.055,
              },
              {
                address: '0xv2',
                name: 'WETH Vault',
                symbol: 'vWETH',
                asset: { address: '0xweth', symbol: 'WETH', decimals: 18 },
                totalAssets: '500000000000000000000',
                totalAssetsUsd: 1500000,
                totalSupply: '500000000000000000000',
                avgNetApy: 0.03,
                netApy: 0.03,
                apy: 0.035,
              },
            ],
          },
        },
      });

      const vaults = await client.fetchVaults(8453, 'USDC');

      expect(global.fetch).toHaveBeenCalledWith(EXPECTED_API_URL, expect.any(Object));
      // Should filter to only USDC vaults
      expect(vaults).toHaveLength(1);
      expect(vaults[0].asset.symbol).toBe('USDC');
    });
  });

  describe('error handling', () => {
    test('throws on 400 Bad Request', async () => {
      global.fetch = mockFetchResponse({}, 400);

      await expect(client.fetchUserPositions('0xuser', 8453)).rejects.toThrow(
        'Morpho API error: 400 Bad Request'
      );
    });

    test('throws on GraphQL errors', async () => {
      global.fetch = mockFetchResponse({
        errors: [{ message: 'Field "vaultAccountV2s" not found' }],
      });

      await expect(client.fetchUserPositions('0xuser', 8453)).rejects.toThrow(
        'GraphQL errors'
      );
    });
  });
});
