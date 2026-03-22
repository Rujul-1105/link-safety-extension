import type { ThreatReport } from '../../shared/types'
import { theme, scoreColor, scoreDim } from '../../shared/theme'

interface Entry { report: ThreatReport; visitedAt: number }
interface Props { history: Entry[] }

function shortUrl(url: string): { proto: string; host: string; path: string } {
    try {
        const u = new URL(url)
        return {
            proto: u.protocol.replace(':', '').toUpperCase(),
            host: u.hostname.replace('www.', ''),
            path: u.pathname.length > 1 ? u.pathname.slice(0, 14) + '…' : '',
        }
    } catch {
        return { proto: '', host: url.slice(0, 28), path: '' }
    }
}

function ago(ms: number): string {
    const s = Math.floor((Date.now() - ms) / 1000)
    if (s < 60) return `${s}s`
    if (s < 3600) return `${Math.floor(s / 60)}m`
    return `${Math.floor(s / 3600)}h`
}

export function HistoryTable({ history }: Props) {
    if (history.length === 0) {
        return (
            <div style={{ padding: '40px 0', textAlign: 'center', color: theme.text3 }}>
                <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.15 }}>◎</div>
                <p style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase' }}>No scans yet</p>
                <p style={{ fontSize: 9, marginTop: 4, color: theme.surface3, fontFamily: theme.sans }}>Browse the web to populate history</p>
            </div>
        )
    }

    return (
        <div>
            {/* header row */}
            <div style={{
                display: 'grid', gridTemplateColumns: '1fr 36px 52px 32px',
                gap: 8, padding: '0 16px 8px',
                borderBottom: `1px solid ${theme.border}`,
            }}>
                {['URL', 'SCR', 'LEVEL', 'AGO'].map((h, i) => (
                    <span key={h} style={{
                        fontSize: 7, fontWeight: 600, letterSpacing: '0.2em',
                        textTransform: 'uppercase', color: theme.text3,
                        textAlign: i > 0 ? 'right' : 'left',
                    }}>{h}</span>
                ))}
            </div>

            {/* rows */}
            {history.map(({ report, visitedAt }, i) => {
                const { proto, host, path } = shortUrl(report.url)
                const col = scoreColor(report.score)
                const isHttp = proto === 'HTTP'
                return (
                    <div key={i} style={{
                        display: 'grid', gridTemplateColumns: '1fr 36px 52px 32px',
                        gap: 8, padding: '9px 16px',
                        borderBottom: `1px solid ${theme.border}`,
                        transition: 'background 0.12s',
                    }}
                        onMouseEnter={e => (e.currentTarget.style.background = theme.surface)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                        {/* url */}
                        <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                                {proto && (
                                    <span style={{
                                        fontSize: 7, fontWeight: 700, padding: '1px 4px',
                                        letterSpacing: '0.05em', flexShrink: 0,
                                        color: isHttp ? theme.red : theme.lime,
                                        background: isHttp ? theme.redDim : theme.limeDim,
                                    }}>
                                        {proto}
                                    </span>
                                )}
                                <span style={{ fontSize: 10, color: theme.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {host}
                                </span>
                            </div>
                            {path && (
                                <span style={{ fontSize: 9, color: theme.text3, paddingLeft: proto ? 32 : 0 }}>{path}</span>
                            )}
                        </div>

                        {/* score */}
                        <span style={{ fontSize: 14, fontWeight: 700, color: col, textAlign: 'right', letterSpacing: '-0.01em', alignSelf: 'center' }}>
                            {report.score}
                        </span>

                        {/* level */}
                        <span style={{
                            fontSize: 7, fontWeight: 700, letterSpacing: '0.1em',
                            textTransform: 'uppercase', textAlign: 'right',
                            color: col, alignSelf: 'center',
                            padding: '2px 5px', background: scoreDim(report.score),
                        }}>
                            {report.level}
                        </span>

                        {/* time */}
                        <span style={{ fontSize: 9, color: theme.text3, textAlign: 'right', alignSelf: 'center' }}>
                            {ago(visitedAt)}
                        </span>
                    </div>
                )
            })}
        </div>
    )
}