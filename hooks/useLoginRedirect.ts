"use client";

import { useRef, useCallback, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";

/**
 * Returns a click handler that navigates to /dashboard if already authenticated,
 * otherwise opens Privy login and redirects after auth completes.
 *
 * The redirect logic lives in a single useEffect here rather than duplicated
 * across every CTA component.
 */
export function useLoginRedirect() {
  const { login, authenticated, ready } = usePrivy();
  const router = useRouter();
  const pendingRef = useRef(false);

  useEffect(() => {
    if (ready && authenticated && pendingRef.current) {
      pendingRef.current = false;
      router.push("/dashboard");
    }
  }, [ready, authenticated, router]);

  return useCallback(() => {
    if (authenticated) {
      router.push("/dashboard");
      return;
    }
    pendingRef.current = true;
    login();
  }, [authenticated, login, router]);
}
