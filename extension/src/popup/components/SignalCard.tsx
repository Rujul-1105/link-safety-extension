import type { ThreatSignal } from '../../shared/types'
import { theme } from '../../shared/theme'

const CAT_CONFIG = {
    networking: { label: 'NET', color: theme.sky, dim: theme.skyDim },
    ml: { label: 'ML', color: theme.amber, dim: theme.amberDim },
    reputation: { label: 'REP', color: theme.purple, dim: theme.purpleDim },
    headers: { label: 'HDR', color: theme.lime, dim: theme.limeDim },
}

interface Props {
    signal: ThreatSignal
    index: number
}

export function SignalCard({ signal, index }: Props) {
    const cat = CAT_CONFIG[signal.category]
    const scoreCol = signal.score > 60 ? theme.red : signal.score > 30 ? theme.amber : theme.lime

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: '2px 1fr auto',
            columnGap: 10,
            alignItems: 'start',
            padding: '9px 0',
            borderBottom: `1px solid ${theme.border}`,
            animation: `ngFadeIn 0.3s ease ${index * 60}ms both`,
        }}>
            {/* accent bar */}
            <div style={{ background: cat.color, gridRow: '1 / 3', minHeight: 32, borderRadius: 0 }} />

            {/* body */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                        fontSize: 7, fontWeight: 700, letterSpacing: '0.12em',
                        textTransform: 'uppercase', padding: '1px 5px',
                        color: cat.color, background: cat.dim, flexShrink: 0,
                    }}>
                        {cat.label}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: theme.text, letterSpacing: '0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {signal.name}
                    </span>
                </div>
                <span style={{ fontSize: 9, color: theme.text3, fontFamily: theme.sans, lineHeight: 1.5, paddingLeft: 2 }}>
                    {signal.detail}
                </span>
                {signal.score > 40 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, paddingLeft: 2 }}>
                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: theme.red, animation: 'ngPulse 1.5s ease-in-out infinite' }} />
                        <span style={{ fontSize: 7, color: 'rgba(244,63,94,0.6)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>High risk signal</span>
                    </div>
                )}
            </div>

            {/* score */}
            <span style={{ fontSize: 14, fontWeight: 700, color: scoreCol, alignSelf: 'center', letterSpacing: '-0.01em' }}>
                +{signal.score}
            </span>

            <style>{`
        @keyframes ngFadeIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }
        @keyframes ngPulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
      `}</style>
        </div>
    )
}