import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'

export interface AuthRequest extends Request {
    deviceId?: string
    tokenHash?: string
}

export async function authMiddleware(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    const authHeader = req.headers.authorization

    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing or malformed Authorization header' })
        return
    }

    const token = authHeader.slice(7)

    try {
        const secret = process.env.JWT_SECRET
        if (!secret) throw new Error('JWT_SECRET not configured')

        // Verify signature + expiry
        jwt.verify(token, secret)

        // Hash the token to look up / create the device record
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

        // Upsert device — first time we see this token, create a record
        const device = await prisma.userDevice.upsert({
            where: { tokenHash },
            update: { lastSeenAt: new Date() },
            create: { tokenHash },
        })

        req.deviceId = device.id
        req.tokenHash = tokenHash

        next()
    } catch (err) {
        logger.warn('Auth failed:', err instanceof Error ? err.message : err)
        res.status(401).json({ error: 'Invalid or expired token' })
    }
}