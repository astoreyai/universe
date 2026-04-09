import React, { useRef, useEffect, useState } from "react";
import { engine, TimeRepresentations } from "../engine/wasm-bridge";

// ─── Clock config with descriptions and rate data ──────────────────────────

const CLOCKS = [
  { key: "utc", label: "UTC", full: "Coordinated Universal Time", color: "#3b82f6",
    rateLabel: "Civil reference", rateFactor: 1.0, rateNsPerSec: 0, tier: 0,
    why: "Basis for civil timekeeping worldwide. Adjusted by leap seconds to match Earth rotation.",
    use: "GPS timestamps, internet protocols, international coordination",
    whyYouCare: "GPS timestamps, internet time sync" },
  { key: "tai", label: "TAI", full: "International Atomic Time", color: "#8b5cf6",
    rateLabel: "UTC + 37 leap sec", rateFactor: 1.0, rateNsPerSec: 0, tier: 0,
    why: "Continuous atomic time without leap seconds. Foundation for all precision time scales.",
    use: "Metrology, particle physics, satellite clocks",
    whyYouCare: "Particle physics experiments need continuous time" },
  { key: "tt", label: "TT", full: "Terrestrial Time", color: "#a78bfa",
    rateLabel: "TAI + 32.184s", rateFactor: 1.0, rateNsPerSec: 0, tier: 0,
    why: "Ideal clock on the geoid (sea level). Removes Earth gravity from the reference.",
    use: "Planetary ephemerides, astronomical almanacs",
    whyYouCare: "Astronomical almanacs must account for Earth's geoid" },
  { key: "tcg", label: "TCG", full: "Geocentric Coordinate Time", color: "#06b6d4",
    rateLabel: "+0.70 ns/s vs TT", rateFactor: 1.0000000006969, rateNsPerSec: 0.6969, tier: 1,
    why: "Time as measured infinitely far from Earth but at rest relative to it. Ticks faster because no gravity.",
    use: "Satellite orbit propagation, lunar ranging",
    whyYouCare: "Lunar laser ranging needs gravity-free reference" },
  { key: "tcb", label: "TCB", full: "Barycentric Coordinate Time", color: "#14b8a6",
    rateLabel: "+15.5 ns/s vs TT", rateFactor: 1.0000000155, rateNsPerSec: 15.505, tier: 1,
    why: "Time at the solar system barycenter, free from Sun's gravity well. Fastest standard clock.",
    use: "Interplanetary navigation, pulsar timing, VLBI",
    whyYouCare: "Voyager navigation, pulsar timing arrays" },
  { key: "mtc", label: "MTC", full: "Mars Coordinated Time", color: "#f59e0b",
    rateLabel: "1 sol = 24h 39m 35s", rateFactor: 1.02749, rateNsPerSec: 27490000, tier: 2,
    why: "Time on Mars surface. A Martian sol is 2.749% longer than an Earth day.",
    use: "Mars rover operations, future Mars missions",
    whyYouCare: "Mars rover daily operations planning" },
];

// Dynamic max rate for bar visualization (exclude MTC which uses separate scale)
const MAX_RATE = Math.max(...CLOCKS.filter(c => c.key !== "mtc").map(c => c.rateNsPerSec)) * 1.1;

// Tier labels
const TIER_LABELS = ["Earth Reference Refinements", "Gravity-Corrected", "Planetary"];

// ─── Main component ────────────────────────────────────────────────────────

