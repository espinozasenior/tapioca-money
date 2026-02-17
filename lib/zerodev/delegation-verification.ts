/**
 * Delegation Target Verification
 *
 * Verifies that the EIP-7702 delegation target matches the expected
 * Kernel V3.3 implementation address. This prevents phishing attacks
 * where a malicious delegate could be substituted.
 *
 * Used by the UI before signing EIP-7702 authorization to ensure
 * the user is delegating to the correct contract.
 */

import { KERNEL_V3_3, KernelVersionToAddressesMap } from '@zerodev/sdk/constants';

/**
 * Get the expected Kernel V3.3 implementation address.
 * This is the only valid delegation target for Tapioca.
 */
export function getExpectedDelegationTarget(): `0x${string}` {
  return KernelVersionToAddressesMap[KERNEL_V3_3].accountImplementationAddress;
}

/**
 * Verify that a delegation target matches the expected Kernel V3.3 address.
 * Call this before signing EIP-7702 authorization to prevent phishing.
 *
 * @returns true if target matches expected implementation
 */
export function verifyDelegationTarget(target: string): boolean {
  const expected = getExpectedDelegationTarget();
  return target.toLowerCase() === expected.toLowerCase();
}
