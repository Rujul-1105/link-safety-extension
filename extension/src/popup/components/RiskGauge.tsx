import { useEffect, useRef } from 'react'
import type { RiskLevel } from '../../shared/types'
import { scoreColor, scoreDim, scoreBorder, theme } from '../../shared/theme'

interface Props {
    score: number
    level: RiskLevel | null
    scanning: boolean
    mlScore: number
    networkScore: number
    reputationScore: number
}

const SIZE = 148
const STROKE = 8
const RADIUS = (SIZE - STROKE) / 2
const CIRC = 2 * Math.PI * RADIUS
const ARC = CIRC * 0.75   // 270° sweep

export function RiskGauge({ score, level, scanning, mlScore, networkScore, reputationScore }: Props) {
    const arcRef = useRef<SVGCircleElement>(null)
    const glowRef = useRef<SVGCircleElement>(null)
    const prevScore = useRef(0)

    useEffect(() => {
        const el = arcRef.current
        const gl = glowRef.current
        if (!el || !gl) return

        const targetOffset = ARC - (ARC * score) / 100
        el.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(0.34,1.56,0.64,1), stroke 0.4s ease'
        gl.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(0.34,1.56,0.64,1), stroke 0.4s ease'
        el.style.strokeDashoffset = String(targetOffset)
        gl.style.strokeDashoffset = String(targetOffset)
        prevScore.current = score
    }, [score, ARC])

    const col = scoreColor(score)

    const TICKS = [0, 67.5, 135, 202.5, 270]

    return (
        <div style={{ display: 'grid', gridTemplateColumns: `${SIZE}px 1fr`, gap: 0, padding: '20px 16px 16px', alignItems: 'center' }}>

            {/* ── Gauge ── */}
            <div style={{ position: 'relative', width: SIZE, height: SIZE, flexShrink: 0 }}>
                <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none"
                    style={{ transform: 'rotate(135deg)', display: 'block' }}>

                    {/* tick marks */}
                    {TICKS.map((deg) => (
                        <line key={deg}
                            x1={SIZE / 2} y1={6} x2={SIZE / 2} y2={14}
                            stroke={theme.surface3} strokeWidth={1.5}
                            transform={`rotate(${deg} ${SIZE / 2} ${SIZE / 2})`}
                        />
                    ))}

                    {/* outer ring */}
                    <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - 1} stroke={theme.surface3} strokeWidth={0.5} />

                    {/* track */}
                    <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
                        stroke={theme.surface3} strokeWidth={STROKE}
                        strokeDasharray={`${ARC} ${CIRC}`}
                        strokeLinecap="round" />

                    {/* glow */}
                    <circle ref={glowRef} cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
                        stroke={scanning ? 'transparent' : col}
                        strokeWidth={STROKE + 8}
                        strokeDasharray={`${ARC} ${CIRC}`}
                        strokeDashoffset={ARC}
                        strokeLinecap="round"
                        style={{ filter: 'blur(8px)', opacity: 0.35 }} />

                    {/* progress arc */}
                    <circle ref={arcRef} cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
                        stroke={scanning ? theme.surface3 : col}
                        strokeWidth={STROKE}
                        strokeDasharray={`${ARC} ${CIRC}`}
                        strokeDashoffset={ARC}
                        strokeLinecap="round" />

                    {/* scanning spinner */}
                    {scanning && (
                        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
                            stroke={theme.amber} strokeWidth={STROKE}
                            strokeDasharray={`50 ${CIRC - 50}`}
                            strokeLinecap="round"
                            style={{ animation: 'ngSpin 1.4s linear infinite' }} />
                    )}
                </svg>

                {/* Center */}
                <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 2,
                }}>
                    {scanning ? (
                        <>
                            <div style={{ display: 'flex', gap: 5, marginBottom: 4 }}>
                                {[0, 1, 2].map(i => (
                                    <div key={i} style={{
                                        width: 5, height: 5, borderRadius: '50%',
                                        background: theme.text3,
                                        animation: `ngDot 1s ease-in-out ${i * 0.2}s infinite`,
                                    }} />
                                ))}
                            </div>
                            <span style={{ fontSize: 8, letterSpacing: '0.2em', color: theme.text3, textTransform: 'uppercase' }}>
                                Scanning
                            </span>
                        </>
                    ) : (
                        <>
                            <span style={{
                                fontSize: 38, fontWeight: 700, lineHeight: 1,
                                letterSpacing: '-0.02em', color: col,
                                fontFamily: theme.mono,
                            }}>
                                {score}
                            </span>
                            <span style={{ fontSize: 8, letterSpacing: '0.2em', color: theme.text3, textTransform: 'uppercase' }}>
                                threat
                            </span>
                            {level && (
                                <span style={{
                                    fontSize: 8, fontWeight: 700, letterSpacing: '0.15em',
                                    color: col, marginTop: 4,
                                    padding: '2px 8px',
                                    border: `1px solid ${scoreBorder(score)}`,
                                    background: scoreDim(score),
                                    textTransform: 'uppercase',
                                }}>
                                    {level}
                                </span>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ── Sub-metrics ── */}
            <div style={{
                paddingLeft: 16,
                borderLeft: `1px solid ${theme.border}`,
                display: 'flex', flexDirection: 'column', gap: 12,
            }}>
                {([
                    ['ML Model', mlScore, 'ml'],
                    ['Network', networkScore, 'net'],
                    ['Reputation', reputationScore, 'rep'],
                ] as [string, number, string][]).map(([label, val, key]) => {
                    const pct = Math.round(val * 100)
                    const c = scoreColor(pct)
                    return (
                        <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span style={{ fontSize: 8, fontWeight: 500, letterSpacing: '0.15em', color: theme.text3, textTransform: 'uppercase' }}>
                                    {label}
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: scanning ? theme.text3 : c, letterSpacing: '0.02em' }}>
                                    {scanning ? '···' : val.toFixed(2)}
                                </span>
                            </div>
                            <div style={{ height: 2, background: theme.surface3, overflow: 'hidden' }}>
                                <div style={{
                                    height: '100%',
                                    width: scanning ? '0%' : `${pct}%`,
                                    background: c,
                                    transition: 'width 1s cubic-bezier(0.34,1.56,0.64,1)',
                                }} />
                            </div>
                        </div>
                    )
                })}

                {!scanning && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
                        <span style={{ fontSize: 8, fontWeight: 500, letterSpacing: '0.15em', color: theme.text3, textTransform: 'uppercase' }}>
                            Signals
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: theme.text, letterSpacing: '0.02em' }}>
                            — active
                        </span>
                    </div>
                )}
            </div>

            <style>{`
        @keyframes ngSpin {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: -${CIRC}; }
        }
        @keyframes ngDot {
          0%,100% { opacity:0.3; transform:scale(0.8); }
          50% { opacity:1; transform:scale(1.1); }
        }
      `}</style>
        </div>
    )
}