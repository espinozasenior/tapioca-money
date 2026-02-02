/**
 * Mock Privy Wallet for Testing
 */

import { vi } from 'vitest';

/**
 * Create mock Privy wallet provider
 */
export function createMockPrivyWallet(address: string) {
  const mockProvider = {
    request: vi.fn().mockImplementation(async ({ method, params }: any) => {
      if (method === 'eth_signTypedData_v4') {
        return '0xMOCK_SIGNATURE_1234567890abcdef1234567890abcdef1234567890abcdef';
      }
      if (method === 'personal_sign') {
        return '0xMOCK_PERSONAL_SIGNATURE_abcdef1234567890';
      }
      if (method === 'eth_sendTransaction') {
        return '0xMOCK_TX_HASH_1234567890abcdef';
      }
      return null;
    }),
    on: vi.fn(),
    removeListener: vi.fn(),
  };

  return {
    address: address as `0x${string}`,
    getEthereumProvider: vi.fn().mockResolvedValue(mockProvider),
    signMessage: vi.fn().mockResolvedValue('0xMOCK_SIGNATURE'),
    sendTransaction: vi.fn().mockResolvedValue({ hash: '0xMOCK_TX_HASH' }),
  };
}

/**
 * Create mock embedded wallet
 */
export function createMockEmbeddedWallet(address: string) {
  return {
    ...createMockPrivyWallet(address),
    chainId: 8453, // Base mainnet
    walletClientType: 'privy' as const,
  };
}

/**
 * Mock Privy user object
 */
export function createMockPrivyUser(address: string, email?: string) {
  return {
    id: `privy_user_${address.slice(2, 10)}`,
    createdAt: new Date().toISOString(),
    linkedAccounts: [
      {
        type: 'wallet' as const,
        address: address as `0x${string}`,
        chainType: 'ethereum' as const,
        verifiedAt: new Date().toISOString(),
      },
    ],
    email: email || `test_${address.slice(2, 10)}@example.com`,
  };
}

/**
 * Mock wallet client for viem
 */
export function createMockWalletClient(address: string) {
  return {
    account: address as `0x${string}`,
    chain: { id: 8453, name: 'Base' },
    signMessage: vi.fn().mockResolvedValue('0xMOCK_SIGNATURE'),
    signTypedData: vi.fn().mockResolvedValue('0xMOCK_TYPED_DATA_SIGNATURE'),
    sendTransaction: vi.fn().mockResolvedValue('0xMOCK_TX_HASH'),
  };
}
