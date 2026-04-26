import { Server as HTTPServer } from "http";
import { Server as IOServer, Socket } from "socket.io";
import { logger } from "./logger";

let io: IOServer | null = null;

// Map: deviceId → Set of socket IDs connected for that device
const deviceSockets = new Map<string, Set<string>>();

export function initSocketIO(httpServer: HTTPServer): IOServer {
    io = new IOServer(httpServer, {
        cors: {
            origin: (origin, cb) => {
                if (
                    !origin ||
                    origin.startsWith("chrome-extension://") ||
                    process.env.NODE_ENV === "development"
                ) {
                    cb(null, true);
                } else {
                    cb(new Error("Not allowed"));
                }
            },
            methods: ["GET", "POST"],
        },
        transports: ["websocket", "polling"],
    });

    io.on("connection", (socket: Socket) => {
        logger.debug(`Socket connected: ${socket.id}`);

        // Extension identifies itself with its device token hash
        socket.on("identify", (deviceId: string) => {
            if (!deviceSockets.has(deviceId)) {
                deviceSockets.set(deviceId, new Set());
            }
            deviceSockets.get(deviceId)!.add(socket.id);
            socket.join(`device:${deviceId}`);
            logger.debug(`Socket ${socket.id} identified as device ${deviceId.slice(0, 8)}...`);
        });

        socket.on("disconnect", () => {
            // Clean up device → socket mapping
            for (const [deviceId, sockets] of deviceSockets.entries()) {
                sockets.delete(socket.id);
                if (sockets.size === 0) deviceSockets.delete(deviceId);
            }
            logger.debug(`Socket disconnected: ${socket.id}`);
        });
    });

    logger.info("Socket.io initialized");
    return io;
}

// Push a threat result to a specific device
export function pushThreatResult(deviceId: string, jobId: string, report: unknown): void {
    if (!io) return;
    io.to(`device:${deviceId}`).emit("threat:result", { jobId, report });
    logger.debug(`Pushed threat:result to device ${deviceId.slice(0, 8)}...`);
}

// Push a proactive threat alert (e.g. known-bad domain visited)
export function pushThreatAlert(deviceId: string, alert: unknown): void {
    if (!io) return;
    io.to(`device:${deviceId}`).emit("threat:alert", alert);
}

export function getIO(): IOServer | null {
    return io;
}
