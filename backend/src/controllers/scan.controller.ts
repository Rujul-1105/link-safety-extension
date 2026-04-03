import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { scanUrl, hashUrl } from '../services/scan.service'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'
import { ScanRequest } from '../types'

export async function handleScan(req: AuthRequest, res: Response): Promise<void> {
    const { url, mlScore }: ScanRequest = req.body

    // Validate input
    if (!url || typeof url !== 'string') {
        res.status(400).json({ error: 'url is required' })
        return
    }

    try {
        new URL(url)
    } catch {
        res.status(400).json({ error: 'Invalid URL format' })
        return
    }

    const urlHash = hashUrl(url)

    try {
        // Check if we already have a recent result in the DB (last 24 hours)
        const recent = await prisma.scanResult.findFirst({
            where: {
                urlHash,
                createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
            orderBy: { createdAt: 'desc' },
        })

        if (recent) {
            logger.debug(`DB cache hit for ${url}`)
            res.json({
                ...recent.signals as object,
                url: recent.url,
                score: recent.score,
                level: recent.level,
                recommendation: recent.recommendation,
                mlScore: recent.mlScore,
                signals: recent.signals,
                cachedAt: recent.createdAt.getTime(),
                fromCache: true,
            })
            return
        }

        // Run full scan
        const report = await scanUrl({ url, mlScore: mlScore ?? 0 })

        // Persist result
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
                deviceId: req.deviceId!,
            },
        })

        // Update device scan count
        await prisma.userDevice.update({
            where: { id: req.deviceId },
            data: { scanCount: { increment: 1 } },
        })

        // If HIGH or CRITICAL — upsert into FlaggedDomain
        if (report.score > 65) {
            const hostname = new URL(url).hostname
            await prisma.flaggedDomain.upsert({
                where: { domain: hostname },
                update: { score: report.score, reportCount: { increment: 1 }, updatedAt: new Date() },
                create: { domain: hostname, score: report.score, reason: report.signals[0]?.detail ?? 'High risk score' },
            })
        }

        res.json({ ...report, fromCache: false })
    } catch (err) {
        logger.error('Scan error:', err)
        res.status(500).json({ error: 'Scan failed', detail: err instanceof Error ? err.message : 'Unknown error' })
    }
}

export async function handleGenerateToken(req: AuthRequest, res: Response): Promise<void> {
    // This endpoint is called by the extension on first install to get a device JWT
    // It's the only unauthenticated endpoint
    import('jsonwebtoken').then(({ default: jwt }) => {
        const secret = process.env.JWT_SECRET!
        const token = jwt.sign(
            { type: 'device', createdAt: Date.now() },
            secret,
            { expiresIn: '365d' }
        )
        res.json({ token })
    })
}

export async function handleGetHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
        const results = await prisma.scanResult.findMany({
            where: { deviceId: req.deviceId },
            orderBy: { createdAt: 'desc' },
            take: 100,
            select: {
                url: true,
                score: true,
                level: true,
                recommendation: true,
                signals: true,
                createdAt: true,
            },
        })
        res.json({ results })
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch history' })
    }
}