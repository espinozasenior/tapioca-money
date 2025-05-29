"use client";

import { useAuth } from "@crossmint/client-sdk-react-ui";
import { useEffect } from "react";

export function LoginButton() {
  const { login } = useAuth();
  useEffect(() => {
    login();
  }, [login]);
  return null;
}
