import React, { useRef, useEffect, useState } from "react";
import { engine, TimeRepresentations } from "../engine/wasm-bridge";

// ─── Clock visual config ───────────────────────────────────────────────────

const CLOCKS = [
  { key: "utc", label: "UTC", full: "Coordinated Universal Time", color: "#3b82f6", rateLabel: "Civil reference", rateFactor: 1.0 },
  { key: "tai", label: "TAI", full: "International Atomic Time", color: "#8b5cf6", rateLabel: "UTC + 37 leap sec", rateFactor: 1.0 },
  { key: "tt", label: "TT", full: "Terrestrial Time", color: "#a78bfa", rateLabel: "TAI + 32.184s", rateFactor: 1.0 },
  { key: "tcg", label: "TCG", full: "Geocentric Coordinate Time", color: "#06b6d4", rateLabel: "Faster: +0.70 ns/s", rateFactor: 1.0000000006969 },
  { key: "tcb", label: "TCB", full: "Barycentric Coordinate Time", color: "#14b8a6", rateLabel: "Faster: +15.5 ns/s", rateFactor: 1.0000000155 },
  { key: "mtc", label: "MTC", full: "Mars Coordinated Time", color: "#f59e0b", rateLabel: "1 sol = 24h 39m 35s", rateFactor: 1.02749 },
];

// ─── Main component ────────────────────────────────────────────────────────

