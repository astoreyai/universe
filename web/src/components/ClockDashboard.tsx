import React, { useRef, useEffect, useState } from "react";
import { engine, TimeRepresentations } from "../engine/wasm-bridge";

// ─── Clock config with descriptions and rate data ──────────────────────────

const CLOCKS = [
  { key: "utc", label: "UTC", full: "Coordinated Universal Time", color: "#3b82f6",
    rateLabel: "Civil reference", rateFactor: 1.0, rateNsPerSec: 0,
    why: "Basis for civil timekeeping worldwide. Adjusted by leap seconds to match Earth rotation.",
    use: "GPS timestamps, internet protocols, international coordination" },
  { key: "tai", label: "TAI", full: "International Atomic Time", color: "#8b5cf6",
    rateLabel: "UTC + 37 leap sec", rateFactor: 1.0, rateNsPerSec: 0,
    why: "Continuous atomic time without leap seconds. Foundation for all precision time scales.",
    use: "Metrology, particle physics, satellite clocks" },
  { key: "tt", label: "TT", full: "Terrestrial Time", color: "#a78bfa",
    rateLabel: "TAI + 32.184s", rateFactor: 1.0, rateNsPerSec: 0,
    why: "Ideal clock on the geoid (sea level). Removes Earth gravity from the reference.",
    use: "Planetary ephemerides, astronomical almanacs" },
  { key: "tcg", label: "TCG", full: "Geocentric Coordinate Time", color: "#06b6d4",
    rateLabel: "+0.70 ns/s vs TT", rateFactor: 1.0000000006969, rateNsPerSec: 0.6969,
    why: "Time as measured infinitely far from Earth but at rest relative to it. Ticks faster because no gravity.",
    use: "Satellite orbit propagation, lunar ranging" },
  { key: "tcb", label: "TCB", full: "Barycentric Coordinate Time", color: "#14b8a6",
    rateLabel: "+15.5 ns/s vs TT", rateFactor: 1.0000000155, rateNsPerSec: 15.505,
    why: "Time at the solar system barycenter, free from Sun's gravity well. Fastest standard clock.",
    use: "Interplanetary navigation, pulsar timing, VLBI" },
  { key: "mtc", label: "MTC", full: "Mars Coordinated Time", color: "#f59e0b",
    rateLabel: "1 sol = 24h 39m 35s", rateFactor: 1.02749, rateNsPerSec: 27490000,
    why: "Time on Mars surface. A Martian sol is 2.749% longer than an Earth day.",
    use: "Mars rover operations, future Mars missions" },
];

// Max rate for bar visualization (TCB)
const MAX_RATE = 16;

// ─── Main component ────────────────────────────────────────────────────────

