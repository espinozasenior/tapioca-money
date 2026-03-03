# Lessons Learned

## Session key CallPolicy is immutable — verify all targets at registration time

- `serializePermissionAccount` captures the CallPolicy at registration time — it cannot be extended later
- When adding new protocol integrations (e.g. Pendle), ALL target addresses must be explicitly pushed into `approvedVaults` in `registerAgentSecure`, not just assumed to appear from `/api/optimize`
- The vault loop in `createAndSerializeAccount` only adds permissions for addresses in `approvedVaults` — if a target is missing, the UserOp gets AA23
- Pattern: after adding a new target to the `permissions` array, also push it into `approvedVaults` in `registerAgentSecure` (like YO Gateway, Pendle Router, and yoUSD vault)

## Always verify API response parsing against the real API

- The Pendle `/convert` endpoint returns data under `routes[0].outputs[0].amount`, not `data.amountOut`
- Parsing the wrong path silently falls through to "0" — causing a zero-quote that would revert on-chain
- Pattern: curl the real API endpoint to verify the response structure before writing the parser, and test mocks should match the real response shape

## EIP-7702 signing: Privy embedded vs external wallets

- Privy's `useSign7702Authorization` hook only works with Privy embedded wallets — it calls their internal API that has the private key
- External wallets (Brave, MetaMask) are JSON-RPC accounts — viem's `signAuthorization` rejects them (`AccountTypeNotSupportedError`)
- EIP-7702 uses a custom signing scheme (`keccak256(0x05 || rlp([chainId, address, nonce]))`) — NOT `personal_sign` or `eth_signTypedData`, so standard RPC methods can't produce the signature
- External wallets handle EIP-7702 through `wallet_sendCalls` (ERC-5792) — the wallet signs the authorization internally during batch execution, but the dapp never gets a standalone signed auth object
- Pattern: for standalone authorization signing, must use Privy embedded wallet. For external wallet support, need a two-phase flow: delegate via `wallet_sendCalls`, then register the kernel account

## Privy embedded wallets can't send Type 4 transactions

- Privy's RPC backend (`auth.privy.io/api/v1/wallets/.../rpc`) returns 500 for EIP-7702 Type 4 transactions
- Their `useSign7702Authorization` hook signs the auth, but `sendTransaction` with `authorizationList` fails
- Solution: server-side relayer — any wallet can submit a Type 4 tx with someone else's signed authorization (EIP-7702 design)
- Pattern: `RELAYER_PRIVATE_KEY` env var, server creates `privateKeyToAccount` + `createWalletClient`, sends the Type 4 tx. Gas is negligible on Base L2 (~$0.01)

## ZeroDev bundler rejects address(0) EIP-7702 delegations

- ZeroDev's bundler policy blocks undelegation via UserOps: "Invalid EIP-7702 authorization: Cannot delegate to the zero address"
- Undelegation MUST be a raw Type 4 transaction, not a gas-sponsored UserOp
- Pattern: use the server relayer for undelegation, not the ZeroDev bundler

## Gas estimation for Type 4 transactions

- Don't hardcode `gas` for EIP-7702 Type 4 transactions — the EIP-7702 auth overhead varies
- With `privateKeyToAccount` (local account), viem auto-estimates gas via `eth_estimateGas` — just omit the `gas` field
- JSON-RPC accounts (Privy) may submit with `gas: 0` because the provider doesn't estimate for Type 4 txs
- Pattern: let viem estimate gas on local accounts; only hardcode gas as a last resort

## BigInt serialization in API payloads

- Privy's `signAuthorization` returns objects with BigInt fields (`chainId`, `nonce`)
- `JSON.stringify` throws "Do not know how to serialize a BigInt" — must convert first
- Pattern: `JSON.stringify(obj, (_k, v) => typeof v === "bigint" ? \`0x\${v.toString(16)}\` : v)` on client, `Number(hexStr)` on server

## YO SDK `.raw` fields are in token units, not USD

- `getUserPerformance().unrealized.raw` and `.realized.raw` return values in the token's smallest unit (e.g. USDC = 6 decimals)
- Must divide by `10 ** config.underlying.decimals` before treating as USD — same as `pos.assets`
- Pattern: always check if SDK "raw" fields need decimal normalization before displaying as USD