export function ClockDashboard() {
  const [time, setTime] = useState<TimeRepresentations | null>(null);
  const [mtcStr, setMtcStr] = useState("--:--:--");
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      try {
        const now = Date.now() / 1000;
        const t = engine.getTimeRepresentations(now);
        if (t) setTime(t);
        const mtc = engine.getMTC(now);
        if (mtc) setMtcStr(mtc);
        setElapsed((Date.now() - startRef.current) / 1000);
      } catch (e) {
        // engine not ready or call failed — skip frame
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!time) return null;

  const utcDate = new Date(time.unix_utc * 1000);
  const utcStr = utcDate.toISOString().replace("T", " ").slice(0, 19);
  const taiDate = new Date((time.unix_utc + 37) * 1000);
  const taiStr = taiDate.toISOString().replace("T", " ").slice(0, 19);
  const ttDate = new Date((time.unix_utc + 69.184) * 1000);
  const ttStr = ttDate.toISOString().replace("T", " ").slice(0, 19);

  const safe = (v: number, digits: number) => (isNaN(v) || v == null) ? "\u2014" : v.toFixed(digits);

  const clockValues: Record<string, { main: string; detail: string }> = {
    utc: { main: utcStr, detail: `JD ${safe(time.jd_utc, 6)}` },
    tai: { main: taiStr, detail: "UTC + 37 leap seconds" },
    tt: { main: ttStr, detail: `JD ${safe(time.jd_tt, 6)}` },
    tcg: { main: `TT + ${safe(time.tcg_minus_tt_s, 6)} s`, detail: `Rate: 1 + ${(6.96929e-10).toExponential(4)}` },
    tcb: { main: `TT + ${safe(time.tcb_minus_tt_s, 4)} s`, detail: `Rate: 1 + ${(1.55052e-8).toExponential(4)}` },
    mtc: { main: mtcStr, detail: `Sol ${safe(time.mars_sol_date, 4)}` },
  };

  return (
    <div style={styles.container} className="scene-layout">
      {/* Animated clock comparison visualization */}
      <div style={styles.vizSection} className="scene-canvas">
        <svg viewBox="0 0 640 480" style={{ width: "100%", height: "100%" }}>
          <defs>
            <radialGradient id="bg-grad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#0f172a" />
              <stop offset="100%" stopColor="#020208" />
            </radialGradient>
          </defs>
          <rect width="640" height="480" fill="url(#bg-grad)" />

          {/* Title */}
          <text x={320} y={30} textAnchor="middle" fill="#94a3b8" fontSize={14} fontWeight={600} letterSpacing={3}>
            RELATIVISTIC CLOCK COMPARISON
          </text>
          <text x={320} y={48} textAnchor="middle" fill="#94a3b8" fontSize={10}>
            Watch how different time scales tick at different rates
          </text>

          {/* 6 animated clock faces */}
          {CLOCKS.map((c, i) => {
            const col = i % 3;
            const row = Math.floor(i / 3);
            const cx = 120 + col * 200;
            const cy = 140 + row * 180;
            const r = 55;
            const val = clockValues[c.key];

            // Animated second hand — each clock ticks at its own rate
            const secondAngle = (elapsed * c.rateFactor * 6) % 360; // 6°/sec
            const minuteAngle = (elapsed * c.rateFactor * 0.1) % 360;
            const sx = cx + Math.sin((secondAngle * Math.PI) / 180) * (r - 10);
            const sy = cy - Math.cos((secondAngle * Math.PI) / 180) * (r - 10);
            const mx = cx + Math.sin((minuteAngle * Math.PI) / 180) * (r - 20);
            const my = cy - Math.cos((minuteAngle * Math.PI) / 180) * (r - 20);

            return (
              <g key={c.key}>
                {/* Clock face */}
                <circle cx={cx} cy={cy} r={r} fill="none" stroke={c.color} strokeWidth={2} opacity={0.4} />
                <circle cx={cx} cy={cy} r={r - 2} fill="none" stroke={c.color} strokeWidth={0.5} opacity={0.15} />

                {/* Hour markers */}
                {Array.from({ length: 12 }).map((_, h) => {
                  const a = (h * 30 * Math.PI) / 180;
                  const x1 = cx + Math.sin(a) * (r - 5);
                  const y1 = cy - Math.cos(a) * (r - 5);
                  const x2 = cx + Math.sin(a) * (r - (h % 3 === 0 ? 12 : 8));
                  const y2 = cy - Math.cos(a) * (r - (h % 3 === 0 ? 12 : 8));
                  return <line key={h} x1={x1} y1={y1} x2={x2} y2={y2} stroke={c.color} strokeWidth={h % 3 === 0 ? 1.5 : 0.5} opacity={0.6} />;
                })}

                {/* Minute hand */}
                <line x1={cx} y1={cy} x2={mx} y2={my} stroke={c.color} strokeWidth={1.5} opacity={0.5} strokeLinecap="round" />

                {/* Second hand */}
                <line x1={cx} y1={cy} x2={sx} y2={sy} stroke={c.color} strokeWidth={1} opacity={0.9} strokeLinecap="round" />

                {/* Center dot */}
                <circle cx={cx} cy={cy} r={2} fill={c.color} />

                {/* Label */}
                <text x={cx} y={cy - r - 10} textAnchor="middle" fill={c.color} fontSize={14} fontWeight={700} letterSpacing={2}>
                  {c.label}
                </text>

                {/* Current value below clock */}
                <text x={cx} y={cy + r + 16} textAnchor="middle" fill="#e2e8f0" fontSize={10} fontFamily="'JetBrains Mono', monospace">
                  {val.main.length > 19 ? val.main.slice(0, 19) : val.main}
                </text>

                {/* Rate difference */}
                <text x={cx} y={cy + r + 28} textAnchor="middle" fill="#94a3b8" fontSize={10}>
                  {c.rateLabel}
                </text>
              </g>
            );
          })}

          {/* Rate comparison arrow showing TCG ticks faster than TT */}
          <g opacity={0.6}>
            <text x={320} y={440} textAnchor="middle" fill="#94a3b8" fontSize={10}>
              UTC {"\u2192"} TAI (+37s) {"\u2192"} TT (+32.184s) {"\u2192"} TCG ({"\u00D7"}1+L_G) | TCB ({"\u00D7"}1+L_B)
            </text>
            <text x={320} y={455} textAnchor="middle" fill="#94a3b8" fontSize={10}>
              L_G = 6.969{"\u00D7"}10{"\u207B\u00B9\u2070"} | L_B = 1.551{"\u00D7"}10{"\u207B\u2078"} | MTC sol = 88,775.244s
            </text>
          </g>
        </svg>
      </div>

      {/* Data panel */}
      <div style={styles.panel} className="scene-panel">
        <div style={styles.panelTitle}>Time Scales</div>
        <div style={styles.subtitle}>Multi-frame temporal reference system</div>

        <div style={styles.clockList}>
          {CLOCKS.map((c) => {
            const val = clockValues[c.key];
            return (
              <div key={c.key} style={styles.clockRow}>
                <div style={{ ...styles.clockLabel, color: c.color }}>{c.label}</div>
                <div style={styles.clockFull}>{c.full}</div>
                <div style={styles.clockValue}>{val.main}</div>
                <div style={styles.clockDetail}>{val.detail}</div>
              </div>
            );
          })}
        </div>

        <div style={styles.infoCard}>
          <div style={styles.infoTitle}>Time Scale Relationships</div>
          <div style={styles.chain}>
            UTC <span style={styles.arrow}>+37s</span> TAI{" "}
            <span style={styles.arrow}>+32.184s</span> TT{" "}
            <span style={styles.arrow}>{"\u00d7"}(1+L_G)</span> TCG{" "}
            <span style={styles.arrow}>metric</span> TCB{" "}
            <span style={styles.arrow}>{"\u00d7"}(1-L_B)</span> TDB
          </div>
          <div style={styles.constants}>
            <div>L_G = 6.969290134 {"\u00d7"} 10{"\u207b\u00b9\u2070"}</div>
            <div>L_B = 1.550519768 {"\u00d7"} 10{"\u207b\u2078"}</div>
          </div>
        </div>

        <div style={styles.rateCard}>
          <div style={styles.infoTitle}>Drift After {elapsed.toFixed(0)}s Viewing</div>
          <div style={styles.driftRow}>
            <span>TCG vs TT</span>
            <span style={{ color: "#06b6d4" }}>+{(elapsed * 6.96929e-10 * 1e9).toFixed(3)} ns</span>
          </div>
          <div style={styles.driftRow}>
            <span>TCB vs TT</span>
            <span style={{ color: "#14b8a6" }}>+{(elapsed * 1.55052e-8 * 1e9).toFixed(1)} ns</span>
          </div>
          <div style={styles.driftRow}>
            <span>MTC vs UTC</span>
            <span style={{ color: "#f59e0b" }}>+{(elapsed * 0.02749).toFixed(1)}s (sol drift)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: { display: "flex", height: "calc(100vh - 130px)", gap: "0" },
  vizSection: {
    flex: 1, background: "#020208", borderRadius: "8px",
    border: "1px solid #1e293b", overflow: "hidden",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  panel: {
    width: "320px", background: "#111827", border: "1px solid #1e293b",
    borderRadius: "8px", padding: "14px", marginLeft: "10px",
    overflow: "auto", display: "flex", flexDirection: "column", gap: "10px",
  },
  panelTitle: { fontSize: "13px", fontWeight: 600, color: "#94a3b8", letterSpacing: "1px", textTransform: "uppercase" as const },
  subtitle: { fontSize: "10px", color: "#64748b", marginTop: "-6px" },
  clockList: { display: "flex", flexDirection: "column", gap: "8px" },
  clockRow: { background: "#0f172a", borderRadius: "6px", padding: "8px 10px" },
  clockLabel: { fontSize: "12px", fontWeight: 700, letterSpacing: "2px", marginBottom: "1px" },
  clockFull: { fontSize: "10px", color: "#94a3b8", marginBottom: "3px" },
  clockValue: { fontSize: "14px", fontWeight: 600, color: "#f1f5f9", fontVariantNumeric: "tabular-nums", marginBottom: "2px" },
  clockDetail: { fontSize: "10px", color: "#64748b", fontVariantNumeric: "tabular-nums" },
  infoCard: { background: "#0f172a", borderRadius: "6px", padding: "10px" },
  infoTitle: { fontSize: "11px", fontWeight: 600, color: "#94a3b8", marginBottom: "6px", letterSpacing: "0.5px" },
  chain: { fontSize: "11px", color: "#e2e8f0", marginBottom: "6px", lineHeight: 1.8 },
  arrow: { color: "#60a5fa", fontSize: "10px", padding: "0 3px" },
  constants: { fontSize: "10px", color: "#64748b", display: "flex", flexDirection: "column", gap: "2px" },
  rateCard: { background: "#0f172a", borderRadius: "6px", padding: "10px", display: "flex", flexDirection: "column", gap: "4px" },
  driftRow: { display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#94a3b8", fontVariantNumeric: "tabular-nums" },
};
