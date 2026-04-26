import type { ExtMessage, ThreatReport, UserPreferences } from "../shared/types";
import { scoreToBadgeColor, DEFAULT_PREFERENCES } from "../shared/types";
// ─── Socket.io connection ─────────────────────────────────────────────────────
// We load Socket.io client via dynamic import from the CDN
// Service workers can use importScripts for this

let socketConnected = false;

async function connectWebSocket(deviceId: string) {
    if (socketConnected) return;

    try {
        // Use native WebSocket — build a lightweight client manually
        // (Socket.io client is too large for a service worker)
        const ws = new WebSocket("ws://localhost:3001/socket.io/?transport=websocket&EIO=4");

        ws.onopen = () => {
            socketConnected = true;
            console.log("[NetGuard BG] WebSocket connected");
            // Socket.io handshake
            ws.send("40"); // connect packet
            // Identify this device
            ws.send(`42["identify","${deviceId}"]`);
        };

        ws.onmessage = async (event) => {
            const data = event.data as string;

            // Socket.io ping — must respond with pong
            if (data === "2") {
                ws.send("3");
                return;
            }

            // Parse Socket.io message format: 42["event", payload]
            if (data.startsWith("42")) {
                try {
                    const [eventName, payload] = JSON.parse(data.slice(2));

                    if (eventName === "threat:result" && payload?.report) {
                        const report = payload.report as ThreatReport;

                        // Cache the result locally
                        await cacheReport(report.url, report);

                        // Find the exact tab that requested this scan
                        const tabId = scanTabs.get(report.url);
                        if (tabId) {
                            await updateBadge(tabId, report.score);
                            scanTabs.delete(report.url);
                        } else {
                            // Fallback if tab mapping was lost
                            const tabs = await chrome.tabs.query({});
                            const matchingTab = tabs.find((t) => t.url && (t.url === report.url || t.url.startsWith(report.url)));
                            if (matchingTab?.id) {
                                await updateBadge(matchingTab.id, report.score);
                            }
                        }

                        // Push to popup if open
                        chrome.runtime
                            .sendMessage({ type: "THREAT_RESULT", payload: report })
                            .catch(() => {});

                        // Notification for high risk
                        const prefs = await getPreferences();
                        if (report.score > 60 && prefs.notifications) {
                            chrome.notifications.create({
                                type: "basic",
                                iconUrl: "icons/icon48.png",
                                title: `⚠️ NetGuard — ${report.level} Risk`,
                                message: `Score: ${report.score}/100\n${report.url.slice(0, 80)}`,
                            });
                        }
                    }
                } catch {
                    /* non-JSON message, ignore */
                }
            }
        };

        ws.onclose = () => {
            socketConnected = false;
            console.log("[NetGuard BG] WebSocket disconnected — will reconnect on next scan");
        };

        ws.onerror = (err) => {
            console.warn("[NetGuard BG] WebSocket error:", err);
            socketConnected = false;
        };
    } catch (err) {
        console.warn("[NetGuard BG] WebSocket setup failed:", err);
    }
}
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Cache helpers ────────────────────────────────────────────────────────────
// Add at top of background/index.ts
const API_BASE = "http://localhost:3001/api";

// Map to track which tab requested which URL
const scanTabs = new Map<string, number>();

async function getOrCreateDeviceToken(): Promise<string> {
    const stored = await chrome.storage.local.get("device_token");
    if (stored.device_token) return stored.device_token as string;

    // First install — get a token from the backend
    const res = await fetch(`${API_BASE}/auth/device`, { method: "POST" });
    const { token } = await res.json();
    await chrome.storage.local.set({ device_token: token });
    return token;
}

async function performAPIScan(url: string, mlScore = 0): Promise<ThreatReport | null> {
    let token = await getOrCreateDeviceToken();

    // Ensure WebSocket is connected so we receive the pushed result
    let tokenHash = btoa(token).slice(0, 16); // rough device ID for WS identification
    await connectWebSocket(tokenHash);

    let res = await fetch(`${API_BASE}/scan`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url, mlScore }),
    });

    if (res.status === 401) {
        console.log("[NetGuard BG] Token expired/invalid, getting a new one...");
        await chrome.storage.local.remove("device_token");
        token = await getOrCreateDeviceToken();
        tokenHash = btoa(token).slice(0, 16);
        await connectWebSocket(tokenHash);

        res = await fetch(`${API_BASE}/scan`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ url, mlScore }),
        });
    }

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `API error ${res.status}` }));
        throw new Error(err.error ?? `API error ${res.status}`);
    }

    const data = await res.json();

    // Cache hit — result came back immediately
    if (data.fromCache) {
        return data as ThreatReport;
    }

    // Queued — result will arrive via WebSocket (threat:result event)
    // Return null to signal "scan is in flight"
    return null;
}
async function getCachedReport(url: string): Promise<ThreatReport | null> {
    const key = `scan_${btoa(url).replace(/[^a-zA-Z0-9]/g, "_")}`;
    const result = await chrome.storage.local.get(key);
    const report = result[key] as ThreatReport | undefined;

    if (!report) return null;

    // Check TTL
    if (Date.now() - report.cachedAt > CACHE_TTL_MS) {
        await chrome.storage.local.remove(key);
        return null;
    }

    return report;
}

