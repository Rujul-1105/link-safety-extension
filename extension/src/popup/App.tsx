import { useEffect, useState } from "react";
import { RiskGauge } from "./components/RiskGauge";
import { SignalCard } from "./components/SignalCard";
import { HistoryTable } from "./components/HistoryTable";
import { useNetGuardStore } from "../shared/store";
import { theme } from "../shared/theme";
import type { ThreatReport, UserPreferences } from "../shared/types";

type Tab = "scan" | "history" | "settings";

const LOGO = (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <path
            d="M10 2L3 5v6c0 4 3.1 7.3 7 8 3.9-.7 7-4 7-8V5L10 2z"
            stroke={theme.lime}
            strokeWidth="1.5"
            fill="rgba(200,245,66,0.08)"
        />
        <path
            d="M7 10l2 2 4-4"
            stroke={theme.lime}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

export default function App() {
    const {
        currentUrl,
        currentReport,
        scanState,
        setCurrentUrl,
        setCurrentReport,
        setScanState,
        setError,
        addToHistory,
        history,
        preferences,
        setPreferences,
    } = useNetGuardStore();

    const [activeTab, setActiveTab] = useState<Tab>("scan");

    useEffect(() => {
        setScanState("scanning");
        chrome.runtime
            .sendMessage({ type: "GET_TAB_STATE", payload: {} })
            .then((res) => {
                if (res?.url) setCurrentUrl(res.url);
                if (res?.report) {
                    setCurrentReport(res.report);
                    addToHistory(res.report);
                } else setScanState("idle");
            })
            .catch(() => setError("Service worker unreachable"));

        chrome.storage.sync.get("preferences").then((res) => {
            if (res.preferences) setPreferences(res.preferences as UserPreferences);
        });
    }, []);

    useEffect(() => {
        const listener = (msg: any) => {
            if (msg.type === "THREAT_RESULT" && msg.payload) {
                setCurrentReport(msg.payload as ThreatReport);
                addToHistory(msg.payload as ThreatReport);
            }
        };
        chrome.runtime.onMessage.addListener(listener);
        return () => chrome.runtime.onMessage.removeListener(listener);
    }, []);

    const handleRescan = () => {
        if (!currentUrl) return;
        setScanState("scanning");
        const key = `scan_${btoa(currentUrl).replace(/[^a-zA-Z0-9]/g, "_")}`;
        chrome.storage.local.remove(key).then(() => {
            chrome.runtime
                .sendMessage({ type: "SCAN_URL", payload: { url: currentUrl } })
                .catch(() => setError("Rescan failed"));
        });
    };

    const scanning = scanState === "scanning";
    const report = currentReport;
    // const col = report ? scoreColor(report.score) : theme.lime;

    // derive sub-scores from signals
    const mlScore = report ? (report.mlScore ?? 0) : 0;
    const netScore = report
        ? Math.min(
              1,
              report.signals
                  .filter((s) => s.category === "networking")
                  .reduce((a, s) => a + s.score, 0) / 100
          )
        : 0;
    const repScore = report
        ? Math.min(
              1,
              report.signals
                  .filter((s) => s.category === "reputation")
                  .reduce((a, s) => a + s.score, 0) / 100
          )
        : 0;

    // Recommendation
    const rec = report?.recommendation;
    const verdictConfig = {
        allow: {
            text: "Safe to proceed",
            sub: "All signals clear",
            border: theme.lime,
            bg: theme.limeDim,
            icon: "✓",
        },
        warn: {
            text: "Proceed with caution",
            sub: "Some suspicious indicators found",
            border: theme.amber,
            bg: theme.amberDim,
            icon: "!",
        },
        block: {
            text: "High risk — avoid this site",
            sub: "Multiple threat indicators detected",
            border: theme.red,
            bg: theme.redDim,
            icon: "⊘",
        },
    };
    const verdict = rec ? verdictConfig[rec] : null;

    // status dot
    const statusMap = {
        scanning: { col: theme.amber, label: "Scanning" },
        done: {
            col: report && report.score > 60 ? theme.red : theme.lime,
            label: report && report.score > 60 ? "Threat" : "Secure",
        },
        idle: { col: theme.text3, label: "Idle" },
        error: { col: theme.red, label: "Error" },
    };
    const status = statusMap[scanState];

    const tabs: { id: Tab; icon: string; label: string }[] = [
        { id: "scan", icon: "⬡", label: "Scan" },
        { id: "history", icon: "◎", label: "Log" },
        { id: "settings", icon: "⊞", label: "Config" },
    ];

    const S: Record<string, React.CSSProperties> = {
        root: {
            width: 384,
            background: theme.bg,
            fontFamily: theme.mono,
            color: theme.text,
            display: "flex",
            flexDirection: "column",
            minHeight: 500,
            maxHeight: 620,
            position: "relative",
            overflow: "hidden",
        },
        scanlines: {
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 0,
            background:
                "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,255,255,0.012) 2px,rgba(255,255,255,0.012) 4px)",
        },
        header: {
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "11px 16px",
            borderBottom: `1px solid ${theme.border}`,
            background: theme.surface,
            position: "relative",
            zIndex: 1,
            flexShrink: 0,
        },
        tabBar: {
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            borderTop: `1px solid ${theme.border}`,
            background: theme.surface,
            flexShrink: 0,
            zIndex: 1,
            marginTop: "auto",
        },
        scrollBody: {
            flex: 1,
            overflowY: "auto",
            position: "relative",
            zIndex: 1,
        },
    };

    return (
        <div style={S.root}>
            <div style={S.scanlines} />

            {/* ── Header ── */}
            <div style={S.header}>
                {LOGO}
                <span
                    style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.18em",
                        color: theme.lime,
                    }}
                >
                    NETGUARD
                </span>
                <span style={{ fontSize: 9, color: theme.text3, letterSpacing: "0.08em" }}>
                    PRO
                </span>

                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7 }}>
                    {scanState === "done" && (
                        <button
                            onClick={handleRescan}
                            style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                color: theme.text3,
                                fontSize: 12,
                                padding: "2px 4px",
                                display: "flex",
                                alignItems: "center",
                            }}
                            title="Re-scan"
                        >
                            ↻
                        </button>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <div
                            style={{
                                width: 5,
                                height: 5,
                                borderRadius: "50%",
                                background: status.col,
                                boxShadow: `0 0 6px ${status.col}`,
                                animation: "ngPulse2 2s ease-in-out infinite",
                            }}
                        />
                        <span
                            style={{
                                fontSize: 9,
                                fontWeight: 500,
                                letterSpacing: "0.1em",
                                color: status.col,
                                textTransform: "uppercase",
                            }}
                        >
                            {status.label}
                        </span>
                    </div>
                </div>
            </div>

            {/* ── Scroll body ── */}
            <div style={S.scrollBody}>
                {/* SCAN TAB */}
                {activeTab === "scan" && (
                    <div>
                        {/* Gauge + metrics */}
                        <RiskGauge
                            score={report?.score ?? 0}
                            level={report?.level ?? null}
                            scanning={scanning}
                            mlScore={mlScore}
                            networkScore={netScore}
                            reputationScore={repScore}
                        />

                        {/* URL bar */}
                        {currentUrl && (
                            <div
                                style={{
                                    margin: "0 16px 12px",
                                    background: theme.surface,
                                    border: `1px solid ${theme.border}`,
                                    padding: "7px 12px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                }}
                            >
                                {(() => {
                                    try {
                                        const u = new URL(currentUrl);
                                        const isHttp = u.protocol === "http:";
                                        return (
                                            <>
                                                <span
                                                    style={{
                                                        fontSize: 8,
                                                        fontWeight: 700,
                                                        padding: "1px 5px",
                                                        letterSpacing: "0.05em",
                                                        flexShrink: 0,
                                                        color: isHttp ? theme.red : theme.lime,
                                                        background: isHttp
                                                            ? theme.redDim
                                                            : theme.limeDim,
                                                    }}
                                                >
                                                    {u.protocol.replace(":", "").toUpperCase()}
                                                </span>
                                                <span
                                                    style={{
                                                        fontSize: 11,
                                                        color: theme.text2,
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        whiteSpace: "nowrap",
                                                        flex: 1,
                                                        minWidth: 0,
                                                    }}
                                                >
                                                    {u.hostname.replace("www.", "")}
                                                </span>
                                                {u.pathname.length > 1 && (
                                                    <span
                                                        style={{
                                                            fontSize: 10,
                                                            color: theme.text3,
                                                            flexShrink: 0,
                                                        }}
                                                    >
                                                        {u.pathname.slice(0, 16)}
                                                        {u.pathname.length > 16 ? "…" : ""}
                                                    </span>
                                                )}
                                            </>
                                        );
                                    } catch {
                                        return (
                                            <span style={{ fontSize: 10, color: theme.text2 }}>
                                                {currentUrl.slice(0, 40)}
                                            </span>
                                        );
                                    }
                                })()}
                            </div>
                        )}

                        {/* Verdict banner */}
                        {verdict && !scanning && (
                            <div
                                style={{
                                    margin: "0 16px 12px",
                                    padding: "10px 14px",
                                    borderLeft: `2px solid ${verdict.border}`,
                                    background: verdict.bg,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 12,
                                }}
                            >
                                <span
                                    style={{
                                        fontSize: 13,
                                        color: verdict.border,
                                        flexShrink: 0,
                                        fontWeight: 700,
                                    }}
                                >
                                    {verdict.icon}
                                </span>
                                <div>
                                    <p
                                        style={{
                                            fontSize: 10,
                                            fontWeight: 700,
                                            letterSpacing: "0.1em",
                                            color: verdict.border,
                                            textTransform: "uppercase",
                                            margin: 0,
                                        }}
                                    >
                                        {verdict.text}
                                    </p>
                                    <p
                                        style={{
                                            fontSize: 9,
                                            color: theme.text3,
                                            marginTop: 2,
                                            fontFamily: theme.sans,
                                            margin: "2px 0 0",
                                        }}
                                    >
                                        {verdict.sub} · {report?.signals.length ?? 0} signal
                                        {report?.signals.length !== 1 ? "s" : ""} analysed
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Scanning: live checklist */}
                        {scanning && (
                            <div
                                style={{
                                    margin: "0 16px 12px",
                                    padding: "10px 14px",
                                    borderLeft: `2px solid ${theme.amber}`,
                                    background: theme.amberDim,
                                }}
                            >
                                <p
                                    style={{
                                        fontSize: 9,
                                        fontWeight: 700,
                                        letterSpacing: "0.1em",
                                        color: theme.amber,
                                        textTransform: "uppercase",
                                        margin: "0 0 8px",
                                    }}
                                >
                                    Running parallel checks...
                                </p>
                                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                    {[
                                        ["WHOIS domain age", 0],
                                        ["TLS certificate", 0.2],
                                        ["DoH DNS lookup", 0.4],
                                        ["HTTP headers", 0.6],
                                        ["ASN reputation", 0.8],
                                        ["ML classifier", 0],
                                    ].map(([label, delay], i) => (
                                        <div
                                            key={i}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 8,
                                            }}
                                        >
                                            <div
                                                style={{
                                                    width: 5,
                                                    height: 5,
                                                    borderRadius: "50%",
                                                    flexShrink: 0,
                                                    background:
                                                        i < 2 ? theme.amber : theme.surface3,
                                                    animation:
                                                        i < 2
                                                            ? `ngPulse2 1s ease-in-out ${delay}s infinite`
                                                            : "none",
                                                }}
                                            />
                                            <span
                                                style={{
                                                    fontSize: 9,
                                                    color: i < 2 ? theme.text2 : theme.text3,
                                                    letterSpacing: "0.05em",
                                                    opacity: i >= 4 ? 0.4 : 1,
                                                }}
                                            >
                                                {label as string}
                                            </span>
                                            {i < 2 && (
                                                <div
                                                    style={{
                                                        marginLeft: "auto",
                                                        width: 48,
                                                        height: 1,
                                                        background: theme.surface3,
                                                        overflow: "hidden",
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            height: "100%",
                                                            background: theme.amber,
                                                            animation: `ngLoad 1.2s ease-in-out ${delay}s infinite`,
                                                        }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Signals */}
                        {report && report.signals.length > 0 && !scanning && (
                            <div style={{ padding: "0 16px" }}>
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        marginBottom: 8,
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: 8,
                                            fontWeight: 500,
                                            letterSpacing: "0.2em",
                                            color: theme.text3,
                                            textTransform: "uppercase",
                                        }}
                                    >
                                        Threat Signals
                                    </span>
                                    <span style={{ fontSize: 9, color: theme.text3 }}>
                                        {report.signals.length} active
                                    </span>
                                </div>
                                {report.signals.map((sig, i) => (
                                    <SignalCard key={i} signal={sig} index={i} />
                                ))}
                            </div>
                        )}

                        {/* Idle */}
                        {scanState === "idle" && !report && (
                            <div
                                style={{
                                    padding: "40px 0",
                                    textAlign: "center",
                                    color: theme.text3,
                                }}
                            >
                                <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.1 }}>
                                    ⬡
                                </div>
                                <p
                                    style={{
                                        fontSize: 9,
                                        letterSpacing: "0.2em",
                                        textTransform: "uppercase",
                                    }}
                                >
                                    Awaiting navigation
                                </p>
                                <p style={{ fontSize: 9, marginTop: 4, fontFamily: theme.sans }}>
                                    Visit a URL to trigger a scan
                                </p>
                            </div>
                        )}

                        <div style={{ height: 16 }} />
                    </div>
                )}

                {/* HISTORY TAB */}
                {activeTab === "history" && (
                    <div>
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "10px 16px",
                                borderBottom: `1px solid ${theme.border}`,
                            }}
                        >
                            <span
                                style={{
                                    fontSize: 8,
                                    fontWeight: 500,
                                    letterSpacing: "0.2em",
                                    color: theme.text3,
                                    textTransform: "uppercase",
                                }}
                            >
                                {history.length} scan{history.length !== 1 ? "s" : ""} logged
                            </span>
                            {history.length > 0 && (
                                <button
                                    onClick={() => {
                                        useNetGuardStore.getState().clearHistory();
                                        chrome.storage.local.clear();
                                    }}
                                    style={{
                                        background: "none",
                                        border: "none",
                                        cursor: "pointer",
                                        fontSize: 9,
                                        color: theme.text3,
                                        fontFamily: theme.mono,
                                        letterSpacing: "0.1em",
                                    }}
                                >
                                    ✕ Clear
                                </button>
                            )}
                        </div>
                        <HistoryTable history={history} />
                    </div>
                )}

                {/* SETTINGS TAB */}
                {activeTab === "settings" && (
                    <div style={{ padding: "16px" }}>
                        <p
                            style={{
                                fontSize: 8,
                                fontWeight: 500,
                                letterSpacing: "0.2em",
                                color: theme.text3,
                                textTransform: "uppercase",
                                marginBottom: 12,
                                paddingBottom: 8,
                                borderBottom: `1px solid ${theme.border}`,
                            }}
                        >
                            Analysis Modules
                        </p>

                        {(
                            [
                                {
                                    key: "dohEnabled",
                                    label: "DNS-over-HTTPS",
                                    desc: "Cloudflare DoH — bypasses system DNS",
                                },
                                {
                                    key: "mlEnabled",
                                    label: "ML Classifier",
                                    desc: "Local ONNX — zero data sent anywhere",
                                },
                                {
                                    key: "phishingHeuristicsEnabled",
                                    label: "URL Heuristics",
                                    desc: "Entropy, length, TLD rarity scoring",
                                },
                                {
                                    key: "vpnDetectionEnabled",
                                    label: "VPN Detection",
                                    desc: "MaxMind GeoIP2 + WireGuard signatures",
                                },
                                {
                                    key: "virusTotalOptIn",
                                    label: "VirusTotal",
                                    desc: "Sends high-risk URLs to 70+ AV engines",
                                },
                                {
                                    key: "notifications",
                                    label: "Notifications",
                                    desc: "OS alert on HIGH / CRITICAL risk",
                                },
                            ] as { key: keyof typeof preferences; label: string; desc: string }[]
                        ).map(({ key, label, desc }) => {
                            const on = preferences[key] as boolean;
                            return (
                                <div
                                    key={key}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 12,
                                        padding: "10px 12px",
                                        marginBottom: 4,
                                        background: theme.surface,
                                        border: `1px solid ${on ? "rgba(200,245,66,0.2)" : theme.border}`,
                                        borderLeft: on
                                            ? `2px solid ${theme.lime}`
                                            : `2px solid transparent`,
                                        transition: "border-color 0.15s",
                                    }}
                                >
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p
                                            style={{
                                                fontSize: 11,
                                                fontWeight: 600,
                                                color: theme.text,
                                                margin: 0,
                                                letterSpacing: "0.02em",
                                            }}
                                        >
                                            {label}
                                        </p>
                                        <p
                                            style={{
                                                fontSize: 9,
                                                color: theme.text3,
                                                margin: "2px 0 0",
                                                fontFamily: theme.sans,
                                            }}
                                        >
                                            {desc}
                                        </p>
                                    </div>

                                    {/* Square toggle */}
                                    <div
                                        onClick={() =>
                                            setPreferences({
                                                ...preferences,
                                                [key]: !preferences[key],
                                            })
                                        }
                                        style={{
                                            width: 36,
                                            height: 20,
                                            position: "relative",
                                            cursor: "pointer",
                                            flexShrink: 0,
                                            background: on ? theme.limeDim : theme.surface3,
                                            border: `1px solid ${on ? "rgba(200,245,66,0.4)" : theme.border2}`,
                                            transition: "all 0.2s",
                                        }}
                                    >
                                        <div
                                            style={{
                                                position: "absolute",
                                                top: 3,
                                                left: on ? 17 : 3,
                                                width: 12,
                                                height: 12,
                                                background: on ? theme.lime : theme.text3,
                                                transition: "all 0.2s",
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}

                        <button
                            onClick={() =>
                                chrome.runtime.sendMessage({
                                    type: "UPDATE_SETTINGS",
                                    payload: preferences,
                                })
                            }
                            style={{
                                width: "100%",
                                marginTop: 12,
                                padding: "10px",
                                background: theme.limeDim,
                                border: `1px solid rgba(200,245,66,0.3)`,
                                color: theme.lime,
                                fontFamily: theme.mono,
                                fontSize: 9,
                                fontWeight: 700,
                                letterSpacing: "0.2em",
                                textTransform: "uppercase",
                                cursor: "pointer",
                            }}
                        >
                            Save Configuration
                        </button>

                        <div
                            style={{
                                marginTop: 12,
                                paddingTop: 10,
                                borderTop: `1px solid ${theme.border}`,
                                textAlign: "center",
                            }}
                        >
                            <button
                                onClick={() => chrome.runtime.openOptionsPage()}
                                style={{
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    fontSize: 9,
                                    color: theme.text3,
                                    fontFamily: theme.mono,
                                    letterSpacing: "0.1em",
                                }}
                            >
                                Open full settings page →
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Tab bar ── */}
            <div style={S.tabBar}>
                {tabs.map(({ id, icon, label }) => {
                    const active = activeTab === id;
                    return (
                        <button
                            key={id}
                            onClick={() => setActiveTab(id)}
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: 3,
                                padding: "10px 0",
                                cursor: "pointer",
                                border: "none",
                                background: active ? theme.surface2 : "transparent",
                                color: active ? theme.lime : theme.text3,
                                fontFamily: theme.mono,
                                transition: "all 0.15s",
                                boxShadow: active ? `inset 0 2px 0 ${theme.lime}` : "none",
                            }}
                        >
                            <span style={{ fontSize: 14, lineHeight: 1 }}>{icon}</span>
                            <span
                                style={{
                                    fontSize: 7,
                                    fontWeight: 600,
                                    letterSpacing: "0.2em",
                                    textTransform: "uppercase",
                                }}
                            >
                                {label}
                            </span>
                        </button>
                    );
                })}
            </div>

            <style>{`
        @keyframes ngPulse2 { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes ngLoad { 0%{transform:translateX(-100%)} 100%{transform:translateX(200%)} }
      `}</style>
        </div>
    );
}
