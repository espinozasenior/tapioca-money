import { ponder } from "@/generated";
import { vaultState, vaultFlow } from "../ponder.schema";

/**
 * MorphoVault event handlers — index Deposit and Withdraw events
 * to track TVL and vault flows for the Sentinel service.
 *
 * TVL is tracked cumulatively: deposits add to totalAssets,
 * withdrawals subtract. This gives us reorg-safe on-chain TVL
 * independent of protocol APIs.
 */

ponder.on("MorphoVault:Deposit", async ({ event, context }) => {
  const vaultAddress = event.log.address.toLowerCase();
  const chainId = context.network.chainId;
  const stateId = `${vaultAddress}_${chainId}`;

  // Record the individual flow event
  await context.db.insert(vaultFlow).values({
    id: `${event.transaction.hash}_${event.log.logIndex}`,
    vaultAddress,
    chainId,
    type: "deposit",
    sender: event.args.sender.toLowerCase(),
    assets: event.args.assets.toString(),
    shares: event.args.shares.toString(),
    timestamp: Number(event.block.timestamp),
    blockNumber: Number(event.block.number),
  });

  // Upsert cumulative vault state
  const existing = await context.db.find(vaultState, { id: stateId });

  if (existing) {
    const newTotal = BigInt(existing.totalAssets) + event.args.assets;
    await context.db.update(vaultState, { id: stateId }).set({
      totalAssets: newTotal.toString(),
      lastUpdated: Number(event.block.timestamp),
      depositCount: existing.depositCount + 1,
    });
  } else {
    await context.db.insert(vaultState).values({
      id: stateId,
      vaultAddress,
      chainId,
      protocol: "morpho",
      totalAssets: event.args.assets.toString(),
      lastUpdated: Number(event.block.timestamp),
      depositCount: 1,
      withdrawCount: 0,
    });
  }
});

ponder.on("MorphoVault:Withdraw", async ({ event, context }) => {
  const vaultAddress = event.log.address.toLowerCase();
  const chainId = context.network.chainId;
  const stateId = `${vaultAddress}_${chainId}`;

  // Record the individual flow event
  await context.db.insert(vaultFlow).values({
    id: `${event.transaction.hash}_${event.log.logIndex}`,
    vaultAddress,
    chainId,
    type: "withdraw",
    sender: event.args.sender.toLowerCase(),
    assets: event.args.assets.toString(),
    shares: event.args.shares.toString(),
    timestamp: Number(event.block.timestamp),
    blockNumber: Number(event.block.number),
  });

  // Upsert cumulative vault state
  const existing = await context.db.find(vaultState, { id: stateId });

  if (existing) {
    const newTotal = BigInt(existing.totalAssets) - event.args.assets;
    // Floor at 0 in case of accounting discrepancies
    const clamped = newTotal < 0n ? 0n : newTotal;
    await context.db.update(vaultState, { id: stateId }).set({
      totalAssets: clamped.toString(),
      lastUpdated: Number(event.block.timestamp),
      withdrawCount: existing.withdrawCount + 1,
    });
  } else {
    // Withdraw without prior deposit state — initialize at 0
    await context.db.insert(vaultState).values({
      id: stateId,
      vaultAddress,
      chainId,
      protocol: "morpho",
      totalAssets: "0",
      lastUpdated: Number(event.block.timestamp),
      depositCount: 0,
      withdrawCount: 1,
    });
  }
});
