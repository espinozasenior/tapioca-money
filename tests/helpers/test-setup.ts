/**
 * Test Setup Helpers for Agent Integration Tests
 *
 * Uses in-memory storage instead of a real database.
 * Tests should never hit a real DB — they test business logic, not SQL.
 */

import crypto from "crypto";

// ---------------------------------------------------------------------------
// In-memory store (replaces real Neon SQL calls)
// ---------------------------------------------------------------------------

interface StoredUser {
  id: string;
  wallet_address: string;
  auto_optimize_enabled: boolean;
  agent_registered: boolean;
  authorization_7702: any;
  transfer_authorization: any | null;
}

interface StoredStrategy {
  user_id: string;
  min_apy_gain_threshold: string;
  risk_level: string;
}

interface StoredAction {
  id: string;
  user_id: string;
  action_type: string;
  status: string;
  metadata: any;
  created_at: number;
}

const usersStore = new Map<string, StoredUser>();
const strategiesStore = new Map<string, StoredStrategy>();
const actionsStore: StoredAction[] = [];

let idCounter = 0;
function nextId(): string {
  return `test-user-${++idCounter}`;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TestUser {
  id: string;
  walletAddress: string;
  authorization: any;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a random Ethereum-style address
 */
export function generateRandomAddress(): string {
  return `0x${crypto.randomBytes(20).toString("hex")}`;
}

/**
 * Create a test user with authorization
 */
export async function seedTestUser(
  walletAddress?: string,
  autoOptimizeEnabled: boolean = true,
  minApyThreshold: string = "0.005"
): Promise<TestUser> {
  const address = walletAddress || generateRandomAddress();

  const authorization = {
    chainId: 8453, // Base
    address: address,
    nonce: 1,
    signature: "0xtest_signature",
    expiry: Math.floor(Date.now() / 1000) + 86400, // 24 hours
  };

  const userId = nextId();

  usersStore.set(address, {
    id: userId,
    wallet_address: address,
    auto_optimize_enabled: autoOptimizeEnabled,
    agent_registered: true,
    authorization_7702: authorization,
    transfer_authorization: null,
  });

  strategiesStore.set(userId, {
    user_id: userId,
    min_apy_gain_threshold: minApyThreshold,
    risk_level: "medium",
  });

  return {
    id: userId,
    walletAddress: address,
    authorization,
  };
}

/**
 * Create test user with expired authorization
 */
export async function seedTestUserWithExpiredAuth(walletAddress?: string): Promise<TestUser> {
  const address = walletAddress || generateRandomAddress();

  const authorization = {
    chainId: 8453,
    address: address,
    nonce: 1,
    signature: "0xtest_signature",
    expiry: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
  };

  const userId = nextId();

  usersStore.set(address, {
    id: userId,
    wallet_address: address,
    auto_optimize_enabled: true,
    agent_registered: true,
    authorization_7702: authorization,
    transfer_authorization: null,
  });

  strategiesStore.set(userId, {
    user_id: userId,
    min_apy_gain_threshold: "0.005",
    risk_level: "medium",
  });

  return {
    id: userId,
    walletAddress: address,
    authorization,
  };
}

/**
 * Clean up test data by wallet addresses
 */
export async function cleanupTestData(walletAddresses: string[]): Promise<void> {
  for (const addr of walletAddresses) {
    const user = usersStore.get(addr);
    if (user) {
      strategiesStore.delete(user.id);
      // Remove actions for this user
      for (let i = actionsStore.length - 1; i >= 0; i--) {
        if (actionsStore[i].user_id === user.id) {
          actionsStore.splice(i, 1);
        }
      }
    }
    usersStore.delete(addr);
  }
}

/**
 * Clean up all test data (use carefully!)
 */
export async function cleanupAllTestData(): Promise<void> {
  usersStore.clear();
  strategiesStore.clear();
  actionsStore.length = 0;
  idCounter = 0;
}

/**
 * Create test database client (returns a no-op tagged template for compat)
 */
export function createTestClient() {
  return async (strings: TemplateStringsArray, ..._values: any[]) => {
    // Return empty result set — tests that need specific data should use the
    // dedicated helper functions instead of raw SQL.
    return [];
  };
}

/**
 * Mock transaction API response
 */
export function mockTransactionResponse(success: boolean = true, txHash?: string): any {
  if (success) {
    return {
      id: "task_test_123",
      taskId: "task_test_123",
      status: "completed",
      transactionHash: txHash || "0xtest_tx_hash_1234567890",
      gasUsed: "200000",
    };
  } else {
    return {
      id: "task_test_456",
      taskId: "task_test_456",
      status: "failed",
      error: "Test error: Simulation failed",
    };
  }
}

/**
 * Mock yield opportunities for testing
 */
export function mockYieldOpportunities() {
  return [
    {
      id: "morpho-vault-1",
      protocol: "morpho" as const,
      name: "Morpho USDC Vault",
      asset: "USDC",
      apy: 0.08, // 8%
      tvl: BigInt("10000000000000"), // 10M USDC
      address: "0xMORPHO_VAULT_TEST" as `0x${string}`,
      riskScore: 0.2,
      liquidityDepth: BigInt("1000000000000"),
      metadata: {
        vaultAddress: "0xMORPHO_VAULT_TEST" as `0x${string}`,
        curator: "Test Curator",
        isVault: true,
      },
    },
    {
      id: "aave-pool-1",
      protocol: "aave" as const,
      name: "Aave V3 USDC",
      asset: "USDC",
      apy: 0.05, // 5%
      tvl: BigInt("50000000000000"),
      address: "0xAAVE_POOL_TEST" as `0x${string}`,
      riskScore: 0.1,
      liquidityDepth: BigInt("5000000000000"),
    },
  ];
}

/**
 * Mock position for testing
 */
export function mockPosition(
  protocol: "morpho" | "aave" | "moonwell" = "aave",
  assets: bigint = BigInt("1000000000"), // 1000 USDC
  apy: number = 0.04 // 4%
) {
  return {
    protocol,
    vaultAddress: `0x${protocol.toUpperCase()}_VAULT` as `0x${string}`,
    shares: assets, // Simplified 1:1
    assets,
    apy,
    enteredAt: Date.now() - 86400000, // 1 day ago
  };
}

/**
 * Wait for async operations
 */
export async function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Verify agent action was logged
 */
export async function verifyAgentActionLogged(
  userId: string,
  actionType: string = "rebalance",
  expectedStatus?: string
): Promise<boolean> {
  const action = actionsStore
    .filter((a) => a.user_id === userId && a.action_type === actionType)
    .sort((a, b) => b.created_at - a.created_at)[0];

  if (!action) return false;
  if (expectedStatus && action.status !== expectedStatus) return false;
  return true;
}

/**
 * Get agent actions for user
 */
export async function getAgentActions(userId: string, limit: number = 10) {
  return actionsStore
    .filter((a) => a.user_id === userId)
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, limit);
}

/**
 * Create test transfer session key
 */
export async function createTestTransferSession(walletAddress: string): Promise<any> {
  const smartAccount = `0x${crypto.randomBytes(20).toString("hex")}` as `0x${string}`;
  const sessionKey = `0x${crypto.randomBytes(20).toString("hex")}` as `0x${string}`;

  const transferAuth = {
    type: "zerodev-transfer-session",
    smartAccountAddress: smartAccount,
    sessionKeyAddress: sessionKey,
    sessionPrivateKey: `0x${crypto.randomBytes(32).toString("hex")}` as `0x${string}`,
    expiry: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
    createdAt: Date.now(),
  };

  const user = usersStore.get(walletAddress);
  if (user) {
    user.transfer_authorization = transferAuth;
  }

  return transferAuth;
}

/**
 * Create test agent session key with full permissions
 */
export async function createTestAgentSession(walletAddress: string): Promise<any> {
  const vault1 = `0x${crypto.randomBytes(20).toString("hex")}` as `0x${string}`;
  const vault2 = `0x${crypto.randomBytes(20).toString("hex")}` as `0x${string}`;

  const agentAuth = {
    type: "zerodev-agent-session",
    smartAccountAddress: `0x${crypto.randomBytes(20).toString("hex")}` as `0x${string}`,
    sessionKeyAddress: `0x${crypto.randomBytes(20).toString("hex")}` as `0x${string}`,
    serializedAccount: `base64_test_serialized_${crypto.randomBytes(10).toString("hex")}`,
    sessionPrivateKey: `0x${crypto.randomBytes(32).toString("hex")}` as `0x${string}`,
    expiry: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
    approvedVaults: [vault1, vault2],
    timestamp: Date.now(),
  };

  const user = usersStore.get(walletAddress);
  if (user) {
    user.authorization_7702 = agentAuth;
    user.agent_registered = true;
  }

  return agentAuth;
}

/**
 * Cleanup transfer session for testing
 */
export async function cleanupTransferSession(walletAddress: string): Promise<void> {
  const user = usersStore.get(walletAddress);
  if (user) {
    user.transfer_authorization = null;
  }
}

/**
 * Cleanup agent session for testing
 */
export async function cleanupAgentSession(walletAddress: string): Promise<void> {
  const user = usersStore.get(walletAddress);
  if (user) {
    user.authorization_7702 = null;
    user.agent_registered = false;
  }
}
