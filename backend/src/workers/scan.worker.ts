import { Job } from "bullmq";
import { ScanJobData, ScanJobResult } from "../lib/queue";
import { scanUrl, hashUrl } from "../services/scan.service";
import { cacheSet, scanCacheKey, redis } from "../lib/redis";
import { pushThreatResult } from "../lib/socket";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { ThreatReport } from "../types";

export async function processScanJob(job: Job<ScanJobData>): Promise<ScanJobResult> {
    const { url, mlScore, deviceId, jobId } = job.data;
    const urlHash = hashUrl(url);

    logger.info(`Worker processing job ${job.id}: ${url}`);

    // ── Run the full scan ──────────────────────────────────────────────────────
    const report = await scanUrl({ url, mlScore });

    // ── Cache in Redis ─────────────────────────────────────────────────────────
    await cacheSet(scanCacheKey(urlHash), report);
    await redis.incr("stats:cache_misses"); // this was a miss, future will be hit

    // ── Persist to PostgreSQL ──────────────────────────────────────────────────
    try {
        await prisma.scanResult.create({
            data: {
                urlHash,
                url,
                score: report.score,
                level: report.level,
                recommendation: report.recommendation,
                mlScore: report.mlScore,
                signals: report.signals as any,
                scanDurationMs: report.scanDurationMs,
                deviceId,
            },
        });

        await prisma.userDevice.update({
            where: { id: deviceId },
            data: { scanCount: { increment: 1 } },
        });

        // Flag high-risk domains
        if (report.score > 65) {
            const hostname = new URL(url).hostname;
            await prisma.flaggedDomain.upsert({
                where: { domain: hostname },
                update: {
                    score: report.score,
                    reportCount: { increment: 1 },
                    updatedAt: new Date(),
                },
                create: {
                    domain: hostname,
                    score: report.score,
                    reason: report.signals[0]?.detail ?? "High risk score",
                },
            });
            logger.warn(`Flagged domain: ${hostname} (score: ${report.score})`);
        }
    } catch (err) {
        // DB failure shouldn't prevent pushing result to extension
        logger.error("DB persist failed:", err);
    }

    // ── Push result to extension via WebSocket ─────────────────────────────────
    pushThreatResult(deviceId, jobId ?? job.id!, report);

    return { jobId: jobId ?? job.id!, report };
}
