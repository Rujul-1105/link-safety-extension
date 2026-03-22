import type { ExtMessage } from '../shared/types'

// Content script runs in every tab
// Its only job: detect URL and report it to the service worker
// Keep this file as small as possible — it loads on every single page

let lastReportedUrl = ''

function reportUrl(url: string) {
    // Don't spam the service worker with duplicate reports
    if (url === lastReportedUrl) return
    if (!url.startsWith('http://') && !url.startsWith('https://')) return

    lastReportedUrl = url

    const message: ExtMessage = {
        type: 'SCAN_URL',
        payload: { url, tabId: null }, // tabId filled by service worker from sender
    }

    chrome.runtime.sendMessage(message).catch(() => {
        // Service worker might be inactive — this is fine, MV3 service workers sleep
        // The popup will trigger a scan when it opens
    })
}

// Report the current page URL immediately on load
reportUrl(window.location.href)

// Watch for SPA navigation (React/Next apps change URL without full page reload)
let currentUrl = window.location.href
const urlObserver = new MutationObserver(() => {
    if (window.location.href !== currentUrl) {
        currentUrl = window.location.href
        reportUrl(currentUrl)
    }
})

urlObserver.observe(document.body, {
    childList: true,
    subtree: true,
})

// Also catch pushState navigation explicitly
const originalPushState = history.pushState.bind(history)
history.pushState = (...args) => {
    originalPushState(...args)
    reportUrl(window.location.href)
}

const originalReplaceState = history.replaceState.bind(history)
history.replaceState = (...args) => {
    originalReplaceState(...args)
    reportUrl(window.location.href)
}

console.log('[NetGuard] Content script loaded on:', window.location.href)