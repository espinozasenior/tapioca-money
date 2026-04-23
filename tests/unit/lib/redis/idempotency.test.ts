import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCache } = vi.hoisted(() => ({
  mockCache: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    setNX: vi.fn(),
    eval: vi.fn(),
  },
}));

vi.mock("@/lib/redis/client", () => ({
  getCacheInterface: vi.fn(() => Promise.resolve(mockCache)),
}));

import { IdempotencyBusyError, withIdempotencyKey } from "@/lib/redis/idempotency";

describe("withIdempotencyKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCache.get.mockResolvedValue(null);
    mockCache.setNX.mockResolvedValue(true);
    mockCache.set.mockResolvedValue(undefined);
    mockCache.del.mockResolvedValue(undefined);
  });

  it("runs the handler exactly once on first call", async () => {
    const fn = vi.fn().mockResolvedValue({ status: 200, body: { success: true } });

    const out = await withIdempotencyKey("user-1", "key-1", fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ status: 200, body: { success: true } });
    expect(mockCache.setNX).toHaveBeenCalledWith(
      expect.stringContaining("transfer:idem:user-1:key-1:lock"),
      "1",
      expect.any(Number)
    );
    expect(mockCache.set).toHaveBeenCalledWith(
      "transfer:idem:user-1:key-1",
      JSON.stringify({ status: 200, body: { success: true } }),
      expect.any(Number)
    );
  });

  it("returns cached response on second call without running handler", async () => {
    mockCache.get.mockResolvedValueOnce(
      JSON.stringify({ status: 200, body: { success: true, hash: "0xcached" } })
    );
    const fn = vi.fn();

    const out = await withIdempotencyKey("user-1", "key-1", fn);

    expect(fn).not.toHaveBeenCalled();
    expect(out).toEqual({ status: 200, body: { success: true, hash: "0xcached" } });
  });

  it("throws IdempotencyBusyError when another worker holds the lock", async () => {
    mockCache.setNX.mockResolvedValueOnce(false);
    const fn = vi.fn();

    await expect(withIdempotencyKey("user-1", "key-1", fn)).rejects.toBeInstanceOf(
      IdempotencyBusyError
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it("scopes keys per userId so collisions across users are impossible", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: true });

    await withIdempotencyKey("alice", "shared-key", fn);
    await withIdempotencyKey("bob", "shared-key", fn);

    const setCalls = mockCache.set.mock.calls.map((c) => c[0]);
    expect(setCalls).toContain("transfer:idem:alice:shared-key");
    expect(setCalls).toContain("transfer:idem:bob:shared-key");
  });

  it("releases the lock on handler error so next call can retry", async () => {
    const err = new Error("boom");
    const fn = vi.fn().mockRejectedValue(err);

    await expect(withIdempotencyKey("user-1", "key-1", fn)).rejects.toThrow("boom");
    expect(mockCache.del).toHaveBeenCalledWith(
      expect.stringContaining("transfer:idem:user-1:key-1:lock")
    );
  });

  it("re-executes if cached JSON is corrupt", async () => {
    mockCache.get.mockResolvedValueOnce("{not json");
    const fn = vi.fn().mockResolvedValue({ ok: true });

    const out = await withIdempotencyKey("user-1", "key-1", fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ ok: true });
  });
});
