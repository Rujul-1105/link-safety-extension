import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { scanRateLimit } from '../middleware/rateLimit'
import { handleScan, handleGenerateToken, handleGetHistory } from '../controllers/scan.controller'

const router = Router()

// Public — no auth needed
// Extension calls this once on first install to get its device token
router.post('/auth/device', handleGenerateToken)

// Health check
router.get('/health', (_, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Protected routes — require JWT
router.use(authMiddleware)

router.post('/scan', scanRateLimit, handleScan)
router.get('/history', handleGetHistory)

export default router