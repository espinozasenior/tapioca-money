/**
 * Sentinel v0 — Main Worker
 *
 * Long-running polling loop that:
 * 1. Gathers signals from Ponder, on-chain reads, and DeFiLlama
 * 2. Evaluates rules engine thresholds
 * 3. Executes emergency exits or sends alerts
 * 4. Updates vault status in DB
 * 5. Cleans up stale incidents
 *
 * Runs as a systemd unit on OVHcloud VPS. No Vercel dependency.
 */

import { loadConfig, THRESHOLDS, VAULT_EXPOSURE_MAP } from "./config";
import { RulesEngine } from "./rules-engine";
import { ExitOrchestrator } from "./exit-orchestrator";
import { getSql } from "./db";
import { checkPonderFreshness, queryVaultFlows, queryPriceUpdate } from "./signals/ponder";
import { queryVaultPaused, querySharePrice, queryTotalAssets } from "./signals/onchain";
import { queryDeFiLlamaPrice } from "./signals/defillama";
import { sendPagerDutyAlert } from "./notifications/pagerduty";
import type {
  Signal,
  Action,
  ActiveIncident,
  VaultConfig,
  SentinelConfig,
  ExitResult,
} from "./types";
import { SignalHistory } from "./types";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const activeIncidents = new Map<string, ActiveIncident>();
const signalWindows = new Map<string, SignalHistory>();
const rulesEngine = new RulesEngine();
let consecutiveFailures = 0;

// ---------------------------------------------------------------------------
// Signal gathering
// ---------------------------------------------------------------------------

