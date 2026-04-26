import crypto from 'crypto'
import tls from 'tls'
import https from 'https'
import http from 'http'
import { ThreatReport, ThreatSignal, ScanRequest, scoreToLevel, scoreToRecommendation } from '../types'
import { logger } from '../lib/logger'

// ─── Helper: fetch with timeout ───────────────────────────────────────────────

function fetchWithTimeout(url: string, timeoutMs = 5000): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    return fetch(url, { signal: controller.signal })
        .finally(() => clearTimeout(timer))
}

// ─── Check 1: WHOIS Domain Age ───────────────────────────────────────────────

async function checkDomainAge(hostname: string): Promise<ThreatSignal> {
    try {
        // Use RDAP (modern WHOIS replacement) — no npm package needed
        const rdapUrl = `https://rdap.org/domain/${hostname.split('.').slice(-2).join('.')}`
        const res = await fetchWithTimeout(rdapUrl, 6000)

        if (!res.ok) throw new Error(`RDAP ${res.status}`)

        const data = await res.json() as any
        const events: { eventAction: string; eventDate: string }[] = data.events ?? []
        const reg = events.find(e => e.eventAction === 'registration')

        if (!reg) {
            return { name: 'Domain Age', score: 10, detail: 'Registration date unknown', category: 'networking' }
        }

        const regDate = new Date(reg.eventDate)
        const ageInDays = (Date.now() - regDate.getTime()) / (1000 * 60 * 60 * 24)
        const ageInDaysRounded = Math.floor(ageInDays)

        let score = 0
        let detail = ''

        if (ageInDays < 7) {
            score = 35
            detail = `Domain registered ${ageInDaysRounded} days ago — critical phishing indicator`
        } else if (ageInDays < 30) {
            score = 25
            detail = `Domain registered ${ageInDaysRounded} days ago — very recent, high suspicion`
        } else if (ageInDays < 90) {
            score = 12
            detail = `Domain registered ${ageInDaysRounded} days ago — moderately new`
        } else {
            score = 0
            detail = `Domain registered ${ageInDaysRounded} days ago — established domain`
        }

        return { name: 'Domain Age', score, detail, category: 'networking' }
    } catch (err) {
        logger.debug('WHOIS/RDAP failed:', err)
        return { name: 'Domain Age', score: 5, detail: 'Could not determine registration date', category: 'networking' }
    }
}

// ─── Check 2: TLS Certificate ────────────────────────────────────────────────

async function checkTLSCert(hostname: string): Promise<ThreatSignal> {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            resolve({ name: 'TLS Certificate', score: 5, detail: 'TLS check timed out', category: 'networking' })
        }, 5000)

        try {
            const socket = tls.connect({ host: hostname, port: 443, servername: hostname, rejectUnauthorized: false }, () => {
                clearTimeout(timeout)

                const cert = socket.getPeerCertificate()
                socket.destroy()

                if (!cert || !cert.valid_from) {
                    return resolve({ name: 'TLS Certificate', score: 15, detail: 'No valid TLS certificate found', category: 'networking' })
                }

                const issuedDate = new Date(cert.valid_from)
                const certAgeDays = (Date.now() - issuedDate.getTime()) / (1000 * 60 * 60 * 24)
                const issuer = cert.issuer?.O ?? 'Unknown'
                const isFreeCA = /Let's Encrypt|ZeroSSL|Buypass/i.test(issuer as any)

                let score = 0
                let detail = `Issuer: ${issuer}`

                if (certAgeDays < 3 && isFreeCA) {
                    score = 25
                    detail = `Free CA cert issued ${Math.floor(certAgeDays)} days ago — common on phishing sites`
                } else if (certAgeDays < 7) {
                    score = 15
                    detail = `Certificate issued ${Math.floor(certAgeDays)} days ago — very new`
                } else if (isFreeCA) {
                    score = 3
                    detail = `Free CA (${issuer}) — common but not suspicious on its own`
                } else {
                    score = 0
                    detail = `Valid certificate from ${issuer}, issued ${Math.floor(certAgeDays)} days ago`
                }

                resolve({ name: 'TLS Certificate', score, detail, category: 'networking' })
            })

            socket.on('error', () => {
                clearTimeout(timeout)
                resolve({ name: 'TLS Certificate', score: 20, detail: 'TLS connection failed — no HTTPS', category: 'networking' })
            })
        } catch {
            clearTimeout(timeout)
            resolve({ name: 'TLS Certificate', score: 5, detail: 'TLS check error', category: 'networking' })
        }
    })
}

// ─── Check 3: DNS-over-HTTPS ─────────────────────────────────────────────────

