/**
 * POST /api/yo/rewards/claim
 * Execute gasless Merkl reward claim via session key.
 *
 * Requires:
 * - Privy JWT authentication
 * - User must have registered agent with Merkl Distributor permissions
 */

import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth/middleware";
import {
  buildWalletAddresses,
  resolveAndDecryptRegistration,
  verifyVaultApproval,
} from "@/lib/agent/resolve-registration";
import { executeYoRewardsClaim } from "@/lib/zerodev/yo-rewards-executor";
import { fetchClaimableRewards } from "@/lib/yo/rewards-client";
import { invalidateYoRewards } from "@/lib/redis/yo-cache";
import { incrementUserOpCount } from "@/lib/redis/rate-limiter";
import { MERKL_DISTRIBUTOR_ADDRESS_BASE } from "@/lib/yo/constants";
import { CHAIN_CONFIG } from "@/lib/config";

const sql = neon(process.env.DATABASE_URL!);

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate request
    const authResult = await authenticateRequest(request);
    if (!authResult.authenticated) {
      return unauthorizedResponse(authResult.error);
    }

    const userWalletAddress = authResult.walletAddress;
    if (!userWalletAddress) {
      return unauthorizedResponse("No wallet address in auth result");
    }
    const addresses = buildWalletAddresses(authResult);
    if (!addresses) {
      return unauthorizedResponse("No wallet linked to account");
    }

    // 2. Parse request body
    const body = await request.json();
    const { address } = body;

    if (!address) {
      return NextResponse.json({ error: "Missing address" }, { status: 400 });
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json({ error: "Invalid address format" }, { status: 400 });
    }

    console.log("[YO Rewards Claim] Processing claim request", {
      wallet: userWalletAddress,
      address,
    });

    // 3. Resolve agent registration + decrypt authorization
    const resolved = await resolveAndDecryptRegistration(sql, addresses);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.message }, { status: resolved.statusCode });
    }
    const { decryptedAuth, accountAddress, authorizationData } = resolved;

    // 4. Verify Merkl Distributor is approved
    const approvedVaults = authorizationData.approvedVaults || [];
    const approval = verifyVaultApproval(approvedVaults, MERKL_DISTRIBUTOR_ADDRESS_BASE, "merkl");
    if (!approval.approved) {
      return NextResponse.json({ error: approval.message }, { status: 403 });
    }

    // 5. Validate serializedAccount
    if (!decryptedAuth.serializedAccount) {
      return NextResponse.json(
        { error: "Session key data incomplete. Please re-register agent." },
        { status: 400 }
      );
    }

    // 6. Fetch claimable rewards
    const rewards = await fetchClaimableRewards(accountAddress, true);
    if (!rewards || !rewards.hasClaimable) {
      return NextResponse.json({ error: "No claimable rewards found" }, { status: 400 });
    }

    // 7. Execute claim
    const result = await executeYoRewardsClaim({
      smartAccountAddress: accountAddress,
      serializedAccount: decryptedAuth.serializedAccount,
      userAddress: accountAddress,
      chainRewards: rewards.rawChainRewards,
    });

    if (!result.success) {
      console.error("[YO Rewards Claim] Execution failed:", result.error);
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // 8. Invalidate cache + increment count + log to agent_actions
    await invalidateYoRewards(accountAddress, CHAIN_CONFIG.chainId);
    await incrementUserOpCount(userWalletAddress);

    // Log successful claim to agent_actions for audit trail
    try {
      const userRows = await sql`SELECT id FROM users WHERE wallet_address = ${userWalletAddress.toLowerCase()} LIMIT 1`;
      if (userRows.length > 0) {
        await sql`
          INSERT INTO agent_actions (user_id, action_type, status, from_protocol, to_protocol, amount_usdc, tx_hash, metadata)
          VALUES (${userRows[0].id}, 'merkl_claim', 'success', 'merkl', 'yo', ${rewards.totalClaimableFormatted}, ${result.txHash || null}, ${JSON.stringify({ claimableAmount: rewards.totalClaimableFormatted, userAddress: accountAddress, manual: true })}::jsonb)
        `;
      }
    } catch (logError: any) {
      console.warn("[YO Rewards Claim] Failed to log to agent_actions:", logError.message);
    }

    console.log("[YO Rewards Claim] Success:", result.txHash);

    return NextResponse.json({
      success: true,
      txHash: result.txHash,
      userOpHash: result.userOpHash,
    });
  } catch (error: any) {
    console.error("[YO Rewards Claim] Error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
