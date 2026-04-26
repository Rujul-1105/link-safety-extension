import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { globalRateLimit } from "./middleware/rateLimit";
import apiRouter from "./routes/api";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { redis, bullRedis } from "./lib/redis";
import { initSocketIO } from "./lib/socket";
import { scanQueue, startScanWorker } from "./lib/queue";
import { processScanJob } from "./workers/scan.worker";

const app = express();
const PORT = process.env.PORT ?? 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(
    cors({
        origin: (origin, cb) => {
            if (
                !origin ||
                origin.startsWith("chrome-extension://") ||
                process.env.NODE_ENV === "development"
            ) {
                cb(null, true);
            } else {
                cb(new Error("Not allowed by CORS"));
            }
        },
        credentials: true,
    })
);
app.use(express.json({ limit: "10kb" }));
app.use(globalRateLimit);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api", apiRouter);

// ── 404 + error handlers ──────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Not found" }));
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error("Unhandled error:", err.message);
    res.status(500).json({ error: "Internal server error" });
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function start() {
    try {
        // Connect all services
        await prisma.$connect();
        logger.info("PostgreSQL connected");

        if (redis.status === 'wait') await redis.connect();
        if (bullRedis.status === 'wait') await bullRedis.connect();
        logger.info("Redis initialized");

        // Create HTTP server (needed for Socket.io to share the port)
        const httpServer = http.createServer(app);

        // Init Socket.io on the same HTTP server
        initSocketIO(httpServer);

        // Start BullMQ worker — processes jobs from the scan queue
        startScanWorker(processScanJob);

        // Start listening
        httpServer.listen(PORT, () => {
            logger.info(`NetGuard API running on http://localhost:${PORT}`);
            logger.info(`WebSocket ready on ws://localhost:${PORT}`);
            logger.info(`Environment: ${process.env.NODE_ENV}`);
        });

        // Graceful shutdown
        const shutdown = async (signal: string) => {
            logger.info(`${signal} received — shutting down`);
            await scanQueue.close();
            await redis.quit();
            await bullRedis.quit();
            await prisma.$disconnect();
            process.exit(0);
        };

        process.on("SIGTERM", () => shutdown("SIGTERM"));
        process.on("SIGINT", () => shutdown("SIGINT"));
    } catch (err) {
        logger.error("Failed to start:", err);
        process.exit(1);
    }
}

start();
