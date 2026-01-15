// Transaction executor for yield optimizer
import { encodeFunctionData, parseUnits } from "viem";
import { MORPHO_BLUE_BASE } from "./types";
import { 
  findActiveUsdcMarket, 
  buildMorphoDepositTx, 
  buildMorphoWithdrawTx,
  MORPHO_BLUE_ABI 
} from "./protocols/morpho";
import { PROTOCOLS, USDC_ADDRESS } from "./config";

// ERC20 ABI for approvals
const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// Aave Pool ABI
const AAVE_POOL_ABI = [
  {
    name: "supply",
    type: "function",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "onBehalfOf", type: "address" },
      { name: "referralCode", type: "uint16" },
    ],
    outputs: [],
  },
] as const;

// Protocol addresses
const AAVE_POOL = "0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b" as const;

interface Transaction {
  to: `0x${string}`;
  data: `0x${string}`;
  value: bigint;
}

interface DepositTransactionResult {
  transactions: Array<{
    id: string;
    title: string;
    type: string;
    status: string;
    unsignedTransaction: string;
    stepIndex: number;
  }>;
}

/**
 * Build deposit transaction for a yield opportunity
 * @param protocol - Protocol name (morpho, aave, etc)
 * @param userAddress - User's wallet address
 * @param amount - Amount to deposit in USDC (decimals)
 * @param vaultAddress - Optional vault address for Morpho vaults (ERC4626)
 */
export async function buildDepositTransaction(
  protocol: string,
  userAddress: `0x${string}`,
  amount: string,
  vaultAddress?: `0x${string}`
): Promise<DepositTransactionResult> {
  const amountWei = parseUnits(amount, 6); // USDC has 6 decimals
  const transactions: DepositTransactionResult["transactions"] = [];

  // Step 1: Approve USDC spend
  // If vault address provided, approve for vault; otherwise use protocol default
  let targetAddress: `0x${string}`;
  if (protocol === "morpho" && vaultAddress) {
    targetAddress = vaultAddress; // Approve vault for ERC4626 deposit
  } else if (protocol === "aave") {
    targetAddress = AAVE_POOL;
  } else {
    targetAddress = MORPHO_BLUE_BASE; // Fallback to Morpho Core
  }

  const approveData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "approve",
    args: [targetAddress, amountWei],
  });

  transactions.push({
    id: `approve-${Date.now()}`,
    title: "Approve USDC",
    type: "APPROVAL",
    status: "CREATED",
    unsignedTransaction: JSON.stringify({
      to: USDC_ADDRESS,
      data: approveData,
      value: "0x0",
    }),
    stepIndex: 0,
  });

  // Step 2: Deposit based on protocol
  if (protocol === "aave") {
    const supplyData = encodeFunctionData({
      abi: AAVE_POOL_ABI,
      functionName: "supply",
      args: [USDC_ADDRESS, amountWei, userAddress, 0],
    });

    transactions.push({
      id: `supply-${Date.now()}`,
      title: "Supply to Aave",
      type: "SUPPLY",
      status: "CREATED",
      unsignedTransaction: JSON.stringify({
        to: AAVE_POOL,
        data: supplyData,
        value: "0x0",
      }),
      stepIndex: 1,
    });
  } else if (protocol === "morpho") {
    // Use vault deposit if vault address is provided (production path)
    if (vaultAddress) {
      // Build ERC4626 vault deposit transaction
      const morphoTxs = buildMorphoDepositTx(amountWei, userAddress, vaultAddress);
      
      transactions.push({
        id: `supply-${Date.now()}`,
        title: "Deposit to Morpho Vault",
        type: "SUPPLY",
        status: "CREATED",
        unsignedTransaction: JSON.stringify({
          to: morphoTxs.supply.to,
          data: morphoTxs.supply.data,
          value: "0x0",
        }),
        stepIndex: 1,
      });
    } else {
      // Fallback: direct market supply (for testing/legacy)
      const marketParams = await findActiveUsdcMarket();
      
      if (!marketParams) {
        throw new Error(
          "Morpho USDC market not available. " +
          "Please provide a vault address for production deposits."
        );
      }
      
      // Build deposit transactions using refactored function
      const morphoTxs = buildMorphoDepositTx(amountWei, userAddress);
      
      transactions.push({
        id: `supply-${Date.now()}`,
        title: "Supply to Morpho",
        type: "SUPPLY",
        status: "CREATED",
        unsignedTransaction: JSON.stringify({
          to: morphoTxs.supply.to,
          data: morphoTxs.supply.data,
          value: "0x0",
        }),
        stepIndex: 1,
      });
    }
  } else if (protocol === "moonwell") {
    // Moonwell deposit - not deployed on testnet
    transactions.push({
      id: `supply-${Date.now()}`,
      title: "Supply to Moonwell",
      type: "SUPPLY",
      status: "CREATED",
      unsignedTransaction: JSON.stringify({
        to: "0x0000000000000000000000000000000000000000",
        data: "0x",
        value: "0x0",
      }),
      stepIndex: 1,
    });
  }

  return { transactions };
}

/**
 * Build withdraw transaction to exit a position
 * @param protocol - The protocol to withdraw from
 * @param userAddress - User's wallet address
 * @param shares - Amount of shares to withdraw (for share-based protocols like Morpho)
 * @param assets - Amount of assets to withdraw (alternative to shares)
 */
export async function buildWithdrawTransaction(
  protocol: string,
  userAddress: `0x${string}`,
  shares?: bigint,
  assets?: bigint,
  vaultAddress?: `0x${string}`
): Promise<DepositTransactionResult> {
  const transactions: DepositTransactionResult["transactions"] = [];

  if (protocol === "morpho") {
    // Check if market exists
    const marketParams = await findActiveUsdcMarket();
    
    if (!marketParams) {
      throw new Error("Morpho USDC market not available");
    }

    // Build withdrawal transaction
    const withdrawTx = buildMorphoWithdrawTx(userAddress, shares, assets, vaultAddress);
    
    transactions.push({
      id: `withdraw-${Date.now()}`,
      title: "Withdraw from Morpho",
      type: "WITHDRAW",
      status: "CREATED",
      unsignedTransaction: JSON.stringify({
        to: withdrawTx.to,
        data: withdrawTx.data,
        value: "0x0",
      }),
      stepIndex: 0,
    });
  } else if (protocol === "aave") {
    // Aave withdrawal
    const AAVE_WITHDRAW_ABI = [
      {
        name: "withdraw",
        type: "function",
        inputs: [
          { name: "asset", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "to", type: "address" },
        ],
        outputs: [{ name: "", type: "uint256" }],
      },
    ] as const;

    const withdrawData = encodeFunctionData({
      abi: AAVE_WITHDRAW_ABI,
      functionName: "withdraw",
      args: [
        USDC_ADDRESS,
        assets || 0n, // Withdraw all if not specified
        userAddress,
      ],
    });

    transactions.push({
      id: `withdraw-${Date.now()}`,
      title: "Withdraw from Aave",
      type: "WITHDRAW",
      status: "CREATED",
      unsignedTransaction: JSON.stringify({
        to: AAVE_POOL,
        data: withdrawData,
        value: "0x0",
      }),
      stepIndex: 0,
    });
  } else {
    throw new Error(`Withdrawal not supported for protocol: ${protocol}`);
  }

  return { transactions };
}
