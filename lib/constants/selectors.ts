/**
 * Shared ERC-4626 / ERC-20 function selectors for scoped CallPolicy permissions.
 *
 * These are the 4-byte keccak256 prefixes used across registration (client-secure.ts)
 * and executor files to define which contract functions the session key may call.
 *
 * YO-specific selectors live in lib/yo/constants.ts — do NOT add them here.
 */

import type { Hex } from "viem";

// ERC-20
export const APPROVE_SELECTOR = "0x095ea7b3" as Hex; // approve(address,uint256)
export const TRANSFER_SELECTOR = "0xa9059cbb" as Hex; // transfer(address,uint256)

// ERC-4626 Vault
export const DEPOSIT_SELECTOR = "0x6e553f65" as Hex; // deposit(uint256,address)
export const REDEEM_SELECTOR = "0xba087652" as Hex; // redeem(uint256,address,address)
export const WITHDRAW_SELECTOR = "0xb460af94" as Hex; // withdraw(uint256,address,address)
