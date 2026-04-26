import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { scanRateLimit } from "../middleware/rateLimit";
import {
    handleScan,
    handleGenerateToken,
    handleGetHistory,
    handleGetStats,
} from "../controllers/scan.controller";

const router = Router();

// ── Public ────────────────────────────────────────────────────────────────────
router.post("/auth/device", handleGenerateToken);
router.get("/health", (_, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

// ── Protected ─────────────────────────────────────────────────────────────────
router.use(authMiddleware);

router.post("/scan", scanRateLimit, handleScan);
router.get("/history", handleGetHistory);
router.get("/stats", handleGetStats);

export default router;
