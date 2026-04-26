import rateLimit, { ipKeyGenerator } from 'express-rate-limit'

// Per-IP: 100 requests per 15 minutes
export const globalRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please slow down' },
})

// Per-IP: tighter limit for scan endpoint — 30 scans per minute
export const scanRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Scan rate limit exceeded' },
    keyGenerator: (req, res) => {
        // Key by IP + device token combo for better granularity
        const ip = req.ip ?? req.socket.remoteAddress ?? '';
        return ipKeyGenerator(ip) + '_' + (req.headers.authorization ?? '')
    },
})