export function ClockDashboard() {
  const [time, setTime] = useState<TimeRepresentations | null>(null);
  const [mtcStr, setMtcStr] = useState("--:--:--");
  const [elapsed, setElapsed] = useState(0);
  const [selectedClock, setSelectedClock] = useState<string | null>(null);
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
      } catch {}
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!time) return null;

  const safe = (v: number, d: number) => (isNaN(v) || v == null) ? "\u2014" : v.toFixed(d);
  const utcStr = new Date(time.unix_utc * 1000).toISOString().replace("T", " ").slice(0, 19);
  const taiStr = new Date((time.unix_utc + 37) * 1000).toISOString().replace("T", " ").slice(0, 19);
  const ttStr = new Date((time.unix_utc + 69.184) * 1000).toISOString().replace("T", " ").slice(0, 19);

  const clockValues: Record<string, { main: string; detail: string }> = {
    utc: { main: utcStr, detail: `JD ${safe(time.jd_utc, 6)}` },
    tai: { main: taiStr, detail: "UTC + 37 leap seconds" },
    tt: { main: ttStr, detail: `JD ${safe(time.jd_tt, 6)}` },
    tcg: { main: `TT + ${safe(time.tcg_minus_tt_s, 6)} s`, detail: `Rate: 1 + ${(6.96929e-10).toExponential(4)}` },
    tcb: { main: `TT + ${safe(time.tcb_minus_tt_s, 4)} s`, detail: `Rate: 1 + ${(1.55052e-8).toExponential(4)}` },
    mtc: { main: mtcStr, detail: `Sol ${safe(time.mars_sol_date, 4)}` },
  };

  const selInfo = selectedClock ? CLOCKS.find(c => c.key === selectedClock) : null;

  return (
    <div style={styles.container} className="scene-layout">
      <div style={styles.vizSection} className="scene-canvas">
        <svg viewBox="0 0 640 520" style={{ width: "100%", height: "100%" }}>
          <defs>
            <radialGradient id="bg-grad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#0f172a" />
              <stop offset="100%" stopColor="#020208" />
            </radialGradient>
          </defs>
          <rect width="640" height="520" fill="url(#bg-grad)" />

          <text x={320} y={28} textAnchor="middle" fill="#94a3b8" fontSize={14} fontWeight={600} letterSpacing={3}>
            RELATIVISTIC CLOCK COMPARISON
          </text>
          <text x={320} y={44} textAnchor="middle" fill="#94a3b8" fontSize={10}>
            Each clock ticks at its own rate {"\u2014"} click any clock for details
          </text>

          {/* 6 animated clock faces in 2 rows */}
          {CLOCKS.map((c, i) => {
            const col = i % 3;
            const row = Math.floor(i / 3);
            const cx = 120 + col * 200;
            const cy = 130 + row * 165;
            const r = 50;
            const val = clockValues[c.key];
            const isSel = selectedClock === c.key;

            const secondAngle = (elapsed * c.rateFactor * 6) % 360;
            const minuteAngle = (elapsed * c.rateFactor * 0.1) % 360;
            const sx = cx + Math.sin((secondAngle * Math.PI) / 180) * (r - 8);
            const sy = cy - Math.cos((secondAngle * Math.PI) / 180) * (r - 8);
            const mx = cx + Math.sin((minuteAngle * Math.PI) / 180) * (r - 18);
            const my = cy - Math.cos((minuteAngle * Math.PI) / 180) * (r - 18);

            return (
              <g key={c.key} onClick={() => setSelectedClock(isSel ? null : c.key)} style={{ cursor: "pointer" }}>
                {/* Selection highlight */}
                {isSel && <circle cx={cx} cy={cy} r={r + 6} fill="none" stroke={c.color} strokeWidth={2} opacity={0.3} strokeDasharray="4,4" />}

                {/* Clock face */}
                <circle cx={cx} cy={cy} r={r} fill="rgba(15,23,42,0.5)" stroke={c.color} strokeWidth={isSel ? 2.5 : 1.5} opacity={isSel ? 0.8 : 0.4} />

                {/* Hour markers */}
                {Array.from({ length: 12 }).map((_, h) => {
                  const a = (h * 30 * Math.PI) / 180;
                  return <line key={h}
                    x1={cx + Math.sin(a) * (r - 4)} y1={cy - Math.cos(a) * (r - 4)}
                    x2={cx + Math.sin(a) * (r - (h % 3 === 0 ? 11 : 7))} y2={cy - Math.cos(a) * (r - (h % 3 === 0 ? 11 : 7))}
                    stroke={c.color} strokeWidth={h % 3 === 0 ? 1.5 : 0.5} opacity={0.6} />;
                })}

                <line x1={cx} y1={cy} x2={mx} y2={my} stroke={c.color} strokeWidth={1.5} opacity={0.5} strokeLinecap="round" />
                <line x1={cx} y1={cy} x2={sx} y2={sy} stroke={c.color} strokeWidth={1} opacity={0.9} strokeLinecap="round" />
                <circle cx={cx} cy={cy} r={2} fill={c.color} />

                <text x={cx} y={cy - r - 8} textAnchor="middle" fill={c.color} fontSize={13} fontWeight={700} letterSpacing={2}>
                  {c.label}
                </text>
                <text x={cx} y={cy + r + 14} textAnchor="middle" fill="#e2e8f0" fontSize={10} fontFamily="'JetBrains Mono', monospace">
                  {val.main.length > 19 ? val.main.slice(0, 19) : val.main}
                </text>
                <text x={cx} y={cy + r + 26} textAnchor="middle" fill="#94a3b8" fontSize={10}>
                  {c.rateLabel}
                </text>
              </g>
            );
          })}

          {/* Rate comparison bars at bottom */}
          <text x={30} y={380} fill="#94a3b8" fontSize={11} fontWeight={600}>Rate vs TT (ns/s faster)</text>
          {CLOCKS.filter(c => c.rateNsPerSec > 0 && c.key !== "mtc").map((c, i) => {
            const y = 395 + i * 22;
            const barWidth = Math.min((c.rateNsPerSec / MAX_RATE) * 400, 400);
            return (
              <g key={c.key}>
                <text x={30} y={y + 4} fill={c.color} fontSize={10} fontWeight={600}>{c.label}</text>
                <rect x={70} y={y - 6} width={barWidth} height={12} rx={3} fill={c.color} opacity={0.3} />
                <rect x={70} y={y - 6} width={barWidth} height={12} rx={3} fill={c.color} opacity={0.15} />
                <text x={75 + barWidth} y={y + 4} fill="#e2e8f0" fontSize={10}>+{c.rateNsPerSec.toFixed(2)} ns/s</text>
              </g>
            );
          })}

          {/* 1 hour comparison */}
          <text x={30} y={470} fill="#94a3b8" fontSize={11} fontWeight={600}>After 1 hour, TCB gains:</text>
          <text x={30} y={486} fill="#14b8a6" fontSize={12} fontFamily="'JetBrains Mono', monospace">
            +{(15.505 * 3600).toFixed(0)} ns = +{(15.505 * 3600 / 1000).toFixed(1)} {"\u03BCs"} = +0.0558 ms
          </text>
          <text x={30} y={502} fill="#94a3b8" fontSize={10}>
            GPS clocks must correct for this {"\u2014"} without relativity, GPS drifts ~10 km/day
          </text>

          {/* Relationship chain */}
          <g opacity={0.5}>
            <text x={320} y={516} textAnchor="middle" fill="#94a3b8" fontSize={10}>
              UTC {"\u2192"} TAI (+37s) {"\u2192"} TT (+32.184s) {"\u2192"} TCG ({"\u00D7"}1+L_G) | TCB ({"\u00D7"}1+L_B)
            </text>
          </g>
        </svg>
      </div>

      <div style={styles.panel} className="scene-panel">
        <div style={styles.panelTitle}>Time Scales</div>
        <div style={styles.subtitle}>Multi-frame temporal reference system</div>

        {/* Selected clock detail card */}
        {selInfo && (
          <div style={{ ...styles.detailCard, borderColor: selInfo.color + "50" }}>
            <div style={{ ...styles.detailLabel, color: selInfo.color }}>{selInfo.label} {"\u2014"} {selInfo.full}</div>
            <div style={styles.detailWhy}>{selInfo.why}</div>
            <div style={styles.detailUse}><strong>Used for:</strong> {selInfo.use}</div>
          </div>
        )}

        <div style={styles.clockList}>
          {CLOCKS.map((c) => {
            const val = clockValues[c.key];
            const isSel = selectedClock === c.key;
            return (
              <div key={c.key} style={{ ...styles.clockRow, ...(isSel ? { borderLeft: `3px solid ${c.color}` } : {}) }}
                onClick={() => setSelectedClock(isSel ? null : c.key)}>
                <div style={{ ...styles.clockLabel, color: c.color }}>{c.label}</div>
                <div style={styles.clockValue}>{val.main}</div>
                <div style={styles.clockDetail}>{val.detail}</div>
              </div>
            );
          })}
        </div>

        <div style={styles.rateCard}>
          <div style={styles.infoTitle}>Live Drift ({elapsed.toFixed(0)}s elapsed)</div>
          <div style={styles.driftRow}>
            <span>TCG vs TT</span>
            <span style={{ color: "#06b6d4" }}>+{(elapsed * 0.6969).toFixed(3)} ns</span>
          </div>
          <div style={styles.driftRow}>
            <span>TCB vs TT</span>
            <span style={{ color: "#14b8a6" }}>+{(elapsed * 15.505).toFixed(1)} ns</span>
          </div>
          <div style={styles.driftRow}>
            <span>MTC vs UTC</span>
            <span style={{ color: "#f59e0b" }}>+{(elapsed * 0.02749).toFixed(1)}s</span>
          </div>
        </div>

        <div style={styles.infoCard}>
          <div style={styles.infoTitle}>Why It Matters</div>
          <div style={styles.whyText}>
            GPS satellites carry atomic clocks that tick +38.6 {"\u03BCs"}/day faster than ground clocks
            due to gravitational time dilation. Without relativistic corrections,
            GPS positioning would drift {"\u223C"}10 km/day.
          </div>
        </div>

        <div style={styles.infoCard}>
          <div style={styles.infoTitle}>Constants</div>
          <div style={styles.constants}>
            <div>L_G = 6.969290134 {"\u00d7"} 10{"\u207b\u00b9\u2070"}</div>
            <div>L_B = 1.550519768 {"\u00d7"} 10{"\u207b\u2078"}</div>
            <div>TAI{"\u2013"}UTC = 37 s (since Jan 2017)</div>
            <div>TT{"\u2013"}TAI = 32.184 s (exact)</div>
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
  detailCard: {
    background: "#0f172a", borderRadius: "6px", padding: "10px",
    border: "1px solid", transition: "all 0.3s ease",
  },
  detailLabel: { fontSize: "12px", fontWeight: 700, marginBottom: "4px" },
  detailWhy: { fontSize: "11px", color: "#e2e8f0", marginBottom: "4px", lineHeight: 1.5 },
  detailUse: { fontSize: "10px", color: "#94a3b8", lineHeight: 1.4 },
  clockList: { display: "flex", flexDirection: "column", gap: "6px" },
  clockRow: {
    background: "#0f172a", borderRadius: "6px", padding: "6px 10px",
    cursor: "pointer", transition: "all 0.2s ease", borderLeft: "3px solid transparent",
  },
  clockLabel: { fontSize: "11px", fontWeight: 700, letterSpacing: "2px" },
  clockValue: { fontSize: "13px", fontWeight: 600, color: "#f1f5f9", fontVariantNumeric: "tabular-nums" },
  clockDetail: { fontSize: "10px", color: "#64748b", fontVariantNumeric: "tabular-nums" },
  rateCard: { background: "#0f172a", borderRadius: "6px", padding: "10px", display: "flex", flexDirection: "column", gap: "4px" },
  infoTitle: { fontSize: "11px", fontWeight: 600, color: "#94a3b8", marginBottom: "4px", letterSpacing: "0.5px" },
  driftRow: { display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#94a3b8", fontVariantNumeric: "tabular-nums" },
  infoCard: { background: "#0f172a", borderRadius: "6px", padding: "10px" },
  whyText: { fontSize: "11px", color: "#e2e8f0", lineHeight: 1.5 },
  constants: { fontSize: "10px", color: "#64748b", display: "flex", flexDirection: "column", gap: "2px" },
};