async function checkDoH(hostname: string): Promise<ThreatSignal> {
    try {
        const res = await fetchWithTimeout(
            `https://cloudflare-dns.com/dns-query?name=${hostname}&type=A`,
            5000
        )

        if (!res.ok) throw new Error(`DoH ${res.status}`)

        const data = await res.json() as any
        const answers: { data: string }[] = data.Answer ?? []

        if (answers.length === 0) {
            return { name: 'DNS Resolution', score: 20, detail: 'No DNS A records found — domain may not exist', category: 'networking' }
        }

        // Fast-flux detection: many different IPs = botnet indicator
        const uniqueIPs = new Set(answers.map(a => a.data)).size

        if (uniqueIPs > 6) {
            return { name: 'DNS Resolution', score: 22, detail: `Fast-flux DNS: ${uniqueIPs} IPs detected — botnet indicator`, category: 'networking' }
        }

        return { name: 'DNS Resolution', score: 0, detail: `Resolves to ${uniqueIPs} IP(s) via Cloudflare DoH`, category: 'networking' }
    } catch (err) {
        logger.debug('DoH check failed:', err)
        return { name: 'DNS Resolution', score: 3, detail: 'DNS check unavailable', category: 'networking' }
    }
}

// ─── Check 4: HTTP Header Fingerprinting ─────────────────────────────────────

async function checkHeaders(url: string): Promise<ThreatSignal> {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            resolve({ name: 'Security Headers', score: 5, detail: 'Header check timed out', category: 'headers' })
        }, 6000)

        const protocol = url.startsWith('https') ? https : http
        const urlObj = new URL(url)

        const req = protocol.request(
            { host: urlObj.hostname, path: urlObj.pathname || '/', method: 'HEAD', timeout: 5000 },
            (res) => {
                clearTimeout(timeout)
                const headers = res.headers
                const missing: string[] = []

                if (!headers['content-security-policy']) missing.push('CSP')
                if (!headers['strict-transport-security']) missing.push('HSTS')
                if (!headers['x-frame-options']) missing.push('X-Frame-Options')
                if (!headers['x-content-type-options']) missing.push('X-Content-Type-Options')

                const score = missing.length * 3
                const detail = missing.length === 0
                    ? 'All key security headers present'
                    : `Missing headers: ${missing.join(', ')}`

                resolve({ name: 'Security Headers', score, detail, category: 'headers' })
            }
        )

        req.on('error', () => {
            clearTimeout(timeout)
            resolve({ name: 'Security Headers', score: 8, detail: 'Could not fetch headers', category: 'headers' })
        })

        req.end()
    })
}

// ─── Check 5: URL Heuristics ─────────────────────────────────────────────────

function checkURLHeuristics(url: string): ThreatSignal {
    const urlLower = url.toLowerCase()
    const urlObj = new URL(url)
    const hostname = urlObj.hostname
    const flags: string[] = []
    let score = 0

    // Suspicious keywords in hostname
    const phishingKeywords = ['login', 'signin', 'verify', 'secure', 'account', 'update', 'banking', 'paypal', 'amazon', 'google', 'microsoft']
    const matchedKeywords = phishingKeywords.filter(k => hostname.includes(k))
    if (matchedKeywords.length > 0) {
        score += Math.min(matchedKeywords.length * 8, 24)
        flags.push(`suspicious keywords: ${matchedKeywords.join(', ')}`)
    }

    // IP address instead of domain name
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
        score += 25
        flags.push('IP address used instead of domain')
    }

    // Excessive subdomains
    const subdomainDepth = hostname.split('.').length - 2
    if (subdomainDepth > 3) {
        score += 12
        flags.push(`${subdomainDepth} subdomain levels`)
    }

    // Very long URL
    if (url.length > 150) {
        score += 8
        flags.push(`excessive URL length (${url.length} chars)`)
    }

    // High digit ratio in hostname
    const digitRatio = (hostname.match(/\d/g) ?? []).length / hostname.length
    if (digitRatio > 0.3) {
        score += 10
        flags.push('high digit ratio in hostname')
    }

    // Shannon entropy of hostname — high entropy = random-looking domain (phishing indicator)
    const freq = new Map<string, number>()
    for (const char of hostname) freq.set(char, (freq.get(char) ?? 0) + 1)
    let entropy = 0
    for (const count of freq.values()) {
        const p = count / hostname.length
        entropy -= p * Math.log2(p)
    }

    if (entropy > 4.0) {
        score += 10
        flags.push(`high hostname entropy (${entropy.toFixed(2)})`)
    }

    // HTTP (not HTTPS)
    if (url.startsWith('http://')) {
        score += 8
        flags.push('plain HTTP — no encryption')
    }

    const detail = flags.length > 0
        ? `Flags: ${flags.join('; ')}`
        : 'URL structure looks clean'

    return { name: 'URL Heuristics', score: Math.min(score, 40), detail, category: 'ml' }
}

