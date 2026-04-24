import { describe, it, expect, beforeEach, vi } from "vitest";
import { LRU } from "@/lib/ens/cache";

describe("LRU cache", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("returns undefined for missing keys", () => {
    const c = new LRU<string>();
    expect(c.get("nope")).toBeUndefined();
  });

  it("stores and retrieves a value", () => {
    const c = new LRU<string>();
    c.set("alice", "0xalice");
    expect(c.get("alice")).toBe("0xalice");
  });

  it("evicts the oldest entry when max is exceeded", () => {
    const c = new LRU<number>({ max: 2 });
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3); // evicts "a"
    expect(c.get("a")).toBeUndefined();
    expect(c.get("b")).toBe(2);
    expect(c.get("c")).toBe(3);
  });

  it("refreshes recency on get so frequent reads stay in cache", () => {
    const c = new LRU<number>({ max: 2 });
    c.set("a", 1);
    c.set("b", 2);
    // Touch "a" so it becomes most-recently-used.
    c.get("a");
    c.set("c", 3); // should now evict "b", not "a"
    expect(c.get("a")).toBe(1);
    expect(c.get("b")).toBeUndefined();
  });

  it("expires entries after TTL", () => {
    vi.useFakeTimers();
    const c = new LRU<string>({ ttlMs: 1000 });
    c.set("k", "v");
    vi.advanceTimersByTime(999);
    expect(c.get("k")).toBe("v");
    vi.advanceTimersByTime(2);
    expect(c.get("k")).toBeUndefined();
  });
});
