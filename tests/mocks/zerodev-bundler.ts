/**
 * Mock ZeroDev Bundler for Testing
 */

import { vi } from 'vitest';

interface BundlerCall {
  calls: Array<{
    to: string;
    value: bigint;
    data: string;
  }>;
  timestamp: number;
}

// Track bundler calls for assertions
const bundlerCalls: BundlerCall[] = [];

/**
 * Mock bundler response for sendUserOperation
 */
export const mockBundlerResponse = {
  sendUserOperation: vi.fn().mockImplementation(async (params: any) => {
    // Record the call
    bundlerCalls.push({
      calls: params.calls,
      timestamp: Date.now(),
    });

    // Return mock UserOp hash
    const userOpHash = `0xUserOp${Math.random().toString(16).slice(2)}`;
    return userOpHash;
  }),

  waitForUserOperationReceipt: vi.fn().mockImplementation(async (params: any) => {
    // Return mock receipt
    const txHash = `0xTx${Math.random().toString(16).slice(2)}`;
    return {
      success: true,
      receipt: {
        transactionHash: txHash,
        blockNumber: BigInt(12345678),
        gasUsed: BigInt(150000),
      },
      userOpHash: params.hash,
    };
  }),
};

/**
 * Get number of bundler calls made
 */
export function getBundlerCallCount(): number {
  return bundlerCalls.length;
}

/**
 * Get the last bundler call
 */
export function getLastBundlerCall(): BundlerCall | undefined {
  return bundlerCalls[bundlerCalls.length - 1];
}

/**
 * Get all bundler calls
 */
export function getAllBundlerCalls(): BundlerCall[] {
  return [...bundlerCalls];
}

/**
 * Reset bundler mocks and call history
 */
export function resetBundlerMocks(): void {
  bundlerCalls.length = 0;
  mockBundlerResponse.sendUserOperation.mockClear();
  mockBundlerResponse.waitForUserOperationReceipt.mockClear();
}

/**
 * Mock bundler client creation
 */
export function createMockBundlerClient(account: any) {
  return {
    account,
    sendUserOperation: mockBundlerResponse.sendUserOperation,
    waitForUserOperationReceipt: mockBundlerResponse.waitForUserOperationReceipt,
  };
}

/**
 * Verify bundler was called with specific parameters
 */
export function verifyBundlerCalledWith(expectedCalls: Partial<BundlerCall>): boolean {
  const lastCall = getLastBundlerCall();
  if (!lastCall) return false;

  if (expectedCalls.calls) {
    if (lastCall.calls.length !== expectedCalls.calls.length) return false;

    for (let i = 0; i < expectedCalls.calls.length; i++) {
      const expected = expectedCalls.calls[i];
      const actual = lastCall.calls[i];

      if (expected.to && actual.to !== expected.to) return false;
      if (expected.data && actual.data !== expected.data) return false;
    }
  }

  return true;
}
