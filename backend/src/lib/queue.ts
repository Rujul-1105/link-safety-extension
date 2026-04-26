import { Queue, Worker, Job } from "bullmq";
import { bullRedis } from "./redis";
import { logger } from "./logger";

// ─── Job types ────────────────────────────────────────────────────────────────

export interface ScanJobData {
    url: string;
    mlScore: number;
    deviceId: string;
    jobId: string;
}

export interface ScanJobResult {
    jobId: string;
    report: unknown;
}

// ─── Queue ────────────────────────────────────────────────────────────────────

export const scanQueue = new Queue("scan", {
    connection: bullRedis,
    defaultJobOptions: {
        attempts: 2, // retry once on failure
        backoff: { type: "fixed", delay: 2000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 50 },
        // timeout: 30000, // 30s max per job - removed as unsupported in BullMQ 5.76
    },
});

scanQueue.on("error", (err) => logger.error("Queue error:", err.message));

// ─── Worker factory ───────────────────────────────────────────────────────────
// Called once from index.ts — keeps worker in same process for simplicity

let workerInstance: Worker | null = null;

export function startScanWorker(
    processor: (job: Job<ScanJobData>) => Promise<ScanJobResult>
): Worker {
    if (workerInstance) return workerInstance;

    workerInstance = new Worker<ScanJobData, ScanJobResult>("scan", processor, {
        connection: bullRedis,
        concurrency: 5, // process up to 5 scans simultaneously
    });

    workerInstance.on("completed", (job) => {
        logger.debug(`Job ${job.id} completed`);
    });

    workerInstance.on("failed", (job, err) => {
        logger.warn(`Job ${job?.id} failed: ${err.message}`);
    });

    workerInstance.on("error", (err) => {
        logger.error("Worker error:", err.message);
    });

    logger.info("BullMQ scan worker started (concurrency: 5)");
    return workerInstance;
}
