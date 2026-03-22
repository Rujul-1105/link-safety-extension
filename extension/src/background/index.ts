import type { ExtMessage, ThreatReport, UserPreferences } from '../shared/types'
import { scoreToLevel, scoreToBadgeColor, DEFAULT_PREFERENCES } from '../shared/types'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

// ─── Cache helpers ────────────────────────────────────────────────────────────

async function getCachedReport(url: string): Promise<ThreatReport | null> {
    const key = `scan_${btoa(url).replace(/[^a-zA-Z0-9]/g, '_')}`
    const result = await chrome.storage.local.get(key)
    const report: ThreatReport | undefined = result[key]

    if (!report) return null

    // Check TTL
    if (Date.now() - report.cachedAt > CACHE_TTL_MS) {
        await chrome.storage.local.remove(key)
        return null
    }

    return report
}

async function cacheReport(url: string, report: ThreatReport): Promise<void> {
    const key = `scan_${btoa(url).replace(/[^a-zA-Z0-9]/g, '_')}`
    await chrome.storage.local.set({ [key]: report })
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

async function updateBadge(tabId: number, score: number) {
    const color = scoreToBadgeColor(score)
    const text = score === 0 ? '' : String(score)

    await chrome.action.setBadgeBackgroundColor({ color, tabId })
    await chrome.action.setBadgeText({ text, tabId })
}

async function setBadgeScanning(tabId: number) {
    await chrome.action.setBadgeBackgroundColor({ color: '#4a5568', tabId })
    await chrome.action.setBadgeText({ text: '...', tabId })
}

// ─── Preferences ─────────────────────────────────────────────────────────────

async function getPreferences(): Promise<UserPreferences> {
    const result = await chrome.storage.sync.get('preferences')
    return result.preferences ?? DEFAULT_PREFERENCES
}

// ─── Mock scan (real API call wired on Day 3) ─────────────────────────────────

async function performMockScan(url: string): Promise<ThreatReport> {
    // Simulate network delay
    await new Promise(r => setTimeout(r, 600))

    // Very basic heuristic for demo purposes until backend is wired
    const isSuspicious =
        url.includes('login') ||
        url.includes('verify') ||
        url.includes('secure') ||
        url.length > 100

    const score = isSuspicious ? 72 : 15

    return {
        url,
        score,
        level: scoreToLevel(score),
        mlScore: score / 100,
        cachedAt: Date.now(),
        recommendation: score > 60 ? 'warn' : 'allow',
        signals: [
            {
                name: 'URL Heuristics',
                score: isSuspicious ? 72 : 10,
                detail: isSuspicious
                    ? 'URL contains suspicious keywords (login, verify, secure)'
                    : 'URL appears clean',
                category: 'ml',
            },
        ],
    }
}

// ─── Main message listener ────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
    (message: ExtMessage, sender, sendResponse) => {
        // We must return true to use sendResponse asynchronously
        ; (async () => {
            const prefs = await getPreferences()

            if (message.type === 'SCAN_URL') {
                const { url } = message.payload
                const tabId = sender.tab?.id

                if (!tabId || !url) {
                    sendResponse({ error: 'Missing tabId or url' })
                    return
                }

                console.log(`[NetGuard BG] Scanning: ${url}`)

                // 1. Show scanning badge immediately
                await setBadgeScanning(tabId)

                // 2. Check local cache
                const cached = await getCachedReport(url)
                if (cached) {
                    console.log(`[NetGuard BG] Cache HIT for ${url}, score: ${cached.score}`)
                    await updateBadge(tabId, cached.score)
                    sendResponse({ report: cached, fromCache: true })
                    return
                }

                // 3. Cache miss — run scan (mock for now, real API on Day 3)
                try {
                    const report = await performMockScan(url)
                    await cacheReport(url, report)
                    await updateBadge(tabId, report.score)

                    // 4. If popup is open, push the result to it
                    chrome.runtime
                        .sendMessage({ type: 'THREAT_RESULT', payload: report })
                        .catch(() => {
                            // Popup not open — that's fine
                        })

                    // 5. High risk notification
                    if (report.score > 60 && prefs.notifications) {
                        chrome.notifications.create({
                            type: 'basic',
                            iconUrl: 'icons/icon48.png',
                            title: `⚠️ NetGuard — ${report.level} Risk`,
                            message: `Score: ${report.score}/100\n${url.slice(0, 60)}...`,
                        })
                    }

                    sendResponse({ report, fromCache: false })
                } catch (err) {
                    console.error('[NetGuard BG] Scan error:', err)
                    await chrome.action.setBadgeText({ text: '!', tabId })
                    await chrome.action.setBadgeBackgroundColor({ color: '#ff5252', tabId })
                    sendResponse({ error: String(err) })
                }
            }

            if (message.type === 'GET_TAB_STATE') {
                const { tabId } = message.payload
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
                const url = tab?.url ?? ''
                const cached = url ? await getCachedReport(url) : null
                sendResponse({ report: cached, url })
            }

            if (message.type === 'UPDATE_SETTINGS') {
                await chrome.storage.sync.set({ preferences: message.payload })
                sendResponse({ ok: true })
            }

            if (message.type === 'CLEAR_CACHE') {
                await chrome.storage.local.clear()
                sendResponse({ ok: true })
            }
        })()

        return true // keep message channel open for async response
    }
)

// Wake up immediately and log
console.log('[NetGuard] Service worker started')