async function gatherSignals(config: SentinelConfig, ponderFresh: boolean): Promise<Signal[]> {
  const signals: Signal[] = [];
  const now = Math.floor(Date.now() / 1000);

  for (const vault of config.vaults) {
    const exposure = vault.exposure;

    // --- Chainlink oracle price via Ponder ---
    if (ponderFresh && exposure.chainlinkFeed) {
      try {
        const price = await queryPriceUpdate(config.ponderGraphqlUrl, exposure.chainlinkFeed);
        if (price) {
          signals.push({
            type: "ORACLE_PRICE",
            vault,
            asset: exposure.underlying,
            value: price.price,
            timestamp: price.timestamp * 1000,
            source: "ponder",
          });
        }
      } catch (error) {
        console.error(`[Sentinel] Oracle price signal failed:`, (error as Error).message);
      }
    }

    // --- Vault TVL (bank-run detection) via on-chain totalAssets() ---
    //
    // The rules engine's evaluateVaultFlow compares the EARLIEST and LATEST
    // values in a rolling 30-min window and fires EXIT if TVL dropped > 15%.
    // That only works if the value is a monotonically-tracked TVL snapshot,
    // NOT a per-poll delta (deposits - withdrawals) — a delta can swing sign
    // between polls and produce meaningless "dropPct" ratios, causing
    // constant false-positive BANK_RUN triggers on quiet vaults.
    //
    // We use on-chain totalAssets() rather than summing Ponder flows because
    // (a) it's the canonical TVL including yield accrual and (b) it works
    // even when there's no indexer activity in the window.
    try {
      const totalAssets = await queryTotalAssets(vault.address, config.erpcUrl);
      if (totalAssets !== null && totalAssets > 0n) {
        // Convert to a Number scaled to underlying decimals (6 for USDC).
        // Morpho USDC vaults use 6 decimals — safe for TVL up to ~$9 quadrillion.
        const tvl = Number(totalAssets) / 1e6;
        signals.push({
          type: "VAULT_FLOW",
          vault,
          value: tvl,
          timestamp: Date.now(),
          source: "rpc",
        });
      }
    } catch (error) {
      console.error(`[Sentinel] TVL signal failed for ${vault.address}:`, (error as Error).message);
    }

    // --- DeFiLlama fallback when Ponder is stale ---
    if (!ponderFresh && exposure.dexPools.length > 0) {
      try {
        const llamaPrice = await queryDeFiLlamaPrice(exposure.underlying);
        if (llamaPrice) {
          signals.push({
            type: "DEX_PRICE",
            vault,
            asset: exposure.underlying,
            value: llamaPrice.price,
            timestamp: llamaPrice.timestamp * 1000,
            source: "defillama",
          });
        }
      } catch (error) {
        console.error(`[Sentinel] DeFiLlama fallback failed:`, (error as Error).message);
      }
    }

    // --- On-chain reads (always run, independent of Ponder) ---

    // NOTE: Previously emitted a MAX_REDEEM signal using address(0) as the
    // owner, but that's not a meaningful health check — ERC-4626 vaults
    // correctly return 0 shares for the zero address (it holds no shares),
    // which caused false MAX_REDEEM_ZERO exits on compliant vaults like
    // Moonwell Flagship USDC. The VAULT_PAUSED signal below already covers
    // the "withdrawals disabled" case that MAX_REDEEM was trying to detect.
    // To re-enable withdrawal liveness checks, add a known whale holder
    // per-vault to VAULT_EXPOSURE_MAP and query maxRedeem(whale) instead.

    // ERC-4626 compliance probe: skip for non-standard protocols (e.g. YO)
    const isErc4626 = vault.exposure.protocol === "morpho";
    if (!isErc4626) continue;

    // vault paused
    try {
      const paused = await queryVaultPaused(vault.address, config.erpcUrl);
      signals.push({
        type: "VAULT_PAUSED",
        vault,
        value: paused,
        timestamp: Date.now(),
        source: "rpc",
      });
    } catch (error) {
      // fail-open: assume not paused
    }

    // share price
    try {
      const sharePrice = await querySharePrice(
        vault.address,
        vault.exposure.underlyingDecimals,
        config.erpcUrl
      );
      if (sharePrice !== null) {
        signals.push({
          type: "SHARE_PRICE",
          vault,
          value: sharePrice,
          timestamp: Date.now(),
          source: "rpc",
        });
      }
    } catch (error) {
      console.error(
        `[Sentinel] share price signal failed for ${vault.address}:`,
        (error as Error).message
      );
    }
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Vault status persistence
// ---------------------------------------------------------------------------

async function upsertVaultStatus(
  vault: VaultConfig,
  signals: Signal[],
  hasActiveIncident: boolean
): Promise<void> {
  const sql = getSql();

  const vaultSignals = signals.filter((s) => s.vault.address === vault.address);

  const depegSignal = vaultSignals.find((s) => s.type === "DEX_PRICE" || s.type === "ORACLE_PRICE");
  const depegDelta =
    depegSignal && typeof depegSignal.value === "number" ? Math.abs(1.0 - depegSignal.value) : null;

  const maxRedeemSignal = vaultSignals.find((s) => s.type === "MAX_REDEEM");
  const maxRedeemZero = maxRedeemSignal?.value === 0 || maxRedeemSignal?.value === 0n;

  const sharePriceSignal = vaultSignals.find((s) => s.type === "SHARE_PRICE");
  const sharePrice =
    sharePriceSignal && typeof sharePriceSignal.value === "number" ? sharePriceSignal.value : null;

  // Derive status
  let status = "safe";
  if (hasActiveIncident) {
    status = "exiting";
  } else if (maxRedeemZero) {
    status = "danger";
  } else if (depegDelta && depegDelta > THRESHOLDS.DEPEG_EXIT_PCT) {
    status = "danger";
  } else if (depegDelta && depegDelta > THRESHOLDS.DEPEG_WARN_PCT) {
    status = "warning";
  }

  try {
    await sql`
      INSERT INTO sentinel_vault_status (
        vault_address, protocol, status, last_check_at,
        share_price, depeg_delta, max_redeem_zero, updated_at
      ) VALUES (
        ${vault.address},
        ${vault.exposure.protocol},
        ${status},
        NOW(),
        ${sharePrice},
        ${depegDelta},
        ${maxRedeemZero},
        NOW()
      )
      ON CONFLICT (vault_address) DO UPDATE SET
        status = EXCLUDED.status,
        last_check_at = NOW(),
        share_price = EXCLUDED.share_price,
        depeg_delta = EXCLUDED.depeg_delta,
        max_redeem_zero = EXCLUDED.max_redeem_zero,
        updated_at = NOW()
    `;
  } catch (error) {
    console.error(
      `[Sentinel] Failed to upsert vault status for ${vault.address}:`,
      (error as Error).message
    );
  }
}

// ---------------------------------------------------------------------------
// Incident lifecycle
// ---------------------------------------------------------------------------

function incidentKey(action: Action): string {
  return `${action.vaultAddress}:${action.signalType}`;
}

function cleanupStaleIncidents(): void {
  const now = Date.now();
  for (const [key, incident] of activeIncidents) {
    if (now - incident.createdAt > THRESHOLDS.INCIDENT_TTL_SECONDS * 1000) {
      activeIncidents.delete(key);
      console.log(`[Sentinel] Closed stale incident: ${key}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main poll cycle
// ---------------------------------------------------------------------------

async function pollCycle(config: SentinelConfig): Promise<void> {
  // 1. Check Ponder freshness
  const { fresh: ponderFresh } = await checkPonderFreshness(
    config.ponderGraphqlUrl,
    THRESHOLDS.PONDER_STALE_SECONDS
  );

  // 2. Gather all signals
  const signals = await gatherSignals(config, ponderFresh);
  console.log(`[Sentinel] Collected ${signals.length} signals from ${config.vaults.length} vaults`);

  // 3. Evaluate rules
  const actions = rulesEngine.evaluate(signals, signalWindows, activeIncidents);

  // 4. Process actions
  const exitOrchestrator = new ExitOrchestrator(config.erpcUrl);

  for (const action of actions) {
    const key = incidentKey(action);

    if (action.type === "EXIT") {
      console.log(
        `[Sentinel] EXIT triggered: ${action.reason} on ${action.vaultAddress} (value: ${action.value})`
      );

      // Create active incident (prevents re-triggers)
      activeIncidents.set(key, {
        vaultAddress: action.vaultAddress,
        signalType: action.signalType,
        reason: action.reason,
        createdAt: Date.now(),
      });

      // Execute exits
      const results = await exitOrchestrator.execute(action);

      // Update incident with results
      const incident = activeIncidents.get(key);
      if (incident) incident.results = results;

      // Notify ONLY if there were users with exposure to the vault.
      // An EXIT action with zero affected users (0 success / 0 failed / 0 skipped)
      // is operational noise — the rule fired but no one has funds at risk.
      // We still log the trigger locally so vault-level anomalies are observable.
      if (results.length > 0) {
        await sendPagerDutyAlert(action, results, config.pagerdutyRoutingKey);
      } else {
        console.log(
          `[Sentinel] EXIT ${action.reason} on ${action.vaultAddress} had zero affected users — skipping PagerDuty`
        );
      }

      console.log(
        `[Sentinel] Exit complete: ${results.filter((r) => r.status === "SUCCESS").length} success, ` +
          `${results.filter((r) => r.status === "FAILED").length} failed, ` +
          `${results.filter((r) => r.status === "SKIPPED").length} skipped`
      );
    } else if (action.type === "ALERT") {
      console.log(
        `[Sentinel] ALERT: ${action.reason} on ${action.vaultAddress} (value: ${action.value})`
      );

      // Log alert to DB
      try {
        const sql = getSql();
        await sql`
          INSERT INTO sentinel_incidents (
            user_address, vault_address, protocol, signal_type,
            signal_value, action_taken
          ) VALUES (
            'system',
            ${action.vaultAddress},
            ${action.protocol || "unknown"},
            ${action.signalType},
            ${typeof action.value === "number" ? action.value : null},
            'alert'
          )
        `;
      } catch (error) {
        console.error("[Sentinel] Failed to log alert:", (error as Error).message);
      }

      // Send PagerDuty alert (warning severity)
      await sendPagerDutyAlert(action, null, config.pagerdutyRoutingKey);
    }
  }

  // 5. Update vault statuses
  for (const vault of config.vaults) {
    const hasIncident = Array.from(activeIncidents.values()).some(
      (i) => i.vaultAddress === vault.address
    );
    await upsertVaultStatus(vault, signals, hasIncident);
  }

  // 6. Cleanup stale incidents
  cleanupStaleIncidents();

  // Reset consecutive failure counter
  consecutiveFailures = 0;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function startWorker(): Promise<void> {
  console.log("[Sentinel] Worker starting...");

  const config = loadConfig();
  console.log(
    `[Sentinel] Monitoring ${config.vaults.length} vaults, poll interval: ${config.pollIntervalMs}ms`
  );

  // Main polling loop
  const poll = async () => {
    try {
      await pollCycle(config);
    } catch (error) {
      consecutiveFailures++;
      console.error(
        `[Sentinel] Poll cycle failed (${consecutiveFailures} consecutive):`,
        (error as Error).message
      );

      // If 3+ consecutive failures, fire PagerDuty heartbeat-miss alert
      if (consecutiveFailures >= 3) {
        try {
          await sendPagerDutyAlert(
            {
              type: "ALERT",
              reason: "VAULT_PAUSED",
              vaultAddress: "0x0000000000000000000000000000000000000000" as `0x${string}`,
              signalType: "MAX_REDEEM",
              value: 0,
              protocol: undefined,
            },
            null,
            config.pagerdutyRoutingKey
          );
        } catch {
          // Last resort: nothing we can do
        }
      }
    }
  };

  // Initial poll
  await poll();

  // Schedule recurring polls
  setInterval(poll, config.pollIntervalMs);
}

// Run if executed directly
if (require.main === module) {
  startWorker().catch((error) => {
    console.error("[Sentinel] Fatal error:", error);
    process.exit(1);
  });
}
