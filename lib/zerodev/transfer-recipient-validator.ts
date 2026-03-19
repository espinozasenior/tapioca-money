/**
 * Transfer Recipient Validation
 *
 * Defense-in-depth layer for USDC transfers. The on-chain CallPolicy cannot
 * constrain the `to` parameter because transfers go to user-specified recipients.
 * This module provides server-side validation to block known-bad addresses.
 *
 * DESIGN CONSTRAINT: The on-chain `transfer(address,uint256)` permission has
 * `null` for the recipient argument — any address is a valid target on-chain.
 * This is intentional: we cannot know all possible recipients at registration time.
 * Security relies on this server-side validation + rate limiting + monitoring.
 */

import { getAddress, isAddress } from "viem";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Known protocol contract addresses on Base that should never be transfer
 * recipients. Sending USDC directly to a contract (rather than through its
 * interface) typically results in permanent loss or enables drain attacks.
 *
 * This list is not exhaustive — it is a defense-in-depth measure.
 * Add addresses here as new protocols or known drainer contracts are identified.
 */
const BLOCKED_CONTRACT_ADDRESSES: ReadonlySet<string> = new Set(
  [
    // USDC token contract itself (sending USDC to the token contract = lost funds)
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    // EntryPoint v0.7 (UserOp contract, not a valid recipient)
    "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
    // Merkl Distributor (reward contract, not a valid recipient)
    "0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae",
  ].map((addr) => addr.toLowerCase())
);

export interface RecipientValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validate a transfer recipient address.
 *
 * Checks:
 * 1. Valid Ethereum address format
 * 2. Not the zero address
 * 3. Not the sender's own address (pointless self-transfer)
 * 4. Not a known protocol/token contract (funds would be lost or exploited)
 *
 * @param recipient - Target address for the transfer
 * @param senderAddress - The sender's address (to catch self-transfers)
 * @returns Validation result with reason on failure
 */
export function validateTransferRecipient(
  recipient: string,
  senderAddress: string
): RecipientValidationResult {
  // 1. Format check
  if (!recipient || !isAddress(recipient)) {
    return { valid: false, reason: "Invalid recipient address format" };
  }

  const normalizedRecipient = recipient.toLowerCase();
  const normalizedSender = senderAddress.toLowerCase();

  // 2. Zero address check
  if (normalizedRecipient === ZERO_ADDRESS.toLowerCase()) {
    return { valid: false, reason: "Cannot transfer to the zero address" };
  }

  // 3. Self-transfer check
  if (normalizedRecipient === normalizedSender) {
    return { valid: false, reason: "Cannot transfer to your own address" };
  }

  // 4. Known contract blocklist
  if (BLOCKED_CONTRACT_ADDRESSES.has(normalizedRecipient)) {
    return {
      valid: false,
      reason: "Recipient is a known contract address — direct transfers would result in lost funds",
    };
  }

  return { valid: true };
}

/**
 * Add an address to the blocked contracts set at runtime.
 * Useful for dynamically blocking newly-discovered malicious addresses.
 *
 * Note: This only affects the current process. For persistent blocklists,
 * store in database and load on startup.
 */
export function addBlockedAddress(address: string): void {
  if (!isAddress(address)) {
    throw new Error(`Invalid address: ${address}`);
  }
  // Cast away readonly for runtime additions
  (BLOCKED_CONTRACT_ADDRESSES as Set<string>).add(address.toLowerCase());
}

/**
 * Check if an address is on the blocklist.
 * Exported for testing and admin visibility.
 */
export function isAddressBlocked(address: string): boolean {
  if (!isAddress(address)) return false;
  return BLOCKED_CONTRACT_ADDRESSES.has(address.toLowerCase());
}
