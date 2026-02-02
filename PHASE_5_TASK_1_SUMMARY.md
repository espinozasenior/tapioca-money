# Phase 5 - Task #1: Deploy Shared Rebalancing Logic Contract

> **⚠️ DEPRECATED - This document describes an obsolete contract that has been removed.**
>
> **Status:** ~~✅ Contract Created~~ → **Contract Removed**
>
> **The MorphoRebalancer.sol contract is no longer used.** The new architecture uses:
> - **Direct vault interactions** via ERC-7715 session keys (no intermediary contract)
> - **Gelato Smart Wallet SDK** for EIP-7702 smart accounts
> - **Real-time vault data** from Morpho GraphQL API
>
> **See [`CLAUDE.md`](../CLAUDE.md) lines 73-137 for current architecture.**

---

## ~~Contract Overview~~ (OBSOLETE)

### ~~MorphoRebalancer.sol~~ (REMOVED)

**Location:** ~~`/liqx_contracts/contracts/MorphoRebalancer.sol`~~ → DELETED

**Purpose:** ~~Shared rebalancing logic contract~~ → Replaced by direct vault calls in `lib/agent/rebalance-executor.ts`

**Key Features:**
1. ✅ **Full Rebalance**: Move all shares from one Morpho vault to another
2. ✅ **Partial Rebalance**: Move a specific USDC amount between vaults
3. ✅ **Emergency Withdraw**: Extract all funds from a vault if needed
4. ✅ **Balance Query**: Check vault positions

**How EIP-7702 Works:**
- User signs an off-chain authorization message
- Authorization allows their EOA to use this contract's code
- When rebalancing executes, `msg.sender` is the user's EOA
- User assets never leave their EOA - they stay in full control
- ONE contract serves ALL users

---

## Contract Functions

### `executeRebalance(fromVault, toVault, shares)`

Rebalances by redeeming a specific number of shares:

```solidity
function executeRebalance(
    address fromVault,  // Source Morpho vault (ERC4626)
    address toVault,    // Target Morpho vault (ERC4626)
    uint256 shares      // Number of shares to redeem
) external
```

**Flow:**
1. Redeem shares from source vault → receive USDC
2. Approve target vault to spend USDC
3. Deposit USDC to target vault → receive shares
4. Emit `RebalanceExecuted` event

### `executePartialRebalance(fromVault, toVault, assets)`

Rebalances a specific USDC amount:

```solidity
function executePartialRebalance(
    address fromVault,  // Source Morpho vault
    address toVault,    // Target Morpho vault
    uint256 assets      // USDC amount to rebalance
) external
```

### `emergencyWithdraw(vault)`

Withdraws all shares from a vault in case of emergency:

```solidity
function emergencyWithdraw(address vault) external
```

### `getVaultBalance(vault, user)` (view)

Query the USDC value of a user's position in a vault:

```solidity
function getVaultBalance(
    address vault,
    address user
) external view returns (uint256)
```

---

## Events

```solidity
event RebalanceExecuted(
    address indexed user,
    address indexed fromVault,
    address indexed toVault,
    uint256 amount,
    uint256 timestamp
);

event PartialRebalanceExecuted(
    address indexed user,
    address indexed fromVault,
    address indexed toVault,
    uint256 sharesRedeemed,
    uint256 assetsReceived,
    uint256 timestamp
);
```

---

## Deployment Script

**Location:** `/liqx_contracts/scripts/deployMorphoRebalancer.ts`

**To Deploy:**

```bash
cd liqx_contracts

# Set environment variables (if not already set)
export BASE_RPC_URL="https://mainnet.base.org"
export BASE_PRIVATE_KEY="your_private_key_here"

# Deploy to Base mainnet
npx hardhat run scripts/deployMorphoRebalancer.ts --network base

# Verify on Basescan
npx hardhat verify --network base <CONTRACT_ADDRESS>
```

**Deployment Output:**
- Contract address
- Deployer address
- USDC address verification
- Next steps instructions

---

## Security Considerations

### ✅ Safe Practices

1. **No User Funds Stored**: Contract doesn't hold any user funds
2. **msg.sender Protection**: All operations use `msg.sender` (user's EOA via EIP-7702)
3. **No Authorization Required**: Contract can't be called by anyone except via EIP-7702
4. **Stateless**: No storage variables that could be manipulated
5. **Event Logging**: All operations emit events for transparency

### ⚠️ Important Notes

1. **EIP-7702 Required**: This contract ONLY works via EIP-7702 delegation
2. **User Approval**: Users must approve this via EIP-7702 authorization
3. **One Contract for All**: Shared by all users - no per-user deployment needed
4. **USDC Hardcoded**: Uses Base mainnet USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`)

---

## Configuration

**Hardhat Config:** Already configured for Base network
**Network:** Base mainnet (Chain ID: 8453)
**USDC Address:** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

---

## Next Steps (After Deployment)

1. **Deploy Contract**:
   ```bash
   cd liqx_contracts
   npx hardhat run scripts/deployMorphoRebalancer.ts --network base
   ```

2. **Verify on Basescan**:
   ```bash
   npx hardhat verify --network base <CONTRACT_ADDRESS>
   ```

3. **Update Frontend** with deployed contract address:
   - Add to `.env`: `NEXT_PUBLIC_REBALANCER_CONTRACT=<address>`
   - Use in EIP-7702 authorization flow

4. **Proceed to Task #2**: Implement EIP-7702 authorization flow in frontend

---

## Testing

### Local Testing (Hardhat)

```bash
cd liqx_contracts

# Run tests (create test file first)
npx hardhat test

# Deploy to local hardhat network
npx hardhat run scripts/deployMorphoRebalancer.ts --network hardhat
```

### Base Sepolia Testnet

```bash
# Deploy to testnet first
export BASE_SEPOLIA_RPC_URL="https://sepolia.base.org"
export BASE_SEPOLIA_PRIVATE_KEY="your_testnet_key"

npx hardhat run scripts/deployMorphoRebalancer.ts --network baseSepolia
```

---

## Contract Size & Gas Estimates

**Contract Size:** ~2-3 KB (well under 24 KB limit)
**Deployment Gas:** ~500,000 - 800,000 gas
**executeRebalance Gas:** ~200,000 - 300,000 gas
**executePartialRebalance Gas:** ~200,000 - 300,000 gas

---

**Task Status:** ✅ Complete (Contract ready for deployment)
**Next Task:** #2 - Implement EIP-7702 Authorization Flow
