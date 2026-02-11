# Fix: Deposit sends approve through Privy EOA instead of ZeroDev smart account

## Steps

- [x] **Step 1:** Add provider instrumentation to `hooks/useWallet.ts` — wraps `getEthereumProvider()` with tracing proxy that logs stack traces for `eth_sendTransaction` etc.
- [x] **Step 2:** Add detailed logging to `app/api/vault/deposit/route.ts` — logs params, timing, and errors around `executeGaslessDeposit()`
- [x] **Step 3:** Remove no-op `configureSessionKeyPermissions()` from `lib/zerodev/client-secure.ts` — function imported ZeroDev permission modules but never executed them. Permissions are enforced server-side via call policies in `kernel-client.ts`.
- [x] **Step 4:** Add address verification logging to `lib/zerodev/kernel-client.ts` — logs computed vs stored smart account address
- [ ] **Step 5:** Based on Step 1 findings, fix the root cause of the Privy approve modal
- [ ] **Step 6:** Clean up debug code (remove provider instrumentation) and test end-to-end

## Verification Needed
1. Run `pnpm dev` and open browser DevTools console
2. Trigger a deposit — look for the intercepted stack trace from Step 1
3. Check terminal for API logs from Step 2
4. Confirm deposit succeeds via ZeroDev (no Privy modal, gasless)
5. Verify tx on Basescan shows UserOperation format
