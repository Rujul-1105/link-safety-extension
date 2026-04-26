import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { scanUrl, hashUrl } from "../services/scan.service";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { redis, cacheGet, cacheSet, scanCacheKey } from "../lib/redis";
import { scanQueue } from "../lib/queue";
import { pushThreatResult } from "../lib/socket";
import { ThreatReport, ScanRequest } from "../types";
import jwt from "jsonwebtoken";

// ─── POST /api/scan ───────────────────────────────────────────────────────────

export async function handleScan(req: AuthRequest, res: Response): Promise<void> {
    const { url, mlScore }: ScanRequest = req.body;

    if (!url || typeof url !== "string") {
        res.status(400).json({ error: "url is required" });
        return;
    }

    try {
        new URL(url);
    } catch {
        res.status(400).json({ error: "Invalid URL format" });
        return;
    }

    const urlHash = hashUrl(url);
    const cacheKey = scanCacheKey(urlHash);

    try {
        // ── 1. Redis cache check (fastest path ~1ms) ──────────────────────────
        const cached = await cacheGet<ThreatReport>(cacheKey);
        if (cached) {
            logger.debug(`Redis HIT: ${url}`);
            await redis.incr("stats:cache_hits"); // ← add this line
            res.json({ ...cached, fromCache: true });
            return;
        }
        // ── 2. DB cache check (24h window) ────────────────────────────────────
        const recentDB = await prisma.scanResult.findFirst({
            where: {
                urlHash,
                createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
            orderBy: { createdAt: "desc" },
        });

        if (recentDB) {
            logger.debug(`DB HIT: ${url}`);
            const report: ThreatReport = {
                url: recentDB.url,
                score: recentDB.score,
                level: recentDB.level as ThreatReport["level"],
                recommendation: recentDB.recommendation as ThreatReport["recommendation"],
                mlScore: recentDB.mlScore,
                signals: recentDB.signals as any,
                cachedAt: recentDB.createdAt.getTime(),
                scanDurationMs: recentDB.scanDurationMs ?? undefined,
            };
            // Backfill Redis so next hit is instant
            await cacheSet(cacheKey, report);
            res.json({ ...report, fromCache: true });
            return;
        }

        // ── 3. Cache miss — enqueue async job ─────────────────────────────────
        const job = await scanQueue.add("scan", {
            url,
            mlScore: mlScore ?? 0,
            deviceId: req.deviceId!,
            jobId: "", // filled below
        });

        // Update the jobId field with the real BullMQ job ID
        await job.updateData({ ...(job.data as any), jobId: job.id! });

        logger.info(`Enqueued scan job ${job.id} for ${url}`);

        // Respond immediately — extension listens on WebSocket for the result
        res.json({
            status: "queued",
            jobId: job.id,
            message: "Scan queued — result will be pushed via WebSocket",
        });
    } catch (err) {
        logger.error("Scan error:", err);
        res.status(500).json({
            error: "Scan failed",
            detail: err instanceof Error ? err.message : "Unknown",
        });
    }
}

// ─── POST /api/auth/device ────────────────────────────────────────────────────

export async function handleGenerateToken(_req: AuthRequest, res: Response): Promise<void> {
    const secret = process.env.JWT_SECRET!;
    const token = jwt.sign({ type: "device", createdAt: Date.now() }, secret, {
        expiresIn: "365d",
    });
    res.json({ token });
}

// ─── GET /api/history ─────────────────────────────────────────────────────────

export async function handleGetHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
        const results = await prisma.scanResult.findMany({
            where: { deviceId: req.deviceId },
            orderBy: { createdAt: "desc" },
            take: 100,
            select: {
                url: true,
                score: true,
                level: true,
                recommendation: true,
                signals: true,
                createdAt: true,
                scanDurationMs: true,
            },
        });
        res.json({ results });
    } catch {
        res.status(500).json({ error: "Failed to fetch history" });
    }
}

// ─── GET /api/stats ───────────────────────────────────────────────────────────

export async function handleGetStats(req: AuthRequest, res: Response): Promise<void> {
    try {
        const [totalScans, threatsBlocked, avgScore] = await Promise.all([
            prisma.scanResult.count({ where: { deviceId: req.deviceId } }),
            prisma.scanResult.count({ where: { deviceId: req.deviceId, score: { gt: 65 } } }),
            prisma.scanResult.aggregate({
                where: { deviceId: req.deviceId },
                _avg: { score: true },
            }),
        ]);

        // Redis cache hit rate
        const [hits, misses] = await Promise.all([
            redis.get("stats:cache_hits"),
            redis.get("stats:cache_misses"),
        ]);
        const hitCount = parseInt(hits ?? "0");
        const missCount = parseInt(misses ?? "0");
        const total = hitCount + missCount;
        const hitRate = total > 0 ? Math.round((hitCount / total) * 100) : 0;

        res.json({
            totalScans,
            threatsBlocked,
            avgScore: Math.round(avgScore._avg.score ?? 0),
            cacheHitRate: hitRate,
        });
    } catch {
        res.status(500).json({ error: "Failed to fetch stats" });
    }
}
