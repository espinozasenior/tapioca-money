/**
 * Permission Builder — Session key generation and CallPolicy construction.
 *
 * Extracted from client-secure.ts (Phase 2, DDD refactoring).
 * Builds scoped permissions for ZeroDev session keys with vault/USDC/YO/Merkl policies.
 */

import { parseAbi } from "viem";
import { USDC_ADDRESS } from "@/lib/config";
import { baseClient } from "@/lib/shared/rpc-client";
import { ENTRYPOINT_V07 } from "@/lib/zerodev/constants";
import { REDEEM_SELECTOR, WITHDRAW_SELECTOR } from "@/lib/constants/selectors";

// Session key expiry: 7 days
const SESSION_KEY_EXPIRY_DAYS = 7;

// Maximum USDC amount per session key call (10,000.000001 USDC with 6 decimals)
// The +1 forces a new permissionHash to break the re-registration deadlock
// where the old validator blocks new installations with the same hash.
const MAX_USDC_PER_CALL = BigInt(10_000) * BigInt(1e6) + 1n;

/**
 * Shared session key + permission builder.
 *
 * Extracts the duplicated session key generation, permission construction,
 * and policy creation from the three createAndSerialize* variants.
 *
 * @returns Session key material and the ready-to-use permission validator
 */
export async function buildSessionKeyAndPermissions(approvedVaults: `0x${string}`[]) {
  // Dynamic imports to minimize client bundle (tree-shaken)
  const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
  const { KERNEL_V3_3 } = await import("@zerodev/sdk/constants");
  const { toPermissionValidator } = await import("@zerodev/permissions");
  const {
    toCallPolicy,
    CallPolicyVersion,
    toGasPolicy,
    toRateLimitPolicy,
    toTimestampPolicy,
    ParamCondition,
  } = await import("@zerodev/permissions/policies");
  const { toECDSASigner } = await import("@zerodev/permissions/signers");

  // 1. Generate session key pair (client-side)
  const sessionPrivateKey = generatePrivateKey();
  const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);
  if (process.env.NODE_ENV === "development") {
    console.log("[ZeroDev] Session key address:", sessionKeyAccount.address);
  }

  // 2. Public client (shared singleton)
  const publicClient = baseClient;

  // 3. Create session key signer
  const sessionSigner = await toECDSASigner({ signer: sessionKeyAccount });

  // Calculate expiry timestamp (reused for both on-chain policy and return value)
  const expiryTimestamp = Math.floor(Date.now() / 1000) + SESSION_KEY_EXPIRY_DAYS * 24 * 60 * 60;

  // 4. Build scoped permissions with value limits and amount caps
  const permissions: any[] = [];

  // USDC approve — cap amount parameter
  permissions.push({
    target: USDC_ADDRESS,
    abi: parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]),
    functionName: "approve",
    args: [null, { condition: ParamCondition.LESS_THAN_OR_EQUAL, value: MAX_USDC_PER_CALL }],
    valueLimit: 0n,
  });

  // USDC transfer — cap amount parameter
  // SECURITY NOTE (H-3): The `to` argument is `null` (unconstrained) because
  // transfers can go to arbitrary user-specified recipients. We cannot know all
  // valid recipients at registration time. Defense-in-depth is enforced server-side:
  //   1. Recipient validation (zero addr, self-transfer, known contract blocklist)
  //      → lib/zerodev/transfer-recipient-validator.ts
  //   2. Hourly rate limit (3 transfers/hour) + daily rate limit (20/day)
  //      → app/api/transfer/send/route.ts
  //   3. All transfer attempts logged to agent_actions table for monitoring
  // See also: the amount is still capped on-chain at MAX_USDC_PER_CALL ($10k).
  permissions.push({
    target: USDC_ADDRESS,
    abi: parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]),
    functionName: "transfer",
    args: [null, { condition: ParamCondition.LESS_THAN_OR_EQUAL, value: MAX_USDC_PER_CALL }],
    valueLimit: 0n,
  });

  // Import YO Gateway address early — needed to constrain vault approve spender
  const {
    YO_GATEWAY_ADDRESS,
    YO_GATEWAY_DEPOSIT_SELECTOR,
    YO_GATEWAY_REDEEM_SELECTOR,
    MERKL_DISTRIBUTOR_ADDRESS_BASE,
    MERKL_CLAIM_SELECTOR,
  } = await import("@/lib/yo/constants");

  // Vault operations — cap deposit amounts, allow redeem/withdraw (funds return to user)
  for (const vault of approvedVaults) {
    permissions.push({
      target: vault,
      abi: parseAbi(["function deposit(uint256 assets, address receiver) returns (uint256)"]),
      functionName: "deposit",
      args: [{ condition: ParamCondition.LESS_THAN_OR_EQUAL, value: MAX_USDC_PER_CALL }, null],
      valueLimit: 0n,
    });
    // Approve vault share token (needed for YO Gateway redeem flow: approve shares → gateway.redeem)
    // SECURITY: Constrain spender to YO_GATEWAY_ADDRESS to prevent arbitrary approvals
    permissions.push({
      target: vault,
      abi: parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]),
      functionName: "approve",
      args: [{ condition: ParamCondition.EQUAL, value: YO_GATEWAY_ADDRESS as `0x${string}` }, null],
      valueLimit: 0n,
    });
    // Redeem/withdraw move funds back to user — no amount cap needed
    permissions.push({ target: vault, selector: REDEEM_SELECTOR, valueLimit: 0n });
    permissions.push({ target: vault, selector: WITHDRAW_SELECTOR, valueLimit: 0n });
  }

  // YO Gateway permissions — deposit and redeem via Gateway
  permissions.push({
    target: YO_GATEWAY_ADDRESS as `0x${string}`,
    selector: YO_GATEWAY_DEPOSIT_SELECTOR,
    valueLimit: 0n,
  });
  permissions.push({
    target: YO_GATEWAY_ADDRESS as `0x${string}`,
    selector: YO_GATEWAY_REDEEM_SELECTOR,
    valueLimit: 0n,
  });

  // Merkl Distributor — claim YO rewards
  permissions.push({
    target: MERKL_DISTRIBUTOR_ADDRESS_BASE as `0x${string}`,
    selector: MERKL_CLAIM_SELECTOR,
    valueLimit: 0n,
  });

  const callPolicy = toCallPolicy({
    policyVersion: CallPolicyVersion.V0_0_5,
    permissions,
  });

  const gasPolicy = toGasPolicy({
    allowed: BigInt(500_000) * BigInt(100_000_000), // 500k gas * 0.1 gwei
  });

  const rateLimitPolicy = toRateLimitPolicy({
    count: 90,
    interval: 86400, // 24 hours
  });

  // On-chain session key expiry — enforced by the validator, not just server-side
  const timestampPolicy = toTimestampPolicy({
    validAfter: Math.floor(Date.now() / 1000),
    validUntil: expiryTimestamp,
  });

  // 5. Create permission validator
  const permissionValidator = await toPermissionValidator(publicClient, {
    signer: sessionSigner,
    entryPoint: ENTRYPOINT_V07,
    policies: [callPolicy, gasPolicy, rateLimitPolicy, timestampPolicy],
    kernelVersion: KERNEL_V3_3,
  });

  return {
    sessionPrivateKey,
    sessionKeyAccount,
    permissionValidator,
    expiryTimestamp,
    publicClient,
  };
}
