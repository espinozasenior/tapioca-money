/**
 * AgentSession value object.
 *
 * Co-locates session validation (type check, expiry check, account address
 * resolution) with the authorization data it operates on. This eliminates
 * scattered validation logic across resolve-registration.ts and cron/route.ts.
 */

import type {
  SessionKey7702Authorization,
  SessionKeyErc4337Authorization,
} from "@/lib/security/session-encryption";

type SessionAuthorization = SessionKey7702Authorization | SessionKeyErc4337Authorization;

const VALID_SESSION_TYPES: readonly string[] = ["zerodev-7702-session", "zerodev-erc4337-session"];

export class AgentSession {
  constructor(private readonly auth: SessionAuthorization) {}

  get type(): string {
    return this.auth.type;
  }

  get approvedVaults(): string[] {
    return this.auth.approvedVaults || [];
  }

  get expiry(): number {
    return this.auth.expiry;
  }

  /** Returns true if the session type is one of the two valid ZeroDev types. */
  isValidType(): boolean {
    return VALID_SESSION_TYPES.includes(this.auth.type);
  }

  /** Returns true if the session has expired. Missing expiry is treated as not expired. */
  isExpired(): boolean {
    if (!this.auth.expiry) return false;
    return this.auth.expiry < Math.floor(Date.now() / 1000);
  }

  /** Returns true if the session has a valid type AND is not expired. */
  isValid(): boolean {
    return this.isValidType() && !this.isExpired();
  }

  /**
   * Resolves the account address where funds live.
   * - ERC-4337: `smartWalletAddress` (Privy Kernel smart wallet)
   * - EIP-7702: `eoaAddress` from decryptedAuth if provided, otherwise from raw auth
   */
  accountAddress(decryptedAuth?: SessionAuthorization): `0x${string}` {
    if (this.auth.type === "zerodev-erc4337-session") {
      return (this.auth as SessionKeyErc4337Authorization).smartWalletAddress;
    }
    const source = decryptedAuth || this.auth;
    return (source as SessionKey7702Authorization).eoaAddress;
  }

  /**
   * Construct an AgentSession from raw/unknown data.
   * Returns null if data is not a valid object with a string `type` field.
   */
  static fromRaw(data: unknown): AgentSession | null {
    if (!data || typeof data !== "object") return null;
    const obj = data as Record<string, unknown>;
    if (typeof obj.type !== "string") return null;
    return new AgentSession(data as SessionAuthorization);
  }
}
