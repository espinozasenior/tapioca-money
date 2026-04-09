import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Action, ExitResult } from "@/sentinel/types";

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

const testAction: Action = {
  type: "EXIT",
  reason: "DEPEG",
  vaultAddress: "0xVault" as `0x${string}`,
  protocol: "morpho",
  signalType: "DEX_PRICE",
  value: 0.04,
};

const testResult: ExitResult = {
  userAddress: "0xUser1",
  status: "SUCCESS",
  txHash: "0xTxHash123",
  shares: "1000000",
};

describe("PagerDuty notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test #20
  it("pagerduty-payload-format", async () => {
    const { sendPagerDutyAlert } = await import("@/sentinel/notifications/pagerduty");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "success" }),
    });

    await sendPagerDutyAlert(testAction, [testResult], "test-routing-key");

    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://events.pagerduty.com/v2/enqueue");

    const body = JSON.parse(options.body);
    expect(body.routing_key).toBe("test-routing-key");
    expect(body.event_action).toBe("trigger");
    expect(body.payload.severity).toBe("critical"); // EXIT = critical
    expect(body.payload.summary).toContain("DEPEG");
    expect(body.payload.summary).toContain("0xVault");
    expect(body.payload.custom_details.affected_users).toBe(1);
    expect(body.payload.custom_details.exits_success).toBe(1);
    expect(body.dedup_key).toContain("sentinel-0xVault-DEX_PRICE");
  });
});

describe("Resend notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test #21
  it("resend-email-contains-exit-details", async () => {
    const { sendUserEmail } = await import("@/sentinel/notifications/resend");

    mockFetch.mockResolvedValueOnce({ ok: true });

    await sendUserEmail("user@example.com", testAction, testResult, "test-api-key");

    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");

    const body = JSON.parse(options.body);
    expect(body.to).toBe("user@example.com");
    expect(body.subject).toContain("Emergency exit");
    expect(body.html).toContain("0xVault");
    expect(body.html).toContain("0xTxHash123");
    expect(body.html).toContain("1000000");
  });

  // Test #22
  it("notification-failure-does-not-block-exit", async () => {
    const { sendPagerDutyAlert } = await import("@/sentinel/notifications/pagerduty");

    // PagerDuty returns 500
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    // Should not throw
    await expect(sendPagerDutyAlert(testAction, [testResult], "test-key")).resolves.toBeUndefined();
  });
});