export function ClockDashboard() {
  const [time, setTime] = useState<TimeRepresentations | null>(null);
  const [mtcStr, setMtcStr] = useState("--:--:--");
  const [elapsed, setElapsed] = useState(0);
  const [selectedClock, setSelectedClock] = useState<string | null>(null);
  const [driftDuration, setDriftDuration] = useState(3600);
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

  // Tier layout: Row 1 (y~120): UTC, TAI, TT. Row 2 (y~260): TCG, TCB. Row 3 (y~380): MTC
  const tierYPositions = [120, 260, 380];
  const tierClocks = [
    CLOCKS.filter(c => c.tier === 0),
    CLOCKS.filter(c => c.tier === 1),
    CLOCKS.filter(c => c.tier === 2),
  ];

  // Rate bars: non-MTC clocks with rate > 0
  const rateClocks = CLOCKS.filter(c => c.rateNsPerSec > 0 && c.key !== "mtc");

  return (
    <div style={styles.container} className="scene-layout">
      <div style={styles.vizSection} className="scene-canvas">
        <svg viewBox="0 0 640 580" style={{ width: "100%", height: "100%" }}>
          <defs>
            <radialGradient id="bg-grad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#0f172a" />
              <stop offset="100%" stopColor="#020208" />
            </radialGradient>
          </defs>
          <rect width="640" height="580" fill="url(#bg-grad)" />

          <text x={320} y={28} textAnchor="middle" fill="#94a3b8" fontSize={14} fontWeight={600} letterSpacing={3}>
            RELATIVISTIC CLOCK COMPARISON
          </text>
          <text x={320} y={44} textAnchor="middle" fill="#94a3b8" fontSize={10}>
            Each clock ticks at its own rate {"\u2014"} click any clock for details
          </text>

          {/* Relationship chain — moved here from bottom */}
          <g opacity={0.8}>
            <text x={320} y={55} textAnchor="middle" fill="#94a3b8" fontSize={10}>
              UTC {"\u2192"} TAI (+37s) {"\u2192"} TT (+32.184s) {"\u2192"} TCG ({"\u00D7"}1+L_G) | TCB ({"\u00D7"}1+L_B)
            </text>
          </g>
          <line x1={120} y1={59} x2={520} y2={59} stroke="#1e293b" strokeWidth={0.5} />

          {/* Tiered clock layout */}
          {tierClocks.map((clocks, tierIdx) => {
            const tierY = tierYPositions[tierIdx];
            const tierLabel = TIER_LABELS[tierIdx];
            const clockCount = clocks.length;
            // Center clocks horizontally
            const totalWidth = clockCount * 200;
            const startX = (640 - totalWidth) / 2 + 100;

            return (
              <g key={`tier-${tierIdx}`}>
                {/* Tier label */}
                <text x={320} y={tierY - 60} textAnchor="middle" fill="#64748b" fontSize={10} fontWeight={600} letterSpacing={1.5} textDecoration="none">
                  {tierLabel.toUpperCase()}
                </text>
                <line x1={320 - 80} y1={tierY - 55} x2={320 + 80} y2={tierY - 55} stroke="#1e293b" strokeWidth={0.5} />

                {/* Clocks in this tier */}
                {clocks.map((c, colIdx) => {
                  const cx = clockCount === 1 ? 320 : startX + colIdx * 200;
                  const cy = tierY;
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
                      {isSel && <circle cx={cx} cy={cy} r={r + 6} fill="none" stroke={c.color} strokeWidth={2} opacity={0.3} strokeDasharray="4,4" />}
                      <circle cx={cx} cy={cy} r={r} fill="rgba(15,23,42,0.5)" stroke={c.color} strokeWidth={isSel ? 2.5 : 1.5} opacity={isSel ? 0.8 : 0.4} />
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
              </g>
            );
          })}

          {/* Rate comparison bars — non-MTC */}
          <text x={30} y={440} fill="#94a3b8" fontSize={11} fontWeight={600}>Rate vs TT (ns/s faster)</text>
          {rateClocks.map((c, i) => {
            const y = 455 + i * 22;
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

          {/* MTC on separate scale */}
          {(() => {
            const mtcClock = CLOCKS.find(c => c.key === "mtc")!;
            const mtcY = 455 + rateClocks.length * 22 + 10;
            return (
              <g>
                <text x={30} y={mtcY} fill="#94a3b8" fontSize={10} fontStyle="italic">MTC uses Mars sol (2.749% longer day)</text>
                <text x={30} y={mtcY + 16} fill={mtcClock.color} fontSize={10} fontWeight={600}>{mtcClock.label}</text>
                <rect x={70} y={mtcY + 6} width={120} height={12} rx={3} fill={mtcClock.color} opacity={0.3} />
                <text x={195} y={mtcY + 16} fill="#e2e8f0" fontSize={10}>+27.49 ms/s</text>
              </g>
            );
          })()}

          {/* Interactive drift calculator */}
          <text x={30} y={545} fill="#94a3b8" fontSize={11} fontWeight={600}>
            Drift in {driftDuration}s ({(driftDuration / 3600).toFixed(1)} hr):
          </text>
          {CLOCKS.filter(c => c.rateNsPerSec > 0).map((c, i) => {
            const driftNs = c.rateNsPerSec * driftDuration;
            const label = c.key === "mtc"
              ? `+${(driftNs / 1e9).toFixed(3)} s`
              : driftNs > 1e6 ? `+${(driftNs / 1e6).toFixed(1)} ms`
              : driftNs > 1e3 ? `+${(driftNs / 1e3).toFixed(1)} \u03BCs`
              : `+${driftNs.toFixed(0)} ns`;
            return (
              <text key={c.key} x={30 + i * 160} y={560} fill={c.color} fontSize={10} fontFamily="'JetBrains Mono', monospace">
                {c.label}: {label}
              </text>
            );
          })}

        </svg>
      </div>

      <div style={styles.panel} className="scene-panel">
        <div style={styles.panelTitle}>Time Scales</div>
        <div style={styles.subtitle}>Multi-frame temporal reference system</div>

        {/* Selected clock detail card */}
        {selInfo && (
          <div style={{ ...styles.detailCard, borderColor: selInfo.color + "50", borderLeft: `3px solid ${selInfo.color}`, background: `${selInfo.color}0D` }}>
            <div style={{ ...styles.detailLabel, color: selInfo.color }}>{selInfo.label} {"\u2014"} {selInfo.full}</div>
            <div style={styles.detailWhy}>{selInfo.why}</div>
            <div style={styles.detailUse}><strong>Used for:</strong> {selInfo.use}</div>
            <div style={{ ...styles.detailWhyYouCare, fontStyle: "normal", fontWeight: 700 }}><strong>Why you care:</strong> {selInfo.whyYouCare}</div>
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

        {/* Interactive drift duration slider */}
        <div style={styles.rateCard}>
          <div style={styles.infoTitle}>Drift Calculator</div>
          <div style={{ fontSize: "9px", color: "#64748b", marginBottom: "2px", fontStyle: "italic" }}>
            Shows accumulated time offset over mission duration
          </div>
          <div style={{ fontSize: "10px", color: "#64748b", marginBottom: "4px" }}>
            Duration: {driftDuration}s ({(driftDuration / 60).toFixed(0)} min)
          </div>
          <input type="range" min="1" max="3600" step="1" value={driftDuration}
            onChange={(e) => setDriftDuration(parseInt(e.target.value))}
            style={{ width: "100%", accentColor: "#3b82f6" }} />
          {CLOCKS.filter(c => c.rateNsPerSec > 0).map(c => {
            const driftNs = c.rateNsPerSec * driftDuration;
            const label = c.key === "mtc"
              ? `+${(driftNs / 1e9).toFixed(3)} s`
              : driftNs > 1e6 ? `+${(driftNs / 1e6).toFixed(1)} ms`
              : driftNs > 1e3 ? `+${(driftNs / 1e3).toFixed(1)} \u03BCs`
              : `+${driftNs.toFixed(0)} ns`;
            return (
              <div key={c.key} style={styles.driftRow}>
                <span style={{ color: c.color }}>{c.label}</span>
                <span style={{ color: c.color }}>{label}</span>
              </div>
            );
          })}
          <div style={{ fontSize: "10px", color: "#14b8a6", marginTop: "4px", borderTop: "1px solid #1e293b", paddingTop: "4px" }}>
            GPS-equivalent drift: {(driftDuration * 15.505 / 1e9 * 3e8 / 1000).toFixed(1)} km
          </div>
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
  detailUse: { fontSize: "10px", color: "#94a3b8", lineHeight: 1.4, marginBottom: "4px" },
  detailWhyYouCare: { fontSize: "10px", color: "#a78bfa", lineHeight: 1.4, fontStyle: "italic" },
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
