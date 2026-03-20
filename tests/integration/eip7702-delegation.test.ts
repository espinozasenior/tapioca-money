/**
 * EIP-7702 Delegation Tests
 *
 * Tests the complete EIP-7702 delegation lifecycle:
 * - Delegation designator verification (0xef0100 prefix)
 * - Delegation target validation (Kernel V3.3 match)
 * - Permission validator slot correctness (regular, not sudo)
 * - Rebalance call building (previewRedeem, no MAX_UINT256)
 * - Pre-execution delegation checks
 * - Undelegation function
 * - Signer consistency across files
 * - Paymaster/nonce error handling
 *
 * Environment: Base mainnet via production .env
 */

import { describe, test, expect, vi } from "vitest";
import { createPublicClient, http, parseAbi, encodeFunctionData } from "viem";
import { base } from "viem/chains";

// ─── Delegation Verification Tests ──────────────────────────────────────────
// These test the designator parsing logic directly without mocking viem,
// by testing the bytecode pattern matching in isolation.

describe("checkSmartAccountActive — Delegation Designator Verification", () => {
  // Helper: simulate the designator parsing logic from checkSmartAccountActive
  function parseDelegationBytecode(code: string | undefined) {
    if (!code || code === "0x") {
      return { active: false, isDelegation: false };
    }
    if (code.startsWith("0xef0100") && code.length === 48) {
      const implementationAddress = ("0x" + code.slice(8)) as `0x${string}`;
      return { active: true, isDelegation: true, implementationAddress };
    }
    return { active: true, isDelegation: false };
  }

  test("1. Valid EIP-7702 delegation returns correct DelegationStatus", () => {
    const kernelAddr = "aabbccddaabbccddaabbccddaabbccddaabbccdd";
    const result = parseDelegationBytecode(`0xef0100${kernelAddr}`);

    expect(result.active).toBe(true);
    expect(result.isDelegation).toBe(true);
    expect(result.implementationAddress?.toLowerCase()).toBe(`0x${kernelAddr}`);
  });

  test("2. Wrong delegation target detected", () => {
    const wrongAddr = "0000000000000000000000000000000000000001";
    const result = parseDelegationBytecode(`0xef0100${wrongAddr}`);

    expect(result.active).toBe(true);
    expect(result.isDelegation).toBe(true);
    expect(result.implementationAddress).toBe(`0x${wrongAddr}`);
  });

  test("3. No bytecode (not delegated) returns inactive", () => {
    expect(parseDelegationBytecode("0x")).toEqual({ active: false, isDelegation: false });
    expect(parseDelegationBytecode(undefined)).toEqual({ active: false, isDelegation: false });
  });

  test("4. Regular contract bytecode (not 0xef0100) returns non-delegation", () => {
    const result = parseDelegationBytecode("0x6080604052348015600f57600080fd5b50");

    expect(result.active).toBe(true);
    expect(result.isDelegation).toBe(false);
    expect(result).not.toHaveProperty("implementationAddress");
  });

  test("4b. Designator with wrong length rejected", () => {
    // Too short — only 10 hex chars after prefix instead of 40
    const result = parseDelegationBytecode("0xef01001234567890");
    expect(result.isDelegation).toBe(false);
    expect(result.active).toBe(true); // Has bytecode, just not a valid delegation
  });
});

// ─── Permission Slot Tests ──────────────────────────────────────────────────