// ─── Check 6: VirusTotal API ───────────────────────────────────────────────────

async function checkVirusTotal(url: string): Promise<ThreatSignal> {
    const apiKey = process.env.VIRUSTOTAL_API_KEY
    if (!apiKey) {
        return { name: 'VirusTotal', score: 0, detail: 'VirusTotal API key not configured', category: 'networking' }
    }

    try {
        // Encode URL to base64url for VT API v3
        const urlId = Buffer.from(url).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
        const vtUrl = `https://www.virustotal.com/api/v3/urls/${urlId}`
        
        const res = await fetchWithTimeout(vtUrl, 8000)

        if (res.status === 404) {
            return { name: 'VirusTotal', score: 0, detail: 'No previous scans found on VirusTotal', category: 'networking' }
        }

        if (!res.ok) throw new Error(`VT API ${res.status}`)

        const data = await res.json() as any
        const stats = data.data?.attributes?.last_analysis_stats
        
        if (!stats) throw new Error('Missing stats')

        const malicious = stats.malicious || 0
        const suspicious = stats.suspicious || 0

        let score = 0
        let detail = `VirusTotal: ${malicious} malicious, ${suspicious} suspicious`

        if (malicious > 3) {
            score = 60
            detail = `CRITICAL: Flagged by ${malicious} security engines on VirusTotal`
        } else if (malicious > 0) {
            score = 40
            detail = `Flagged by ${malicious} security engine(s) on VirusTotal`
        } else if (suspicious > 0) {
            score = 20
            detail = `Flagged as suspicious by ${suspicious} engine(s) on VirusTotal`
        } else {
            score = 0
            detail = `Clean on VirusTotal (0 engines flagged)`
        }

        return { name: 'VirusTotal', score, detail, category: 'networking' }
    } catch (err) {
        logger.debug('VirusTotal check failed:', err)
        return { name: 'VirusTotal', score: 0, detail: 'VirusTotal check unavailable', category: 'networking' }
    }
}

// ─── Ensemble Scorer ─────────────────────────────────────────────────────────

function computeEnsembleScore(
    signals: ThreatSignal[],
    mlScore: number
): number {
    // Raw signal total
    const networkingSignals = signals.filter(s => s.category === 'networking' || s.category === 'headers')
    const rawNetworkScore = networkingSignals.reduce((sum, s) => sum + s.score, 0)

    const heuristicsSignal = signals.find(s => s.name === 'URL Heuristics')
    const heuristicsScore = heuristicsSignal ? heuristicsSignal.score : 0

    // ML score contribution (0-1 from ONNX, scaled to 0-40)
    // Fall back to URL heuristics if ML score is 0
    const mlContribution = mlScore > 0 ? (mlScore * 40) : heuristicsScore

    // Network contribution capped at 60
    const networkContribution = Math.min(rawNetworkScore, 60)

    // Add them directly since they are already scaled to parts of 100 (40 + 60)
    const raw = mlContribution + networkContribution

    return Math.min(Math.round(raw), 100)
}

// ─── Main scan function ───────────────────────────────────────────────────────

export async function scanUrl(request: ScanRequest): Promise<ThreatReport> {
    const startTime = Date.now()
    const { url, mlScore = 0 } = request

    let hostname: string
    try {
        hostname = new URL(url).hostname
    } catch {
        throw new Error(`Invalid URL: ${url}`)
    }

    logger.info(`Scanning: ${hostname}`)

    // Run all checks in parallel — total time = slowest check (~400-600ms)
    const [domainAge, tlsCert, doh, headers, vt] = await Promise.all([
        checkDomainAge(hostname),
        checkTLSCert(hostname),
        checkDoH(hostname),
        checkHeaders(url),
        checkVirusTotal(url)
    ])

    // URL heuristics is synchronous — runs instantly
    const heuristics = checkURLHeuristics(url)

    const signals = [domainAge, tlsCert, doh, headers, vt, heuristics]
        .filter(s => s.score > 0)  // only include signals that found something

    const score = computeEnsembleScore(signals, mlScore)
    const level = scoreToLevel(score)
    const recommendation = scoreToRecommendation(score)
    const scanDurationMs = Date.now() - startTime

    logger.info(`Scan complete: ${hostname} → score ${score} (${level}) in ${scanDurationMs}ms`)

    return {
        url,
        score,
        level,
        recommendation,
        mlScore,
        signals,
        cachedAt: Date.now(),
        scanDurationMs,
    }
}

// ─── URL hash for privacy ─────────────────────────────────────────────────────

export function hashUrl(url: string): string {
    return crypto.createHash('sha256').update(url).digest('hex')
}