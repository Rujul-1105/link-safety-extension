import { create } from 'zustand'
import type { ThreatReport, UserPreferences } from './types'
import { DEFAULT_PREFERENCES } from './types'

interface ScanHistoryEntry {
    report: ThreatReport
    visitedAt: number
}

interface NetGuardStore {
    // Current tab state
    currentUrl: string
    currentReport: ThreatReport | null
    scanState: 'idle' | 'scanning' | 'done' | 'error'
    errorMessage: string | null

    // Scan history (last 50 scans, in-memory)
    history: ScanHistoryEntry[]

    // User preferences
    preferences: UserPreferences

    // Actions
    setCurrentUrl: (url: string) => void
    setCurrentReport: (report: ThreatReport) => void
    setScanState: (state: NetGuardStore['scanState']) => void
    setError: (msg: string) => void
    addToHistory: (report: ThreatReport) => void
    setPreferences: (prefs: UserPreferences) => void
    clearHistory: () => void
}

export const useNetGuardStore = create<NetGuardStore>((set) => ({
    currentUrl: '',
    currentReport: null,
    scanState: 'idle',
    errorMessage: null,
    history: [],
    preferences: DEFAULT_PREFERENCES,

    setCurrentUrl: (url) => set({ currentUrl: url }),

    setCurrentReport: (report) =>
        set({ currentReport: report, scanState: 'done', errorMessage: null }),

    setScanState: (scanState) => set({ scanState }),

    setError: (errorMessage) => set({ scanState: 'error', errorMessage }),

    addToHistory: (report) =>
        set((state) => ({
            history: [
                { report, visitedAt: Date.now() },
                ...state.history.filter((h) => h.report.url !== report.url),
            ].slice(0, 50),
        })),

    setPreferences: (preferences) => set({ preferences }),

    clearHistory: () => set({ history: [] }),
}))