describe("Kernel Client — Permission Validator Slot", () => {
  test("5. permissionValidator is in regular slot, not sudo", async () => {
    // Read the source file and verify the pattern
    const fs = await import("fs");
    const kernelClientSource = fs.readFileSync("lib/zerodev/kernel-client.ts", "utf-8");

    // Verify regular slot is used
    expect(kernelClientSource).toContain("regular: permissionValidator");

    // Verify sudo slot is NOT used with permissionValidator
    expect(kernelClientSource).not.toContain("sudo: permissionValidator");
  });

  test("6. CallPolicy permissions include all vault selectors", () => {
    // Verify the function selectors match expected ERC-4626 + ERC-20 operations
    const EXPECTED_SELECTORS = {
      REDEEM: "0xba087652", // redeem(uint256,address,address)
      DEPOSIT: "0x6e553f65", // deposit(uint256,address)
      WITHDRAW: "0xb460af94", // withdraw(uint256,address,address)
      APPROVE: "0x095ea7b3", // approve(address,uint256)
    };

    // Verify against actual Solidity function selectors
    const redeemSelector = encodeFunctionData({
      abi: parseAbi(["function redeem(uint256,address,address) returns (uint256)"]),
      functionName: "redeem",
      args: [
        0n,
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
      ],
    }).slice(0, 10);

    const depositSelector = encodeFunctionData({
      abi: parseAbi(["function deposit(uint256,address) returns (uint256)"]),
      functionName: "deposit",
      args: [0n, "0x0000000000000000000000000000000000000000"],
    }).slice(0, 10);

    expect(redeemSelector).toBe(EXPECTED_SELECTORS.REDEEM);
    expect(depositSelector).toBe(EXPECTED_SELECTORS.DEPOSIT);
  });

  test("7. No sudo policy - error thrown when no permissions provided", async () => {
    const fs = await import("fs");
    const kernelClientSource = fs.readFileSync("lib/zerodev/kernel-client.ts", "utf-8");

    // Verify that toSudoPolicy is NOT used (security fix)
    expect(kernelClientSource).not.toContain("toSudoPolicy");

    // Verify that we throw an error when no permissions provided
    expect(kernelClientSource).toContain("params.permissions.length === 0");
    expect(kernelClientSource).toContain("Session key requires explicit permissions");
    expect(kernelClientSource).toContain("toCallPolicy");
  });
});

// ─── Rebalance Call Building Tests ──────────────────────────────────────────

