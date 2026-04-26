import Redis from "ioredis";
import { logger } from "./logger";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// Main client — for caching
export const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
});

// Separate client for BullMQ — BullMQ needs its own connection
export const bullRedis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null, // BullMQ requires this
    enableReadyCheck: false,
    lazyConnect: true,
});

redis.on("connect", () => logger.info("Redis connected"));
redis.on("error", (err) => logger.error("Redis error:", err.message));

export const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 hours

// ─── Cache helpers ────────────────────────────────────────────────────────────

export async function cacheGet<T>(key: string): Promise<T | null> {
    try {
        const raw = await redis.get(key);
        if (!raw) return null;
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

export async function cacheSet(
    key: string,
    value: unknown,
    ttlSeconds = CACHE_TTL_SECONDS
): Promise<void> {
    try {
        await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (err) {
        logger.warn("Cache set failed:", err);
    }
}

export async function cacheDel(key: string): Promise<void> {
    try {
        await redis.del(key);
    } catch {}
}

export function scanCacheKey(urlHash: string): string {
    return `scan:${urlHash}`;
}
