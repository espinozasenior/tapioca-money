import { ponder } from "@/generated";
import { vaultState, vaultFlow } from "../ponder.schema";

/**
 * YoVault event handlers — index Deposit and Withdraw events
 * for YO Protocol vaults (ERC4626-compatible).
 *
 * Same TVL tracking pattern as MorphoVault handlers but
 * tagged with protocol: 'yo'.
 */

ponder.on("YoVault:Deposit", async ({ event, context }) => {
  const vaultAddress = event.log.address.toLowerCase();
  const chainId = context.network.chainId;
  const stateId = `${vaultAddress}_${chainId}`;

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
      protocol: "yo",
      totalAssets: event.args.assets.toString(),
      lastUpdated: Number(event.block.timestamp),
      depositCount: 1,
      withdrawCount: 0,
    });
  }
});

ponder.on("YoVault:Withdraw", async ({ event, context }) => {
  const vaultAddress = event.log.address.toLowerCase();
  const chainId = context.network.chainId;
  const stateId = `${vaultAddress}_${chainId}`;

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

  const existing = await context.db.find(vaultState, { id: stateId });

  if (existing) {
    const newTotal = BigInt(existing.totalAssets) - event.args.assets;
    const clamped = newTotal < 0n ? 0n : newTotal;
    await context.db.update(vaultState, { id: stateId }).set({
      totalAssets: clamped.toString(),
      lastUpdated: Number(event.block.timestamp),
      withdrawCount: existing.withdrawCount + 1,
    });
  } else {
    await context.db.insert(vaultState).values({
      id: stateId,
      vaultAddress,
      chainId,
      protocol: "yo",
      totalAssets: "0",
      lastUpdated: Number(event.block.timestamp),
      depositCount: 0,
      withdrawCount: 1,
    });
  }
});
