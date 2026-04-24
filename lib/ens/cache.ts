/**
 * Tiny LRU cache for ENS / Basename resolutions.
 * 50 entries, 5-minute TTL (see tasks/architecture-usdc-send.md §11).
 * Kept intentionally dependency-free; this lib is imported into the client bundle.
 */

export interface LRUOptions {
  max?: number;
  ttlMs?: number;
}

interface Entry<V> {
  value: V;
  expiresAt: number;
}

export class LRU<V> {
  private readonly max: number;
  private readonly ttlMs: number;
  private readonly map = new Map<string, Entry<V>>();

  constructor(opts: LRUOptions = {}) {
    this.max = opts.max ?? 50;
    this.ttlMs = opts.ttlMs ?? 5 * 60 * 1000;
  }

  get(key: string): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    // Refresh recency.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    if (this.map.size > this.max) {
      // Evict oldest.
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) this.map.delete(firstKey);
    }
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
