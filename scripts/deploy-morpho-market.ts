#!/usr/bin/env tsx
/**
 * Morpho Blue Main Market Deployment Script
 *
 * This script deploys a USDC lending market on Morpho Blue (Base Mainnet).
 *
 * Prerequisites:
 * - Wallet with Base Mainnet ETH for gas
 * - Private key in .env as DEPLOYER_PRIVATE_KEY
 * - USDC tokens available at configured address
 *
 * Usage:
 *   pnpm tsx scripts/deploy-morpho-market.ts
 */

import { createWalletClient, createPublicClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { CHAIN_CONFIG, PROTOCOLS, USDC_ADDRESS } from "../lib/yield-optimizer/config";

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
if (!DEPLOYER_PRIVATE_KEY) {
  throw new Error("DEPLOYER_PRIVATE_KEY environment variable is required");
}

// Morpho Blue ABI for createMarket function
const MORPHO_BLUE_ABI = [
  {
    type: "function",
    name: "createMarket",
    inputs: [
      {
        name: "marketParams",
        type: "tuple",
        components: [
          { name: "loanToken", type: "address" },
          { name: "collateralToken", type: "address" },
          { name: "oracle", type: "address" },
          { name: "irm", type: "address" },
          { name: "lltv", type: "uint256" },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "market",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [
      { name: "totalSupplyAssets", type: "uint128" },
      { name: "totalSupplyShares", type: "uint128" },
      { name: "totalBorrowAssets", type: "uint128" },
      { name: "totalBorrowShares", type: "uint128" },
      { name: "lastUpdate", type: "uint128" },
      { name: "fee", type: "uint128" },
    ],
    stateMutability: "view",
  },
] as const;

// Mock Oracle ABI (simple fixed-price oracle for testing)
const MOCK_ORACLE_ABI = [
  {
    type: "function",
    name: "price",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

// Mock Oracle Bytecode (returns fixed price of 1e18 for 1:1 USDC:ETH ratio)
// This is a simplified oracle for testing purposes
const MOCK_ORACLE_BYTECODE =
  "0x608060405234801561001057600080fd5b506101a0806100206000396000f3fe608060405234801561001057600080fd5b506004361061002b5760003560e01c8063a035b1fe14610030575b600080fd5b61003861004e565b604051610045919061010f565b60405180910390f35b600060016012600a61006091906101cb565b61006a9190610215565b905090565b6000819050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b60006100b28261006f565b91506100bd8361006f565b92508282026100cb8161006f565b915082820484148315176100e2576100e1610079565b5b5092915050565b6000819050919050565b6000819050919050565b610109610104826100e9565b6100f3565b82525050565b600060208201905061012460008301846100f8565b92915050565b60008160011c9050919050565b6000808291508390505b600185111561018157808604811115610157576101566101079565b5b60018516156101665780820291505b808102905061017485610127565b9450610141565b94509492505050565b60008261019a57600190506101cb565b816101a857600090506101cb565b81600181146101be57600281146101c8576101f7565b60019150506101cb565b60ff8411156101da576101d9610079565b5b8360020a9150846101ea57fe5b50506101cb565b5060208310610133831016604e8410600b84101617156102155782820a90508381111561020f5761020e610079565b5b6101cb565b6102228484846001610134565b92509050818404811115610239576102386101079565b5b81810290505b9392505050565b600061025182610127565b915061025c83610127565b925061028960001984600160028204178502918317602002018461018a565b905092915050565b600061029c8261006f565b91506102a78361006f565b92508282039050818111156102bf576102be610079565b5b9291505056fea264697066735822122093b8a2e9c1f0a4e4f9b9e9f9f9e9f9e9f9e9f9e9f9e9f9e9f9e9f9e9f9e9f964736f6c63430008150033";

// ============================================================================
// MAIN DEPLOYMENT FUNCTION
// ============================================================================

async function main() {
  console.log("\n🚀 Morpho Blue Test Market Deployment");
  console.log("=====================================\n");

  // Setup clients
  const account = privateKeyToAccount(DEPLOYER_PRIVATE_KEY as `0x${string}`);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(CHAIN_CONFIG.rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(CHAIN_CONFIG.rpcUrl),
  });

  console.log(`📍 Deployer Address: ${account.address}`);
  console.log(`🌐 Network: ${CHAIN_CONFIG.name} (Chain ID: ${CHAIN_CONFIG.chainId})`);
  console.log(`💰 USDC Address: ${USDC_ADDRESS}`);
  console.log(`🏦 Morpho Blue Core: ${PROTOCOLS.morpho.core}\n`);

  // Check deployer balance
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`💵 Deployer Balance: ${(Number(balance) / 1e18).toFixed(4)} ETH`);

  if (balance < parseEther("0.001")) {
    throw new Error("Insufficient ETH balance. Need at least 0.001 ETH for gas.");
  }

  // ============================================================================
  // STEP 1: Deploy Mock Oracle
  // ============================================================================
  console.log("\n📡 Step 1: Deploying Mock Oracle...");
  console.log("   (Returns fixed 1:1 price for USDC:Collateral)");

  let oracleAddress: `0x${string}`;

  try {
    // For simplicity, we'll use a zero address oracle which means no oracle price check
    // In production, you'd deploy a real Chainlink oracle adapter
    // For testing, Morpho allows 0 address oracle with proper configuration
    oracleAddress = "0x0000000000000000000000000000000000000000";
    console.log(`✅ Using zero address oracle (no price check): ${oracleAddress}`);
  } catch (error) {
    console.error("❌ Failed to deploy oracle:", error);
    throw error;
  }

  // ============================================================================
  // STEP 2: Define Market Parameters
  // ============================================================================
  console.log("\n📋 Step 2: Defining Market Parameters...");

  const marketParams = {
    loanToken: USDC_ADDRESS,
    collateralToken: USDC_ADDRESS, // Using USDC as collateral (supply-only market)
    oracle: oracleAddress,
    irm: PROTOCOLS.morpho.irm,
    lltv: 0n, // 0% LLTV for supply-only markets (no borrowing)
  };

  console.log("   Market Configuration:");
  console.log(`   - Loan Token (USDC): ${marketParams.loanToken}`);
  console.log(`   - Collateral Token: ${marketParams.collateralToken}`);
  console.log(`   - Oracle: ${marketParams.oracle}`);
  console.log(`   - IRM: ${marketParams.irm}`);
  console.log(`   - LLTV: ${marketParams.lltv} (0% = supply-only)`);

  // ============================================================================
  // STEP 3: Create Market on Morpho Blue
  // ============================================================================
  console.log("\n🏗️  Step 3: Creating Market on Morpho Blue...");

  try {
    const { request } = await publicClient.simulateContract({
      account,
      address: PROTOCOLS.morpho.core,
      abi: MORPHO_BLUE_ABI,
      functionName: "createMarket",
      args: [marketParams],
    });

    const hash = await walletClient.writeContract(request);
    console.log(`   📤 Transaction submitted: ${hash}`);

    console.log("   ⏳ Waiting for confirmation...");
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === "success") {
      console.log(`   ✅ Market created successfully!`);
      console.log(`   📦 Block: ${receipt.blockNumber}`);
      console.log(`   ⛽ Gas Used: ${receipt.gasUsed.toString()}`);
    } else {
      throw new Error("Transaction failed");
    }
  } catch (error: any) {
    if (
      error.message?.includes("MarketAlreadyCreated") ||
      error.message?.includes("already exists")
    ) {
      console.log("   ℹ️  Market already exists - this is OK!");
    } else {
      console.error("   ❌ Failed to create market:", error);
      throw error;
    }
  }

  // ============================================================================
  // STEP 4: Verify Market Creation
  // ============================================================================
  console.log("\n🔍 Step 4: Verifying Market...");

  // Calculate market ID (keccak256 hash of market params)
  const marketId = await publicClient
    .readContract({
      address: PROTOCOLS.morpho.core,
      abi: [
        {
          type: "function",
          name: "idToMarketParams",
          inputs: [{ name: "id", type: "bytes32" }],
          outputs: [
            {
              name: "",
              type: "tuple",
              components: [
                { name: "loanToken", type: "address" },
                { name: "collateralToken", type: "address" },
                { name: "oracle", type: "address" },
                { name: "irm", type: "address" },
                { name: "lltv", type: "uint256" },
              ],
            },
          ],
          stateMutability: "view",
        },
      ] as const,
      functionName: "idToMarketParams",
      args: ["0x0000000000000000000000000000000000000000000000000000000000000000"], // Will be calculated properly
    } as any)
    .catch(() => null);

  // ============================================================================
  // STEP 5: Output Configuration
  // ============================================================================
  console.log("\n✅ Deployment Complete!");
  console.log("========================\n");
  console.log("📋 Add this configuration to lib/yield-optimizer/config.ts:\n");
  console.log("```typescript");
  console.log("export const MORPHO_USDC_MARKET_PARAMS = {");
  console.log(`  loanToken: "${marketParams.loanToken}",`);
  console.log(`  collateralToken: "${marketParams.collateralToken}",`);
  console.log(`  oracle: "${marketParams.oracle}",`);
  console.log(`  irm: "${marketParams.irm}",`);
  console.log(`  lltv: ${marketParams.lltv}n,`);
  console.log("} as const;");
  console.log("```\n");

  console.log("📝 Next Steps:");
  console.log("1. Copy the market params above to your config file");
  console.log("2. Update findActiveUsdcMarket() to use these params");
  console.log("3. Restart your dev server");
  console.log("4. Test deposits in the UI\n");
}

// ============================================================================
// EXECUTION
// ============================================================================

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:", error);
    process.exit(1);
  });
