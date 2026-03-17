/**
 * Shared agent registration resolution logic.
 *
 * Extracts the duplicated "fetch user from DB, validate auth type, check expiry"
 * pattern from vault/deposit, vault/redeem, agent/undelegate, and agent/register PATCH.
 */

import {
  decryptAuthorization,
  SessionKey7702Authorization,
  SessionKeyErc4337Authorization,
} from "@/lib/security/session-encryption";
import { YO_GATEWAY_ADDRESS } from "@/lib/yo/constants";
import { AgentSession } from "@/lib/agent/agent-session";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AuthorizationData = SessionKey7702Authorization | SessionKeyErc4337Authorization;

/** Typed contract for the neon SQL tagged-template client. */
export type SqlClient = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<Record<string, unknown>[]>;

export type ResolveSuccess = {
  ok: true;
  registeredAddress: string;
  authorizationData: AuthorizationData;
};

export type ResolveError = {
  ok: false;
  error: "not_registered" | "invalid_auth_type" | "session_expired";
  message: string;
  statusCode: number;
};

export type ResolveResult = ResolveSuccess | ResolveError;

export type ResolveAndDecryptSuccess = ResolveSuccess & {
  decryptedAuth: AuthorizationData;
  accountAddress: `0x${string}`;
};

export type ResolveAndDecryptError = ResolveError;

export type ResolveAndDecryptResult = ResolveAndDecryptSuccess | ResolveAndDecryptError;

export type VaultApprovalResult = { approved: true } | { approved: false; message: string };

// ---------------------------------------------------------------------------
// buildWalletAddresses
// ---------------------------------------------------------------------------

/**
 * Build the array of wallet addresses to check against the DB.
 * Prefers `allWalletAddresses` (from Privy linked accounts); falls back
 * to a single `walletAddress` lowercased.
 *
 * Returns `null` when no addresses are available at all.
 */
export function buildWalletAddresses(authResult: {
  walletAddress?: string;
  allWalletAddresses?: string[];
}): string[] | null {
  const { walletAddress, allWalletAddresses } = authResult;

  if (allWalletAddresses && allWalletAddresses.length > 0) {
    return allWalletAddresses.map((a) => a.toLowerCase());
  }

  if (walletAddress) {
    return [walletAddress.toLowerCase()];
  }

  return null;
}

// ---------------------------------------------------------------------------
// verifyVaultApproval
// ---------------------------------------------------------------------------

/**
 * Check whether a vault (or YO Gateway) is approved in the user's session key.
 *
 * - For `protocol === "yo"`: verifies the YO Gateway address is in approvedVaults.
 * - For other protocols: verifies the vault address itself is in approvedVaults.
 * - If approvedVaults is empty, approval is granted (open policy).
 */
export function verifyVaultApproval(
  approvedVaults: string[],
  vaultAddress: string,
  protocol: string
): VaultApprovalResult {
  if (protocol === "yo") {
    if (approvedVaults.length > 0) {
      const gatewayApproved = approvedVaults.some(
        (v: string) => v.toLowerCase() === YO_GATEWAY_ADDRESS.toLowerCase()
      );
      if (!gatewayApproved) {
        return {
          approved: false,
          message: "YO Gateway not approved. Please re-register agent.",
        };
      }
    }
    return { approved: true };
  }

  if (approvedVaults.length > 0) {
    const normalizedVaultAddress = vaultAddress.toLowerCase();
    const isApproved = approvedVaults.some(
      (v: string) => v.toLowerCase() === normalizedVaultAddress
    );
    if (!isApproved) {
      return {
        approved: false,
        message: "Vault not approved. Please re-register agent with updated vault list.",
      };
    }
  }

  return { approved: true };
}

// ---------------------------------------------------------------------------
// resetAgentRegistration
// ---------------------------------------------------------------------------

/**
 * Clear all agent state for a wallet so the user can re-register.
 * This is the canonical state transition for undelegation / revocation.
 */
export async function resetAgentRegistration(sql: SqlClient, walletAddress: string): Promise<void> {
  await sql`
    UPDATE users
    SET authorization_7702 = NULL,
        agent_registered = false,
        auto_optimize_enabled = false,
        updated_at = NOW()
    WHERE wallet_address = ${walletAddress}
  `;
}

// ---------------------------------------------------------------------------
// resolveAgentRegistration
// ---------------------------------------------------------------------------

/**
 * Fetch the agent registration row from the DB, validate auth type and expiry.
 *
 * The `sql` parameter is injected so callers can pass their own neon client
 * and tests can pass a mock.
 */
export async function resolveAgentRegistration(
  sql: SqlClient,
  walletAddresses: string[]
): Promise<ResolveResult> {
  const users = await sql`
    SELECT wallet_address, authorization_7702
    FROM users
    WHERE wallet_address = ANY(${walletAddresses})
      AND authorization_7702 IS NOT NULL
    LIMIT 1
  `;

  if (users.length === 0) {
    return {
      ok: false,
      error: "not_registered",
      message: "Agent not registered. Please register your agent to enable vault operations.",
      statusCode: 400,
    };
  }

  const authorizationData = users[0].authorization_7702 as AuthorizationData;

  // Validate via AgentSession value object
  const session = AgentSession.fromRaw(authorizationData);
  if (!session || !session.isValidType()) {
    return {
      ok: false,
      error: "invalid_auth_type",
      message: "Invalid authorization type. Please re-register agent.",
      statusCode: 400,
    };
  }

  if (session.isExpired()) {
    return {
      ok: false,
      error: "session_expired",
      message: "Session key expired. Please re-register agent.",
      statusCode: 400,
    };
  }

  return {
    ok: true,
    registeredAddress: users[0].wallet_address as string,
    authorizationData,
  };
}

// ---------------------------------------------------------------------------
// resolveAndDecryptRegistration
// ---------------------------------------------------------------------------

/**
 * Resolves registration AND decrypts the authorization data.
 * Returns the `accountAddress` resolved to:
 *   - `smartWalletAddress` for ERC-4337 sessions (from raw auth data)
 *   - `eoaAddress` for EIP-7702 sessions (from decrypted auth data)
 */
export async function resolveAndDecryptRegistration(
  sql: SqlClient,
  walletAddresses: string[]
): Promise<ResolveAndDecryptResult> {
  const resolved = await resolveAgentRegistration(sql, walletAddresses);

  if (!resolved.ok) {
    return resolved;
  }

  const { authorizationData, registeredAddress } = resolved;

  const decryptedAuth = decryptAuthorization(authorizationData);

  // Resolve the account address via AgentSession
  const session = new AgentSession(authorizationData);
  const accountAddress = session.accountAddress(decryptedAuth);

  return {
    ok: true,
    registeredAddress,
    authorizationData,
    decryptedAuth,
    accountAddress,
  };
}
