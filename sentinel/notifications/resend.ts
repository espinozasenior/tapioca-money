/**
 * Sentinel v0 — Resend Email Notifications
 *
 * Sends user-facing email notifications for exit events and alerts.
 * Uses Resend's HTTP API directly (no SDK dependency needed).
 */

import type { Action, ExitResult } from "../types";

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "Tapioca Finance <alerts@tapioca.finance>";

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

function exitSubject(action: Action): string {
  return `[Tapioca] Emergency exit executed — ${action.reason}`;
}

function alertSubject(action: Action): string {
  return `[Tapioca] Alert — ${action.reason} detected`;
}

function exitBody(action: Action, result: ExitResult): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">Emergency Exit Executed</h2>
      <p>Sentinel detected a risk signal and automatically exited your position.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Vault</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${action.vaultAddress}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Protocol</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${action.protocol || "unknown"}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Trigger</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${action.reason}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Signal Value</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${action.value}</td></tr>
        ${result.txHash ? `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Transaction</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;"><a href="https://basescan.org/tx/${result.txHash}">${result.txHash.slice(0, 10)}...</a></td></tr>` : ""}
        ${result.shares ? `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Shares Redeemed</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${result.shares}</td></tr>` : ""}
      </table>
      <p style="color: #666; font-size: 14px;">Your funds have been redeemed to your wallet. No further action is required.</p>
      <p style="color: #666; font-size: 12px;">Sentinel is Tapioca's automated safety system. It monitors vault health and exits positions when danger is detected.</p>
    </div>
  `;
}

function alertBody(action: Action): string {
  const isToxico = action.reason === "TOXIC_UNDERLYING_DEPEG";

  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #f59e0b;">Safety Alert${isToxico ? " — Manual Action Required" : ""}</h2>
      <p>${
        isToxico
          ? "Sentinel detected a depeg in the underlying asset of your vault. Automated exit was not performed because redeeming would give you the depegged asset. Manual action is recommended."
          : "Sentinel detected a safety signal on a vault where you have a position."
      }</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Vault</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${action.vaultAddress}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Trigger</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${action.reason}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Signal Value</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${action.value}</td></tr>
      </table>
      <p style="color: #666; font-size: 14px;">Please review your position and take appropriate action.</p>
    </div>
  `;
}

function failedExitBody(action: Action, result: ExitResult): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">Exit Failed — Manual Action Required</h2>
      <p>Sentinel attempted to exit your position but the transaction failed.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Vault</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${action.vaultAddress}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Trigger</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${action.reason}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Error</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${result.error || "Unknown error"}</td></tr>
      </table>
      <p style="color: #dc2626; font-weight: bold;">Please withdraw your funds manually as soon as possible.</p>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Send email
// ---------------------------------------------------------------------------

/**
 * Send email notification to a user about a sentinel event.
 * Non-blocking: catches and logs errors without throwing.
 */
export async function sendUserEmail(
  userEmail: string | null,
  action: Action,
  result: ExitResult | null,
  apiKey: string
): Promise<void> {
  if (!userEmail) return;

  let subject: string;
  let html: string;

  if (result?.status === "SUCCESS") {
    subject = exitSubject(action);
    html = exitBody(action, result);
  } else if (result?.status === "FAILED") {
    subject = `[Tapioca] Exit FAILED — manual action required`;
    html = failedExitBody(action, result);
  } else {
    subject = alertSubject(action);
    html = alertBody(action);
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: userEmail,
        subject,
        html,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error(`[Sentinel] Resend returned ${response.status}: ${await response.text()}`);
    }
  } catch (error) {
    console.error("[Sentinel] Resend email failed:", (error as Error).message);
    // Non-blocking: exit execution takes priority
  }
}
