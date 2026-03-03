/**
 * POST /api/agent/undelegate
 * Server-side EIP-7702 undelegation via relayer wallet.
 *
 * Privy embedded wallets can sign EIP-7702 authorizations but can't send
 * Type 4 transactions (their RPC returns 500). In EIP-7702, any account can
 * submit the transaction containing someone else's signed authorization.
 *
 * Flow:
 * 1. Client signs address(0) auth via Privy's useSign7702Authorization
 * 2. Client sends the signed auth here
 * 3. Server uses a relayer wallet to send a Type 4 tx with the user's auth
 * 4. Gas is paid by the relayer (~$0.01 on Base L2)
 * 5. DB authorization is cleared so user can re-register
 */

import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth/middleware";
import { CHAIN_CONFIG } from "@/lib/config";

const sql = neon(process.env.DATABASE_URL!);

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate
    const authResult = await authenticateRequest(request);
    if (!authResult.authenticated) {
      return unauthorizedResponse(authResult.error);
    }
    const userWalletAddress = authResult.walletAddress;
    if (!userWalletAddress) {
      return unauthorizedResponse("No wallet linked to account");
    }

    // 2. Validate relayer is configured
    const relayerKey = process.env.RELAYER_PRIVATE_KEY;
    if (!relayerKey) {
      return NextResponse.json(
        { error: "Relayer not configured. Contact support." },
        { status: 503 }
      );
    }

    // 3. Parse the signed EIP-7702 authorization from the client
    const body = await request.json();
    const { signedAuthorization: rawAuth } = body;
    if (!rawAuth) {
      return NextResponse.json(
        { error: "Missing signedAuthorization" },
        { status: 400 }
      );
    }

    // Restore numeric fields that were hex-serialized on the client
    const signedAuthorization = {
      ...rawAuth,
      chainId: typeof rawAuth.chainId === "string"
        ? Number(rawAuth.chainId)
        : rawAuth.chainId,
      nonce: typeof rawAuth.nonce === "string"
        ? Number(rawAuth.nonce)
        : rawAuth.nonce,
      yParity: typeof rawAuth.yParity === "string"
        ? Number(rawAuth.yParity)
        : rawAuth.yParity,
    };

    console.log("[Undelegate] Processing undelegation for:", userWalletAddress);

    // 4. Verify user has an active registration
    const users = await sql`
      SELECT authorization_7702
      FROM users
      WHERE wallet_address = ${userWalletAddress}
    `;

    if (users.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 5. Create relayer wallet client
    const relayerAccount = privateKeyToAccount(relayerKey as `0x${string}`);
    const walletClient = createWalletClient({
      account: relayerAccount,
      chain: base,
      transport: http(CHAIN_CONFIG.rpcUrl),
    });

    console.log("[Undelegate] Relayer:", relayerAccount.address);

    // 6. Send Type 4 transaction with user's signed authorization.
    //    The relayer pays gas; the auth targets the user's EOA.
    const txHash = await walletClient.sendTransaction({
      to: userWalletAddress as `0x${string}`,
      data: "0x" as `0x${string}`,
      value: BigInt(0),
      authorizationList: [signedAuthorization],
    });

    console.log("[Undelegate] Tx submitted:", txHash);

    // 7. Wait for confirmation
    const publicClient = createPublicClient({
      chain: base,
      transport: http(CHAIN_CONFIG.rpcUrl),
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log("[Undelegate] Confirmed in block:", receipt.blockNumber);

    // 8. Reset all agent state so UI shows clean unregistered state
    await sql`
      UPDATE users
      SET authorization_7702 = NULL,
          agent_registered = false,
          auto_optimize_enabled = false,
          updated_at = NOW()
      WHERE wallet_address = ${userWalletAddress}
    `;

    console.log("[Undelegate] DB authorization cleared for:", userWalletAddress);

    return NextResponse.json({
      success: true,
      txHash,
      blockNumber: Number(receipt.blockNumber),
    });
  } catch (error: any) {
    console.error("[Undelegate] Failed:", error);
    return NextResponse.json(
      { error: error.message || "Undelegation failed" },
      { status: 500 }
    );
  }
}
