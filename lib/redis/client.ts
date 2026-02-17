/**
 * Redis Client Singleton
 *
 * Provides a singleton Redis client for rate limiting, caching,
 * and other distributed state needs.
 *
 * Uses ioredis for robust connection handling and cluster support.
 * Falls back to in-memory storage in development if Redis is not configured.
 *
 * NOTE: ioredis is an optional dependency. Install with:
 * pnpm add ioredis @types/ioredis
 */

// Redis client type (optional dependency)
type RedisType = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<string>;
  setex(key: string, seconds: number, value: string): Promise<string>;
  del(key: string | string[]): Promise<number>;
  zadd(key: string, score: number, member: string): Promise<number>;
  zrangebyscore(key: string, min: number | string, max: number | string): Promise<string[]>;
  zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number>;
  zcard(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  connect(): Promise<void>;
  quit(): Promise<string>;
  on(event: string, callback: (...args: any[]) => void): void;
};

// Lazy import to avoid bundling issues in edge runtime
let Redis: any;
let redisClient: RedisType | null = null;

// In-memory fallback for development/testing
const memoryStore = new Map<string, { value: string; expiry?: number }>();

export interface RedisClientOptions {
  url?: string;
  maxRetries?: number;
  connectTimeout?: number;
}

/**
 * Get or create Redis client singleton
 */
export async function getRedisClient(): Promise<RedisType | null> {
  const redisUrl = process.env.REDIS_URL;

  // Return null if Redis is not configured
  if (!redisUrl) {
    console.warn('[Redis] REDIS_URL not configured, using in-memory fallback');
    return null;
  }

  // Return existing client if already connected
  if (redisClient) {
    return redisClient;
  }

  try {
    // Dynamically import ioredis (optional dependency)
    // @ts-ignore - ioredis is optional, types may not be available
    const ioredis = await import('ioredis');
    Redis = ioredis.default;

    const options = {
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
      lazyConnect: true,
      enableReadyCheck: true,
      // Reconnect with exponential backoff
      retryStrategy: (times: number) => {
        if (times > 10) {
          console.error('[Redis] Max retries exceeded');
          return null;
        }
        return Math.min(times * 100, 3000);
      },
    };

    // Parse URL with modern API to avoid DEP0169 url.parse() deprecation in ioredis
    const parsedUrl = new URL(redisUrl);
    redisClient = new Redis({
      host: parsedUrl.hostname,
      port: parseInt(parsedUrl.port || '6379'),
      password: parsedUrl.password || undefined,
      username: parsedUrl.username || undefined,
      db: parsedUrl.pathname ? parseInt(parsedUrl.pathname.slice(1)) || 0 : 0,
      tls: parsedUrl.protocol === 'rediss:' ? {} : undefined,
      ...options,
    }) as RedisType;

    // Set up event handlers
    redisClient.on('connect', () => {
      console.log('[Redis] Connected');
    });

    redisClient.on('error', (err: Error) => {
      console.error('[Redis] Connection error:', err.message);
    });

    redisClient.on('close', () => {
      console.log('[Redis] Connection closed');
    });

    // Connect
    await redisClient.connect();

    return redisClient;
  } catch (error: any) {
    console.error('[Redis] Failed to initialize:', error.message);
    return null;
  }
}

/**
 * Close Redis connection (for cleanup)
 */
export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

/**
 * Redis-like interface that works with both Redis and in-memory fallback
 */
export interface CacheInterface {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  zadd(key: string, score: number, member: string): Promise<void>;
  zrangebyscore(key: string, min: number, max: number): Promise<string[]>;
  zremrangebyscore(key: string, min: number, max: number): Promise<void>;
  zcard(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
}

/**
 * Get cache interface (Redis if available, in-memory fallback otherwise)
 */
export async function getCacheInterface(): Promise<CacheInterface> {
  const redis = await getRedisClient();

  if (redis) {
    return {
      async get(key: string) {
        return redis.get(key);
      },
      async set(key: string, value: string, ttlSeconds?: number) {
        if (ttlSeconds) {
          await redis.setex(key, ttlSeconds, value);
        } else {
          await redis.set(key, value);
        }
      },
      async del(key: string) {
        await redis.del(key);
      },
      async zadd(key: string, score: number, member: string) {
        await redis.zadd(key, score, member);
      },
      async zrangebyscore(key: string, min: number, max: number) {
        return redis.zrangebyscore(key, min, max);
      },
      async zremrangebyscore(key: string, min: number, max: number) {
        await redis.zremrangebyscore(key, min, max);
      },
      async zcard(key: string) {
        return redis.zcard(key);
      },
      async expire(key: string, seconds: number) {
        await redis.expire(key, seconds);
      },
    };
  }

  // In-memory fallback implementation
  return {
    async get(key: string) {
      const item = memoryStore.get(key);
      if (!item) return null;
      if (item.expiry && item.expiry < Date.now()) {
        memoryStore.delete(key);
        return null;
      }
      return item.value;
    },
    async set(key: string, value: string, ttlSeconds?: number) {
      const expiry = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
      memoryStore.set(key, { value, expiry });
    },
    async del(key: string) {
      memoryStore.delete(key);
    },
    async zadd(key: string, score: number, member: string) {
      const setKey = `zset:${key}`;
      const existing = memoryStore.get(setKey);
      const set: Map<string, number> = existing
        ? new Map(JSON.parse(existing.value) as [string, number][])
        : new Map();
      set.set(member, score);
      memoryStore.set(setKey, {
        value: JSON.stringify(Array.from(set.entries())),
      });
    },
    async zrangebyscore(key: string, min: number, max: number) {
      const setKey = `zset:${key}`;
      const existing = memoryStore.get(setKey);
      if (!existing) return [];
      const entries: [string, number][] = JSON.parse(existing.value);
      return entries
        .filter(([_, score]) => score >= min && score <= max)
        .map(([member]) => member);
    },
    async zremrangebyscore(key: string, min: number, max: number) {
      const setKey = `zset:${key}`;
      const existing = memoryStore.get(setKey);
      if (!existing) return;
      const entries: [string, number][] = JSON.parse(existing.value);
      const filtered = entries.filter(
        ([_, score]) => score < min || score > max
      );
      memoryStore.set(setKey, {
        value: JSON.stringify(filtered),
      });
    },
    async zcard(key: string) {
      const setKey = `zset:${key}`;
      const existing = memoryStore.get(setKey);
      if (!existing) return 0;
      const entries: [string, number][] = JSON.parse(existing.value);
      return entries.length;
    },
    async expire(key: string, seconds: number) {
      const item = memoryStore.get(key);
      if (item) {
        item.expiry = Date.now() + seconds * 1000;
        memoryStore.set(key, item);
      }
    },
  };
}
