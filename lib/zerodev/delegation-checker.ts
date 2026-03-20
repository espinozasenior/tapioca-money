/**
 * Delegation Checker — Check EIP-7702 smart account delegation status.
 *
 * Extracted from client-secure.ts (Phase 2, DDD refactoring).
 */

export interface DelegationStatus {
  active: boolean;
  isDelegation: boolean;
  implementationAddress?: string;
}

/**
 * Check if address has smart account bytecode deployed
 */
export async function checkSmartAccountActive(address: `0x${string}`): Promise<DelegationStatus> {
  try {
    const { baseClient } = await import("@/lib/shared/rpc-client");

    const code = await baseClient.getBytecode({ address });

    if (!code || code === "0x") {
      return { active: false, isDelegation: false };
    }

    // EIP-7702 delegation designator: 0xef0100 + 20-byte implementation address
    // Total length: '0x' + 'ef0100' (6 chars) + address (40 chars) = 48 chars
    if (code.startsWith("0xef0100") && code.length === 48) {
      const implementationAddress = ("0x" + code.slice(8)) as `0x${string}`;
      return { active: true, isDelegation: true, implementationAddress };
    }

    // Has bytecode but not an EIP-7702 delegation (e.g. regular contract)
    return { active: true, isDelegation: false };
  } catch (error) {
    console.error("[ZeroDev Secure] Failed to check smart account status:", error);
    return { active: false, isDelegation: false };
  }
}