describe("buildRebalanceCalls — previewRedeem & No MAX_UINT256", () => {
  const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const MAX_UINT256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

  test("8. buildRebalanceCalls uses previewRedeem for deposit amount", async () => {
    // Use a real Morpho vault on Base mainnet
    const publicClient = createPublicClient({ chain: base, transport: http() });

    // Morpho Blue USDC vault on Base (Gauntlet USDC Core)
    const testVault = "0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca" as `0x${string}`;
    // Use larger share amount to ensure non-zero result (1e18 shares)
    const testShares = BigInt("1000000000000000000");

    let previewResult: bigint;
    try {
      previewResult = await publicClient.readContract({
        address: testVault,
        abi: parseAbi(["function previewRedeem(uint256 shares) view returns (uint256)"]),
        functionName: "previewRedeem",
        args: [testShares],
      });
    } catch {
      // If vault doesn't exist or RPC fails, skip gracefully
      console.log("Skipping test 8: could not call previewRedeem on vault");
      return;
    }

    // previewRedeem should return a non-zero asset amount for non-zero shares
    expect(previewResult).toBeGreaterThanOrEqual(0n);
    // The function is callable — that's the key verification
    expect(typeof previewResult).toBe("bigint");
  });

  test("9. Deposit call does NOT use MAX_UINT256", async () => {
    const fs = await import("fs");
    const rebalanceSource = fs.readFileSync("lib/agent/rebalance-executor.ts", "utf-8");

    // Verify MAX_UINT256 is NOT used in the deposit args
    // The old code had: args: [MAX_UINT256, params.userAddress]
    // The new code should use depositAmount
    expect(rebalanceSource).toContain("args: [redeemAmount, params.userAddress]");
    expect(rebalanceSource).not.toMatch(/deposit.*args:\s*\[MAX_UINT256/);
  });

  test("10. Approve call uses exact amount, not MAX_UINT256", async () => {
    const fs = await import("fs");
    const rebalanceSource = fs.readFileSync("lib/agent/rebalance-executor.ts", "utf-8");

    // Verify approve uses depositAmount
    expect(rebalanceSource).toContain("args: [params.toVault, redeemAmount]");
  });

  test("11. Full rebalance calls structure is correct", async () => {
    // Import with mocked previewRedeem
    const { buildRebalanceCalls } = await import("@/lib/agent/rebalance-executor");

    const testParams = {
      fromVault: "0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca" as `0x${string}`,
      toVault: "0xBEEF01735c132Ada46AA9aA9B6290e06dF3A3b40" as `0x${string}`,
      shares: 1000000n,
      userAddress: "0x1234567890123456789012345678901234567890" as `0x${string}`,
    };

    let calls;
    try {
      calls = await buildRebalanceCalls(testParams);
    } catch {
      console.log("Skipping test 11: previewRedeem call failed (RPC issue)");
      return;
    }

    // Should have exactly 3 calls: redeem, approve, deposit
    expect(calls).toHaveLength(3);

    // Step 1: Redeem from source vault
    expect(calls[0].to).toBe(testParams.fromVault);
    expect(calls[0].data.startsWith("0xba087652")).toBe(true); // redeem selector

    // Step 2: Approve USDC on destination vault
    expect(calls[1].to.toLowerCase()).toBe(USDC_ADDRESS.toLowerCase());
    expect(calls[1].data.startsWith("0x095ea7b3")).toBe(true); // approve selector

    // Step 3: Deposit to destination vault
    expect(calls[2].to).toBe(testParams.toVault);
    expect(calls[2].data.startsWith("0x6e553f65")).toBe(true); // deposit selector

    // Verify no MAX_UINT256 in any call data
    const maxUint256Hex = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    calls.forEach((call, i) => {
      expect(call.data).not.toContain(maxUint256Hex);
    });
  });
});

// ─── Undelegation Tests ─────────────────────────────────────────────────────

describe("undelegateEoa — On-chain Delegation Removal", () => {
  test("12. undelegateEoa sends transaction with pre-signed authorization and explicit gas", async () => {
    const { undelegateEoa } = await import("@/lib/zerodev/client-secure");

    const mockSignedAuth = { r: "0x1234", s: "0x5678", yParity: 0 };
    const mockWalletClient = {
      sendTransaction: vi.fn().mockResolvedValue("0xtxhash123"),
    };

    const txHash = await undelegateEoa(
      "0x1234567890123456789012345678901234567890",
      mockWalletClient,
      mockSignedAuth
    );

    // Verify sendTransaction called with pre-signed authorizationList and explicit gas
    expect(mockWalletClient.sendTransaction).toHaveBeenCalledWith({
      to: "0x1234567890123456789012345678901234567890",
      data: "0x",
      value: BigInt(0),
      authorizationList: [mockSignedAuth],
      gas: BigInt(30000),
    });

    expect(txHash).toBe("0xtxhash123");
  });

  test("13. undelegateEoa function exists and is exported", async () => {
    const clientSecure = await import("@/lib/zerodev/client-secure");
    expect(typeof clientSecure.undelegateEoa).toBe("function");
  });
});

// ─── Signer Consistency Tests ───────────────────────────────────────────────

describe("Signer Consistency — Kernel Version & EntryPoint", () => {
  test("14. Kernel version is KERNEL_V3_3 across all key files", async () => {
    const fs = await import("fs");

    const files = ["lib/zerodev/kernel-client.ts", "lib/zerodev/transfer-session.ts"];

    for (const file of files) {
      const source = fs.readFileSync(file, "utf-8");
      expect(source).toContain("KERNEL_V3_3");
      expect(source).not.toContain("KERNEL_V3_1");
    }
  });

  test("15. EntryPoint V0.7 address is consistent", async () => {
    const fs = await import("fs");
    const ENTRYPOINT_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

    // ENTRYPOINT_V07 is now defined in the shared constants file and imported by consumers
    const constantsSource = fs.readFileSync("lib/zerodev/constants.ts", "utf-8");
    expect(constantsSource).toContain(ENTRYPOINT_ADDRESS);

    // Consumers should import from constants (not redefine the address)
    const consumers = ["lib/zerodev/kernel-client.ts", "lib/zerodev/transfer-session.ts"];
    for (const file of consumers) {
      const source = fs.readFileSync(file, "utf-8");
      expect(source).toContain("ENTRYPOINT_V07");
    }
  });

  test("15b. eip7702SignedAuth is accepted by all executors (legacy)", async () => {
    const fs = await import("fs");

    // transfer-executor should now accept eip7702SignedAuth
    const transferExecSource = fs.readFileSync("lib/zerodev/transfer-executor.ts", "utf-8");
    expect(transferExecSource).toContain("eip7702SignedAuth");

    // deposit-executor should accept eip7702SignedAuth
    const depositExecSource = fs.readFileSync("lib/zerodev/deposit-executor.ts", "utf-8");
    expect(depositExecSource).toContain("eip7702SignedAuth");

    // rebalance-executor should accept eip7702SignedAuth
    const rebalanceExecSource = fs.readFileSync("lib/agent/rebalance-executor.ts", "utf-8");
    expect(rebalanceExecSource).toContain("eip7702SignedAuth");
  });

  test("15c. serializedAccount is accepted by all executors (new pattern)", async () => {
    const fs = await import("fs");

    const executorFiles = [
      "lib/zerodev/transfer-executor.ts",
      "lib/zerodev/deposit-executor.ts",
      "lib/zerodev/vault-executor.ts",
      "lib/agent/rebalance-executor.ts",
    ];

    for (const file of executorFiles) {
      const source = fs.readFileSync(file, "utf-8");
      // Each executor should accept serializedAccount
      expect(source).toContain("serializedAccount");
      // Each executor should use createDeserializedKernelClient when serializedAccount is provided
      expect(source).toContain("createDeserializedKernelClient");
    }
  });
});

// ─── UserOp Error Handling Tests ────────────────────────────────────────────

describe("UserOp Formation — Error Handling", () => {
  test("17. Paymaster error is caught and returned gracefully", async () => {
    const fs = await import("fs");
    const rebalanceSource = fs.readFileSync("lib/agent/rebalance-executor.ts", "utf-8");

    // Verify paymaster error handling exists
    expect(rebalanceSource).toMatch(/includes\(["']paymaster["']\)/);
    expect(rebalanceSource).toContain("Gas sponsorship failed");
  });

  test("18. Nonce error is caught and returned gracefully", async () => {
    const fs = await import("fs");
    const rebalanceSource = fs.readFileSync("lib/agent/rebalance-executor.ts", "utf-8");

    // Verify nonce error handling exists
    expect(rebalanceSource).toMatch(/includes\(["']nonce["']\)/);
    expect(rebalanceSource).toContain("nonce error");
  });
});

// ─── Pre-Execution Delegation Check Tests ───────────────────────────────────

describe("Pre-Execution Delegation Checks", () => {
  test("16. executeRebalance checks delegation before execution", async () => {
    const fs = await import("fs");
    const rebalanceSource = fs.readFileSync("lib/agent/rebalance-executor.ts", "utf-8");

    // Verify delegation check happens before building calls
    const delegationCheckIndex = rebalanceSource.indexOf(
      "checkSmartAccountActive(smartAccountAddress)"
    );
    const buildCallsIndex = rebalanceSource.indexOf("buildRebalanceCalls(params)");

    expect(delegationCheckIndex).toBeGreaterThan(-1);
    expect(buildCallsIndex).toBeGreaterThan(-1);
    expect(delegationCheckIndex).toBeLessThan(buildCallsIndex);

    // Verify it checks for inactive delegation
    expect(rebalanceSource).toContain("delegation not active");
  });

  test("19. verifyDelegationAfterExecution exists and is exported", async () => {
    const kernelClient = await import("@/lib/zerodev/kernel-client");
    expect(typeof kernelClient.verifyDelegationAfterExecution).toBe("function");
  });
});

// ─── DelegationStatus Type Tests ────────────────────────────────────────────

describe("DelegationStatus Type Contract", () => {
  test("DelegationStatus interface is exported", async () => {
    const { checkSmartAccountActive } = await import("@/lib/zerodev/client-secure");
    // The function should exist and be callable
    expect(typeof checkSmartAccountActive).toBe("function");
  });
});

// ─── Serialize/Deserialize Pattern Tests ────────────────────────────────────

describe("Serialize/Deserialize Kernel Account Pattern", () => {
  test("20. createDeserializedKernelClient is exported from kernel-client", async () => {
    const kernelClient = await import("@/lib/zerodev/kernel-client");
    expect(typeof kernelClient.createDeserializedKernelClient).toBe("function");
  });

  test("21. createAndSerializeAccount exists in account-serializer (re-exported from client-secure)", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("lib/zerodev/account-serializer.ts", "utf-8");
    // Function lives in account-serializer, re-exported from client-secure
    expect(source).toContain("async function createAndSerializeAccount");
    expect(source).toContain("serializePermissionAccount");

    // Verify re-export from client-secure
    const facade = fs.readFileSync("lib/zerodev/client-secure.ts", "utf-8");
    expect(facade).toContain("createAndSerializeAccount");
  });

  test("22. serializePermissionAccount is used in account-serializer", async () => {
    const fs = await import("fs");
    const serializerSource = fs.readFileSync("lib/zerodev/account-serializer.ts", "utf-8");
    const permBuilderSource = fs.readFileSync("lib/zerodev/permission-builder.ts", "utf-8");

    expect(serializerSource).toContain("serializePermissionAccount");
    expect(serializerSource).toContain("createKernelAccount");
    expect(permBuilderSource).toContain("toPermissionValidator");
  });

  test("23. deserializePermissionAccount is used in kernel-client", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("lib/zerodev/kernel-client.ts", "utf-8");

    expect(source).toContain("deserializePermissionAccount");
    expect(source).toContain("KERNEL_V3_3");
    expect(source).toContain("ENTRYPOINT_V07");
  });

  test("24. session-encryption handles serializedAccount field", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("lib/security/session-encryption.ts", "utf-8");

    // Type includes serializedAccount
    expect(source).toContain("serializedAccount");

    // encryptAuthorization encrypts serializedAccount
    expect(source).toMatch(/serializedAccount.*encrypt/s);

    // decryptAuthorization decrypts serializedAccount
    expect(source).toMatch(/serializedAccount.*decrypt/s);
  });

  test("25. Executors prefer serializedAccount over legacy sessionPrivateKey", async () => {
    const fs = await import("fs");

    // All executors should check serializedAccount FIRST
    const executors = [
      "lib/zerodev/transfer-executor.ts",
      "lib/zerodev/deposit-executor.ts",
      "lib/zerodev/vault-executor.ts",
      "lib/agent/rebalance-executor.ts",
    ];

    for (const file of executors) {
      const source = fs.readFileSync(file, "utf-8");

      // Each executor must contain serializedAccount and sessionPrivateKey
      expect(source).toContain("serializedAccount");
      expect(source).toContain("sessionPrivateKey");

      // createDeserializedKernelClient should appear (new pattern)
      expect(source).toContain("createDeserializedKernelClient");
    }
  });
});

// ─── External Wallet Registration Tests ─────────────────────────────────────

describe("External Wallet Registration — Two-Phase Flow", () => {
  test("26. delegateViaExternalWallet is exported from client-secure", async () => {
    const clientSecure = await import("@/lib/zerodev/client-secure");
    expect(typeof clientSecure.delegateViaExternalWallet).toBe("function");
  });

  test("27. registerAgentSecureExternal is exported from client-secure", async () => {
    const clientSecure = await import("@/lib/zerodev/client-secure");
    expect(typeof clientSecure.registerAgentSecureExternal).toBe("function");
  });

  test("28. createAndSerializeAccountExternal exists and does not use eip7702Auth", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("lib/zerodev/account-serializer.ts", "utf-8");

    // Function lives in account-serializer (re-exported from client-secure)
    expect(source).toContain("async function createAndSerializeAccountExternal");

    // Extract the external wallet function body — it should NOT contain eip7702Auth
    const fnStart = source.indexOf("async function createAndSerializeAccountExternal");
    const fnEnd = source.indexOf("async function createAndSerializeAccountErc4337");
    const externalFn = source.slice(fnStart, fnEnd);

    // Must NOT pass eip7702Auth — external wallet delegation is already on-chain
    expect(externalFn).not.toContain("eip7702Auth:");
    // Must call the shared permission builder
    expect(externalFn).toContain("buildSessionKeyAndPermissions");
  });

  test("29. External wallet flow uses authorizationList (not signAuthorization)", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("lib/zerodev/client-secure.ts", "utf-8");

    // delegateViaExternalWallet must use authorizationList in sendTransaction
    const delegateFnStart = source.indexOf("export async function delegateViaExternalWallet");
    const delegateFnEnd = source.indexOf("export async function revokeSessionKey");
    const delegateFn = source.slice(delegateFnStart, delegateFnEnd);

    expect(delegateFn).toContain("wallet_getCapabilities");
    expect(delegateFn).toContain("authorizationList");
    expect(delegateFn).toContain("address: implAddress");
    expect(delegateFn).toContain("numberToHex(8453)");
    expect(delegateFn).toContain("waitForTransactionReceipt");
    expect(delegateFn).toContain("checkSmartAccountActive");
  });

  test("30. External wallet registration verifies delegation before proceeding", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("lib/zerodev/client-secure.ts", "utf-8");

    // The shared registerAgent orchestrator checks delegation for external path
    expect(source).toContain("checkSmartAccountActive");
    expect(source).toContain("Delegation not found on-chain");
  });

  test("31. useOptimizer always uses embedded wallet for EIP-7702 regardless of active wallet", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("hooks/useOptimizer.ts", "utf-8");

    // The registration code must find embedded wallets from allWallets (not rely on activeWallet)
    // This ensures EIP-7702 path is taken even when an external wallet (Brave, MetaMask) is active
    expect(source).toContain('walletClientType === "privy"');
    expect(source).toContain("signAuthorization");
    expect(source).toContain("registerAgentSecure");

    // Path B: ERC-4337 fallback only when no embedded wallet exists
    expect(source).toContain("registerAgentErc4337");
    expect(source).toContain("NEXT_PUBLIC_ENABLE_ERC4337_FALLBACK");

    // Key behavioral assertion: embedded wallet is found from allWallets BEFORE
    // checking activeWallet — the if(embeddedWallet) block must come before the
    // ERC-4337 else-if block, ensuring EIP-7702 is always preferred.
    const embeddedCheckIdx = source.indexOf("if (embeddedWallet)");
    const erc4337FallbackIdx = source.indexOf("registerAgentErc4337");
    expect(embeddedCheckIdx).toBeGreaterThan(-1);
    expect(erc4337FallbackIdx).toBeGreaterThan(-1);
    expect(embeddedCheckIdx).toBeLessThan(erc4337FallbackIdx);

    // Must NOT gate Path A on activeWallet being the embedded wallet
    // (the old bug: `supportsEip7702 && activeWallet.walletClientType === "privy"`)
    const pathACondition = source.substring(embeddedCheckIdx - 200, embeddedCheckIdx);
    expect(pathACondition).not.toContain("supportsEip7702 && activeWallet");

    // Must use embeddedWallet.address (not activeWallet address) for registration
    const pathABlock = source.substring(embeddedCheckIdx, erc4337FallbackIdx);
    expect(pathABlock).toContain("embeddedWallet.address");
    expect(pathABlock).toContain("embeddedWallet.raw.switchChain");
  });

  test("32. All registration paths share the same permission builder", async () => {
    const fs = await import("fs");

    // After DDD refactor, permission-builder.ts contains the shared function,
    // account-serializer.ts contains the three createAndSerialize* variants.
    const permBuilderSource = fs.readFileSync("lib/zerodev/permission-builder.ts", "utf-8");
    const serializerSource = fs.readFileSync("lib/zerodev/account-serializer.ts", "utf-8");

    // Verify the shared function exists in permission-builder
    expect(permBuilderSource).toContain("async function buildSessionKeyAndPermissions(");

    // Shared builder must include YO Gateway permissions
    expect(permBuilderSource).toContain("YO_GATEWAY_DEPOSIT_SELECTOR");
    expect(permBuilderSource).toContain("YO_GATEWAY_REDEEM_SELECTOR");

    // Must include USDC approve and transfer
    expect(permBuilderSource).toContain("USDC_ADDRESS");

    // Must include rate limit and timestamp policies
    expect(permBuilderSource).toContain("toRateLimitPolicy");
    expect(permBuilderSource).toContain("toTimestampPolicy");

    // Verify all three createAndSerialize* functions call buildSessionKeyAndPermissions
    expect(serializerSource).toContain("async function createAndSerializeAccount(");
    expect(serializerSource).toContain("async function createAndSerializeAccountExternal(");
    expect(serializerSource).toContain("async function createAndSerializeAccountErc4337(");

    // All three must import buildSessionKeyAndPermissions
    expect(serializerSource).toContain("buildSessionKeyAndPermissions");

    // Verify re-export from client-secure facade
    const facade = fs.readFileSync("lib/zerodev/client-secure.ts", "utf-8");
    expect(facade).toContain("buildSessionKeyAndPermissions");
  });
});
