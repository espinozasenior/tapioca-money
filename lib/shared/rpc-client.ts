// Shared RPC client for Base mainnet
// Uses CHAIN_CONFIG.rpcUrl which reads from NEXT_PUBLIC_BASE_RPC_URL env var
// Avoids rate limiting on public endpoint (https://mainnet.base.org)

import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { CHAIN_CONFIG } from "@/lib/yield-optimizer/config";

export const baseClient = createPublicClient({
  chain: base,
  transport: http(CHAIN_CONFIG.rpcUrl),
});
