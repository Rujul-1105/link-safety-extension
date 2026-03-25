export type RiskLevel = 'SAFE' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'
export type Recommendation = 'allow' | 'warn' | 'block'

export interface ThreatSignal {
    name: string
    score: number
    detail: string
    category: 'networking' | 'ml' | 'reputation' | 'headers'
}

export interface ThreatReport {
    url: string
    score: number
    level: RiskLevel
    recommendation: Recommendation
    mlScore: number
    signals: ThreatSignal[]
    cachedAt: number
    scanDurationMs?: number
}

export interface ScanRequest {
    url: string
    mlScore?: number  // sent from extension's in-browser ONNX result
}

// Utility: score → level
export function scoreToLevel(score: number): RiskLevel {
    if (score <= 20) return 'SAFE'
    if (score <= 40) return 'LOW'
    if (score <= 60) return 'MODERATE'
    if (score <= 80) return 'HIGH'
    return 'CRITICAL'
}

// Utility: score → recommendation
export function scoreToRecommendation(score: number): Recommendation {
    if (score <= 40) return 'allow'
    if (score <= 65) return 'warn'
    return 'block'
}