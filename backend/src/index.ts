import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import { globalRateLimit } from './middleware/rateLimit'
import apiRouter from './routes/api'
import { logger } from './lib/logger'
import { prisma } from './lib/prisma'

dotenv.config()

const app = express()
const PORT = process.env.PORT ?? 3001

// ── Security headers ─────────────────────────────────────────────────────────
app.use(helmet())

// ── CORS — only allow extension origin ───────────────────────────────────────
app.use(cors({
    origin: (origin, callback) => {
        // Chrome extensions have a chrome-extension:// origin
        // Allow requests with no origin (server-to-server) and extension origins
        if (!origin || origin.startsWith('chrome-extension://')) {
            callback(null, true)
        } else if (process.env.NODE_ENV === 'development') {
            callback(null, true)  // allow all in dev
        } else {
            callback(new Error('Not allowed by CORS'))
        }
    },
    credentials: true,
}))

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }))

// ── Global rate limit ─────────────────────────────────────────────────────────
app.use(globalRateLimit)

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api', apiRouter)

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Unhandled error:', err.message)
    res.status(500).json({ error: 'Internal server error' })
})

// ── Start ─────────────────────────────────────────────────────────────────────
async function start() {
    try {
        await prisma.$connect()
        logger.info('PostgreSQL connected')

        app.listen(PORT, () => {
            logger.info(`NetGuard API running on http://localhost:${PORT}`)
            logger.info(`Environment: ${process.env.NODE_ENV}`)
        })
    } catch (err) {
        logger.error('Failed to start:', err)
        process.exit(1)
    }
}

start()