import { timingSafeEqual } from "crypto";

/**
 * Timing-safe secret comparison to prevent timing attacks.
 * Returns false if either secret is missing or if they don't match.
 */
export function verifySecret(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !expected) {
    return false;
  }

  // Ensure both strings are the same length for timingSafeEqual
  // Use a constant-time comparison even for length check
  const providedBuf = Buffer.from(provided, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");

  // If lengths differ, still do a comparison to avoid timing leak
  if (providedBuf.length !== expectedBuf.length) {
    // Compare with itself to maintain constant time
    timingSafeEqual(expectedBuf, expectedBuf);
    return false;
  }

  return timingSafeEqual(providedBuf, expectedBuf);
}
