// Risk levels
export type RiskLevel = 'SAFE' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'

// A single threat signal (one check's result)
export interface ThreatSignal {
    name: string           // e.g. "WHOIS Domain Age"
    score: number          // 0–100 contribution
    detail: string         // human readable explanation
    category: 'networking' | 'ml' | 'reputation' | 'headers'
}

// Full threat report returned from backend / cached locally
export interface ThreatReport {
    url: string
    score: number          // 0–100 final score
    level: RiskLevel
    signals: ThreatSignal[]
    mlScore: number        // raw ONNX output 0–1
    cachedAt: number       // timestamp ms — for TTL check
    recommendation: 'allow' | 'warn' | 'block'
}

// Messages between extension parts
export type MessageType =
    | 'SCAN_URL'
    | 'THREAT_RESULT'
    | 'GET_TAB_STATE'
    | 'UPDATE_SETTINGS'
    | 'CLEAR_CACHE'

export interface ExtMessage {
    type: MessageType
    payload?: any
}

// User preferences (stored in chrome.storage.sync)
export interface UserPreferences {
    dohEnabled: boolean
    mlEnabled: boolean
    vpnDetectionEnabled: boolean
    phishingHeuristicsEnabled: boolean
    virusTotalOptIn: boolean
    notifications: boolean
}

export const DEFAULT_PREFERENCES: UserPreferences = {
    dohEnabled: true,
    mlEnabled: true,
    vpnDetectionEnabled: true,
    phishingHeuristicsEnabled: true,
    virusTotalOptIn: false,
    notifications: true,
}

// Score → level mapping
export function scoreToLevel(score: number): RiskLevel {
    if (score <= 20) return 'SAFE'
    if (score <= 40) return 'LOW'
    if (score <= 60) return 'MODERATE'
    if (score <= 80) return 'HIGH'
    return 'CRITICAL'
}

// Score → badge colour
export function scoreToBadgeColor(score: number): string {
    if (score <= 20) return '#00e676'  // green
    if (score <= 60) return '#ffab40'  // amber
    return '#ff5252'                    // red
}