async function cacheReport(url: string, report: ThreatReport): Promise<void> {
    const key = `scan_${btoa(url).replace(/[^a-zA-Z0-9]/g, "_")}`;
    await chrome.storage.local.set({ [key]: report });
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

async function updateBadge(tabId: number, score: number) {
    const color = scoreToBadgeColor(score);
    const text = String(score); // Always show the score, even if 0

    await chrome.action.setBadgeBackgroundColor({ color, tabId });
    await chrome.action.setBadgeText({ text, tabId });
}

async function setBadgeScanning(tabId: number) {
    await chrome.action.setBadgeBackgroundColor({ color: "#4a5568", tabId });
    await chrome.action.setBadgeText({ text: "...", tabId });
}

// ─── Preferences ─────────────────────────────────────────────────────────────

async function getPreferences(): Promise<UserPreferences> {
    const result = await chrome.storage.sync.get("preferences");
    return (result.preferences as UserPreferences) ?? DEFAULT_PREFERENCES;
}

// ─── Mock scan (real API call wired on Day 3) ─────────────────────────────────

// async function performMockScan(url: string): Promise<ThreatReport> {
//     // Simulate network delay
//     await new Promise((r) => setTimeout(r, 600));

//     // Very basic heuristic for demo purposes until backend is wired
//     const isSuspicious =
//         url.includes("login") ||
//         url.includes("verify") ||
//         url.includes("secure") ||
//         url.length > 100;

//     const score = isSuspicious ? 72 : 15;

//     return {
//         url,
//         score,
//         level: scoreToLevel(score),
//         mlScore: score / 100,
//         cachedAt: Date.now(),
//         recommendation: score > 60 ? "warn" : "allow",
//         signals: [
//             {
//                 name: "URL Heuristics",
//                 score: isSuspicious ? 72 : 10,
//                 detail: isSuspicious
//                     ? "URL contains suspicious keywords (login, verify, secure)"
//                     : "URL appears clean",
//                 category: "ml",
//             },
//         ],
//     };
// }

// ─── Main message listener ────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtMessage, sender, sendResponse) => {
    // We must return true to use sendResponse asynchronously
    (async () => {
        const prefs = await getPreferences();

        if (message.type === "SCAN_URL") {
            const { url } = message.payload;
            const tabId = sender.tab?.id;

            if (!tabId || !url) {
                sendResponse({ error: "Missing tabId or url" });
                return;
            }

            console.log(`[NetGuard BG] Scanning: ${url}`);

            // Track tab for WebSocket response
            scanTabs.set(url, tabId);

            // 1. Show scanning badge immediately
            await setBadgeScanning(tabId);

            // 2. Check local cache
            const cached = await getCachedReport(url);
            if (cached) {
                console.log(`[NetGuard BG] Cache HIT for ${url}, score: ${cached.score}`);
                await updateBadge(tabId, cached.score);
                sendResponse({ report: cached, fromCache: true });
                return;
            }

            // 3. Cache miss — run scan (mock for now, real API on Day 3)
            try {
                const report = await performAPIScan(url);
                if (report === null) {
                    // Job is queued — WebSocket will push the result when done
                    // Badge stays on scanning state until the push arrives
                    sendResponse({ status: "queued" });
                    return;
                }
                await cacheReport(url, report);
                await updateBadge(tabId, report.score);
                // 4. If popup is open, push the result to it
                chrome.runtime.sendMessage({ type: "THREAT_RESULT", payload: report }).catch(() => {
                    // Popup not open — that's fine
                });

                // 5. High risk notification
                if (report.score > 60 && prefs.notifications) {
                    chrome.notifications.create({
                        type: "basic",
                        iconUrl: "icons/icon48.png",
                        title: `⚠️ NetGuard — ${report.level} Risk`,
                        message: `Score: ${report.score}/100\n${url.slice(0, 60)}...`,
                    });
                }

                sendResponse({ report, fromCache: false });
            } catch (err) {
                console.error("[NetGuard BG] Scan error:", err);
                await chrome.action.setBadgeText({ text: "!", tabId });
                await chrome.action.setBadgeBackgroundColor({ color: "#ff5252", tabId });
                sendResponse({ error: String(err) });
            }
        }

        if (message.type === "GET_TAB_STATE") {
            if (message.type === "GET_TAB_STATE") {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                const url = tab?.url ?? "";
                const cached = url ? await getCachedReport(url) : null;
                sendResponse({ report: cached, url });
            }
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const url = tab?.url ?? "";
            const cached = url ? await getCachedReport(url) : null;
            sendResponse({ report: cached, url });
        }

        if (message.type === "UPDATE_SETTINGS") {
            await chrome.storage.sync.set({ preferences: message.payload });
            sendResponse({ ok: true });
        }

        if (message.type === "CLEAR_CACHE") {
            await chrome.storage.local.clear();
            sendResponse({ ok: true });
        }
    })();

    return true; // keep message channel open for async response
});

// Wake up immediately and log
console.log("[NetGuard] Service worker started");
