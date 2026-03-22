export const theme = {
    bg: '#09090b',
    surface: '#111115',
    surface2: '#18181c',
    surface3: '#1e1e24',
    border: 'rgba(255,255,255,0.07)',
    border2: 'rgba(255,255,255,0.12)',
    text: '#e4e4e7',
    text2: '#a1a1aa',
    text3: '#52525b',
    lime: '#c8f542',
    limeDim: 'rgba(200,245,66,0.12)',
    limeGlow: 'rgba(200,245,66,0.25)',
    amber: '#f59e0b',
    amberDim: 'rgba(245,158,11,0.12)',
    red: '#f43f5e',
    redDim: 'rgba(244,63,94,0.12)',
    sky: '#38bdf8',
    skyDim: 'rgba(56,189,248,0.1)',
    purple: '#a78bfa',
    purpleDim: 'rgba(167,139,250,0.1)',
    mono: "'IBM Plex Mono', monospace",
    sans: "'IBM Plex Sans', sans-serif",
} as const

export function scoreColor(score: number): string {
    if (score <= 20) return theme.lime
    if (score <= 40) return '#86efac'
    if (score <= 60) return theme.amber
    if (score <= 80) return theme.red
    return '#ff1744'
}

export function scoreDim(score: number): string {
    if (score <= 20) return theme.limeDim
    if (score <= 40) return 'rgba(134,239,172,0.1)'
    if (score <= 60) return theme.amberDim
    return theme.redDim
}

export function scoreBorder(score: number): string {
    if (score <= 20) return 'rgba(200,245,66,0.3)'
    if (score <= 40) return 'rgba(134,239,172,0.3)'
    if (score <= 60) return 'rgba(245,158,11,0.3)'
    return 'rgba(244,63,94,0.3)'
}