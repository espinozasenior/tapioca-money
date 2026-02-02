"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useRef } from "react";

export function Login() {
  const { login, ready, authenticated } = usePrivy();
  const loginTriggeredRef = useRef(false);

  console.log('[Login] Status:', { ready, authenticated });

  useEffect(() => {
    // Only trigger login once when Privy is ready and user not authenticated
    if (ready && !authenticated && !loginTriggeredRef.current) {
      console.log('[Login] Triggering Privy login modal');
      loginTriggeredRef.current = true;
      login();
    }

    // Reset ref if user becomes authenticated and then logs out
    if (!authenticated) {
      loginTriggeredRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated]);

  if (!ready) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
          <p className="text-sm text-gray-600">Initializing authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center">
      <p className="text-sm text-gray-600">Opening login...</p>
    </div>
  );
}
