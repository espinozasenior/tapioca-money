import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Action, ExitResult } from "@/sentinel/types";

// Test #26: Full PagerDuty integration

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe("Integration: PagerDuty Alert Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("full-trigger-exit-pagerduty-receives-correct-alert", async () => {
    const { sendPagerDutyAlert } = await import("@/sentinel/notifications/pagerduty");

    const action: Action = {
      type: "EXIT",
      reason: "DEPEG",
      vaultAddress: "0xAffectedVault" as `0x${string}`,
      protocol: "morpho",
      signalType: "DEX_PRICE",
      value: 0.055, // 5.5% depeg
    };

    const results: ExitResult[] = [
      { userAddress: "0xUser1", status: "SUCCESS", txHash: "0xTx1", shares: "500" },
      { userAddress: "0xUser2", status: "SUCCESS", txHash: "0xTx2", shares: "300" },
      { userAddress: "0xUser3", status: "FAILED", error: "AA22 expired" },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "success", dedup_key: "abc" }),
    });

    await sendPagerDutyAlert(action, results, "routing-key-123");

    expect(mockFetch).toHaveBeenCalledTimes(1);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);

    // Validate Events API v2 payload structure
    expect(body.routing_key).toBe("routing-key-123");
    expect(body.event_action).toBe("trigger");
    expect(body.payload.severity).toBe("critical");
    expect(body.payload.source).toBe("sentinel-worker");
    expect(body.payload.component).toBe("morpho");
    expect(body.payload.group).toBe("0xAffectedVault");

    // Custom details should reflect actual results
    expect(body.payload.custom_details.affected_users).toBe(3);
    expect(body.payload.custom_details.exits_success).toBe(2);
    expect(body.payload.custom_details.exits_failed).toBe(1);
  });
});
