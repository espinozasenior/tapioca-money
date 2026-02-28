export function formatUserError(error: unknown): string {
  const rawMessage =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "Something went wrong.";
  const message = rawMessage.toLowerCase();

  if (message.includes("rejected") || message.includes("denied")) {
    return "Transaction was rejected.";
  }

  if (message.includes("session key expired")) {
    return "Session expired. Please re-register your agent.";
  }

  if (message.includes("0x3e4983f6")) {
    return "Agent daily operation limit reached.";
  }

  if (
    !message.includes("0x3e4983f6") &&
    (message.includes("aa23") || message.includes("validateuserop"))
  ) {
    return "Session key validation failed. Please re-register.";
  }

  if (message.includes("vault not approved")) {
    return "Vault not approved. Re-register to update permissions.";
  }

  return rawMessage;
}
