/**
 * Sentinel v0 — PagerDuty Notifications
 *
 * Sends alerts via PagerDuty Events API v2.
 * Uses dedup_key to prevent duplicate alerts for the same incident.
 */

import type { Action, ExitResult } from "../types";

const PAGERDUTY_EVENTS_URL = "https://events.pagerduty.com/v2/enqueue";

const SEVERITY_MAP: Record<string, string> = {
  EXIT: "critical",
  ALERT: "warning",
};

/**
 * Send a PagerDuty alert for a sentinel action.
 * Non-blocking: catches and logs errors without throwing.
 */
export async function sendPagerDutyAlert(
  action: Action,
  results: ExitResult[] | null,
  routingKey: string
): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  const dedupKey = `sentinel-${action.vaultAddress}-${action.signalType}-${today}`;

  const exitCount = results?.length || 0;
  const successCount = results?.filter((r) => r.status === "SUCCESS").length || 0;
  const failedCount = results?.filter((r) => r.status === "FAILED").length || 0;

  const payload = {
    routing_key: routingKey,
    dedup_key: dedupKey,
    event_action: "trigger",
    payload: {
      summary: `[Sentinel] ${action.reason} on ${action.vaultAddress} (${action.protocol || "unknown"}) -- value: ${action.value}`,
      severity: SEVERITY_MAP[action.type] || "warning",
      source: "sentinel-worker",
      component: action.protocol || "unknown",
      group: action.vaultAddress,
      custom_details: {
        signal_type: action.signalType,
        signal_value: action.value,
        affected_users: exitCount,
        exits_success: successCount,
        exits_failed: failedCount,
      },
    },
  };

  try {
    const response = await fetch(PAGERDUTY_EVENTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error(`[Sentinel] PagerDuty returned ${response.status}: ${await response.text()}`);
    } else {
      console.log(`[Sentinel] PagerDuty alert sent: ${dedupKey}`);
    }
  } catch (error) {
    console.error("[Sentinel] PagerDuty alert failed:", (error as Error).message);
    // Non-blocking: exits still proceed
  }
}
