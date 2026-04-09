import React, { useMemo, useState } from "react";
import { engine, BodyDilation } from "../engine/wasm-bridge";

// ─── Body visual config ────────────────────────────────────────────────────

const BODY_COLORS: Record<string, string> = {
  Sun: "#ffd54f", Mercury: "#8c8c8c", Venus: "#e8c87a", Earth: "#4a90d9",
  Mars: "#c1440e", Moon: "#c0c0c0", Jupiter: "#c88b3a", Saturn: "#d4b87a",
  "Neutron Star (1.4M\u2609)": "#a78bfa", "Black Hole (3r\u209b)": "#ef4444",
};

// ─── Body descriptions (shown on hover) ───────────────────────────────────

const BODY_DESCRIPTIONS: Record<string, string> = {
  Sun: "Deepest gravity well in solar system \u2014 clocks lose 66s/year",
  Earth: "Our reference frame \u2014 GPS corrects +38.6 \u03BCs/day for satellite clocks",
  Mars: "Weaker gravity than Earth \u2014 clocks run slightly faster",
  Jupiter: "Massive gas giant \u2014 second deepest gravity well",
  "Neutron Star (1.4M\u2609)": "Collapsed stellar core \u2014 extreme spacetime curvature",
  "Black Hole (3r\u209b)": "At 3\u00D7 Schwarzschild radius \u2014 time nearly frozen",
};

// ─── Escape velocity helper ───────────────────────────────────────────────

function computeEscapeVelocity(b: BodyDilation): number | null {
  if (b.surface_gravity <= 0 || b.schwarzschild_radius <= 0) return null;
  const c = 299792458;
  const c2 = c * c;
  const GM = b.schwarzschild_radius * c2 / 2;
  const R = GM / b.surface_gravity;
  return Math.sqrt(2 * GM / R);   // m/s
}

function formatEscapeVelocity(vEsc: number | null): string {
  if (vEsc === null) return "\u2014";
  return `${(vEsc / 1000).toFixed(1)} km/s`;
}

// ─── Pulsing animation style for reference body ──────────────────────────

const pulseKeyframes = `
@keyframes pulse-ref {
  0%, 100% { opacity: 0.9; }
  50% { opacity: 0.4; }
}
`;

export function DilationTable() {
  const [referenceBody, setReferenceBody] = useState("Earth");
  const [hoveredBody, setHoveredBody] = useState<string | null>(null);
  const [compA, setCompA] = useState("Earth");
  const [compB, setCompB] = useState("Sun");

  const bodies = useMemo(() => {
    try {
      return engine.getSolarSystemDilation();
    } catch (e) {
      return [];
    }
  }, []);

  const refBody = bodies.find((b) => b.name === referenceBody);
  const refFactor = refBody?.dilation_factor ?? 1;

  const extremeObjects: BodyDilation[] = useMemo(
    () => {
      try {
        const gmSun = engine.constants.gmSun();
        const c2 = 299792458 * 299792458;
        const nsDilation = engine.schwarzschildDilation(1.4 * gmSun, 10_000);
        const bhGm = 10 * gmSun;
        const bhR = 3 * (2 * bhGm) / c2;
        const bhDilation = engine.schwarzschildDilation(bhGm, bhR);
        return [
          {
            name: "Neutron Star (1.4M\u2609)",
            dilation_factor: isNaN(nsDilation) ? 0 : nsDilation,
            seconds_lost_per_year: engine.secondsLostPerYear(isNaN(nsDilation) ? 0 : nsDilation),
            schwarzschild_radius: (2 * 1.4 * gmSun) / c2,
            surface_gravity: (1.4 * gmSun) / (10_000 * 10_000),
          },
          {
            name: "Black Hole (3r\u209b)",
            dilation_factor: isNaN(bhDilation) ? 0 : bhDilation,
            seconds_lost_per_year: engine.secondsLostPerYear(isNaN(bhDilation) ? 0 : bhDilation),
            schwarzschild_radius: (2 * bhGm) / c2,
            surface_gravity: 0,
          },
        ];
      } catch (e) {
        return [];
      }
    },
    []
  );

  // Sort all bodies by dilation severity (strongest first) — shared by chart + data panel
  const allBodies = useMemo(() => {
    const merged = [...bodies, ...extremeObjects];
    return merged.sort((a, b) => (1 - b.dilation_factor) - (1 - a.dilation_factor));
  }, [bodies, extremeObjects]);

  // Compute radial chart data — use log scale for dilation severity
  const chartBodies = useMemo(() => {
    return allBodies.map((b) => {
      const shift = 1 - b.dilation_factor;
      const logSeverity = shift > 0 ? Math.max(Math.log10(shift) + 10, 0) / 10 : 0;
      const isExtreme = b.name.includes("Neutron") || b.name.includes("Black");
      return { ...b, shift, logSeverity, color: BODY_COLORS[b.name] || "#94a3b8", isExtreme };
    }); // already sorted by allBodies
  }, [allBodies]);

  return (
    <div style={styles.container} className="scene-layout">
      {/* Inject pulse animation */}
      <style>{pulseKeyframes}</style>

      {/* Visual radial chart */}
      <div style={styles.vizSection} className="scene-canvas">
        <svg viewBox="0 0 600 500" style={{ width: "100%", height: "100%" }}>
          <defs>
            {chartBodies.map((b) => (
              <radialGradient key={`g-${b.name}`} id={`grad-${b.name.replace(/[^a-z]/gi, "")}`}>
                <stop offset="0%" stopColor={b.color} stopOpacity={0.6} />
                <stop offset="100%" stopColor={b.color} stopOpacity={0.05} />
              </radialGradient>
            ))}
          </defs>

          {/* Background grid circles */}
          {[80, 140, 200].map((r) => (
            <circle key={r} cx={300} cy={250} r={r} fill="none" stroke="#1e3a5f" strokeWidth={1} opacity={0.25} />
          ))}

          {/* Title */}
          <text x={300} y={28} textAnchor="middle" fill="#94a3b8" fontSize={13} fontWeight={600} letterSpacing={2}>
            GRAVITATIONAL TIME DILATION MAP
          </text>
          <text x={300} y={46} textAnchor="middle" fill="#94a3b8" fontSize={10}>
            Circle size = dilation severity (log scale) | Reference: {referenceBody}
          </text>

          {/* Bodies arranged radially */}
          {chartBodies.map((b, i) => {
            const angle = (i / chartBodies.length) * Math.PI * 2 - Math.PI / 2;
            const dist = 60 + i * 18; // Spread outward
            const cx = 300 + Math.cos(angle) * dist;
            const cy = 250 + Math.sin(angle) * dist;
            const radius = 12 + b.logSeverity * 80; // Visual size based on dilation
            const isHovered = hoveredBody === b.name;
            const isRef = b.name === referenceBody;
            const relDiff = (b.dilation_factor - refFactor) * 86_400 * 1e6;

            // Color-code: green = faster than ref, red = slower than ref (when ref is set)
            const bodyCircleColor = isRef ? b.color
              : b.dilation_factor > refFactor ? "#34d399"
              : b.dilation_factor < refFactor ? "#f87171"
              : b.color;

            return (
              <g key={b.name}
                onPointerEnter={() => setHoveredBody(b.name)}
                onPointerLeave={() => setHoveredBody(null)}
                onClick={() => setReferenceBody(b.isExtreme ? referenceBody : b.name)}
                style={{ cursor: b.isExtreme ? "not-allowed" : "pointer" }}
                opacity={b.isExtreme ? 0.7 : 1}
              >
                {/* Tooltip for extreme objects */}
                {b.isExtreme && <title>Cannot be used as reference frame</title>}

                {/* Gravity well glow */}
                <circle cx={cx} cy={cy} r={radius * 1.5}
                  fill={`url(#grad-${b.name.replace(/[^a-z]/gi, "")})`}
                  opacity={isHovered ? 0.8 : 0.5}
                  style={{ transition: "opacity 0.25s ease" }}
                />
                {/* Body circle — pulsing if reference */}
                <circle cx={cx} cy={cy} r={Math.max(radius * 0.4, 5)}
                  fill={bodyCircleColor}
                  stroke={isRef ? "#fff" : isHovered ? b.color : "none"}
                  strokeWidth={isRef ? 2 : 1}
                  opacity={0.9}
                  style={{
                    transition: "stroke 0.25s ease, stroke-width 0.25s ease",
                    ...(isRef ? { animation: "pulse-ref 2s ease-in-out infinite" } : {}),
                  }}
                />
                {/* Label */}
                <text x={cx} y={cy + radius * 0.4 + 14} textAnchor="middle"
                  fill={isHovered ? "#f1f5f9" : "#94a3b8"} fontSize={10} fontFamily="'JetBrains Mono', monospace">
                  {b.name.length > 12 ? b.name.slice(0, 10) + ".." : b.name}
                </text>
                {/* Dilation value on hover */}
                {isHovered && (
                  <g>
                    <rect x={cx - 55} y={cy - radius * 0.4 - 32} width={110} height={24} rx={4}
                      fill="rgba(15,23,42,0.9)" stroke={b.color + "50"} strokeWidth={1} />
                    <text x={cx} y={cy - radius * 0.4 - 16} textAnchor="middle"
                      fill="#f1f5f9" fontSize={10} fontFamily="'JetBrains Mono', monospace">
                      {b.dilation_factor < 0.999
                        ? `d\u03C4/dt = ${b.dilation_factor.toFixed(4)}`
                        : `1 \u2212 ${(1 - b.dilation_factor).toExponential(2)}`}
                    </text>
                  </g>
                )}
                {/* Connection line to center for reference body */}
                {isRef && (
                  <line x1={300} y1={250} x2={cx} y2={cy} stroke={b.color} strokeWidth={1} strokeDasharray="4,4" opacity={0.3} />
                )}
              </g>
            );
          })}

          {/* Center label */}
          <text x={300} y={248} textAnchor="middle" fill="#94a3b8" fontSize={10}>flat</text>
          <text x={300} y={260} textAnchor="middle" fill="#94a3b8" fontSize={10}>spacetime</text>

          {/* Legend */}
          <text x={30} y={480} fill="#94a3b8" fontSize={10}>
            {"\u25CF"} Larger = stronger gravitational dilation | Click body to set reference frame
          </text>

          {/* Color legend */}
          <text x={300} y={490} textAnchor="middle" fill="#94a3b8" fontSize={9}>
            {"\u25CF"}{" "}
            <tspan fill="#34d399">Green = ticks faster than reference</tspan>
            {" | \u25CF "}
            <tspan fill="#f87171">Red = ticks slower</tspan>
            {" | \u25CF "}
            <tspan fill="#94a3b8">Gray = reference frame</tspan>
          </text>

          {/* Visual scale legend — reference circles */}
          <g>
            <text x={42} y={402} textAnchor="middle" fill="#64748b" fontSize={9} fontWeight={600}>SCALE</text>
            {/* Mild */}
            <circle cx={30} cy={420} r={5} fill="none" stroke="#64748b" strokeWidth={0.8} />
            <text x={42} y={423} fill="#64748b" fontSize={8}>Mild (Earth)</text>
            {/* Moderate */}
            <circle cx={30} cy={440} r={10} fill="none" stroke="#64748b" strokeWidth={0.8} />
            <text x={46} y={443} fill="#64748b" fontSize={8}>Moderate (Jupiter)</text>
            {/* Extreme */}
            <circle cx={30} cy={464} r={16} fill="none" stroke="#64748b" strokeWidth={0.8} />
            <text x={52} y={467} fill="#64748b" fontSize={8}>Extreme (NS/BH)</text>
          </g>
        </svg>
      </div>

      {/* Data panel */}
      <div style={styles.panel} className="scene-panel">
        <div style={styles.panelTitle}>Dilation Data</div>

        <div style={styles.controls}>
          <label style={styles.controlLabel}>Reference:</label>
          <select value={referenceBody} onChange={(e) => setReferenceBody(e.target.value)} style={styles.select}>
            {bodies.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
          </select>
        </div>

        {/* Why This Matters card */}
        <div style={{ background: "#0f172a", borderRadius: "6px", padding: "8px", borderLeft: "3px solid #3b82f6" }}>
          <div style={{ fontSize: "10px", fontWeight: 600, color: "#94a3b8", marginBottom: "4px", letterSpacing: "0.5px" }}>Why This Matters</div>
          <div style={{ fontSize: "10px", color: "#e2e8f0", lineHeight: 1.5 }}>
            GPS satellites orbit 20,200 km up {"\u2014"} weaker gravity means their clocks tick +38.6 {"\u03BCs"}/day faster. Without relativistic correction, GPS drifts {"\u223C"}10 km/day. Every body on this chart has a similar time-gravity tradeoff.
          </div>
        </div>

        {/* Time Drift per Day — user-selectable */}
        <div style={styles.compSection}>
          <div style={styles.compTitle}>Time Drift per Day</div>
          <div style={styles.compSubtitle}>How much faster or slower clock B ticks vs clock A</div>
          <div style={styles.compControls}>
            <select value={compA} onChange={(e) => setCompA(e.target.value)} style={styles.selectSmall}>
              {allBodies.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
            </select>
            <span style={{ color: "#64748b", fontSize: "10px" }}>vs</span>
            <select value={compB} onChange={(e) => setCompB(e.target.value)} style={styles.selectSmall}>
              {allBodies.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
            </select>
          </div>
          {(() => {
            let diff: number;
            try {
              diff = engine.compareBodies(compA, compB);
            } catch (e) {
              // Fallback: compute from dilation factors directly
              const bodyA = allBodies.find((b) => b.name === compA);
              const bodyB = allBodies.find((b) => b.name === compB);
              if (bodyA && bodyB) {
                diff = (bodyA.dilation_factor - bodyB.dilation_factor) * 86_400 * 1e6;
              } else {
                diff = NaN;
              }
            }
            const valid = !isNaN(diff);
            return (
              <div style={styles.compRow}>
                <span style={styles.compLabel}>{compA} vs {compB}</span>
                <span style={{ ...styles.compValue, color: valid ? (diff > 0 ? "#34d399" : "#f87171") : "#94a3b8" }}>
                  {valid ? `${diff > 0 ? "+" : ""}${diff.toFixed(2)} ${"\u03BCs"}/day` : "\u2014"}
                </span>
              </div>
            );
          })()}
        </div>

        {/* Compact data rows */}
        <div style={styles.dataList}>
          {allBodies.map((b) => {
            const relDiff = (b.dilation_factor - refFactor) * 86_400 * 1e6;
            const isRef = b.name === referenceBody;
            const isHovered = hoveredBody === b.name;
            const color = BODY_COLORS[b.name] || "#94a3b8";
            const vEsc = computeEscapeVelocity(b);
            // Compute logSeverity for bar width (same as chart)
            const shift = 1 - b.dilation_factor;
            const logSeverity = shift > 0 ? Math.max(Math.log10(shift) + 10, 0) / 10 : 0;
            return (
              <div key={b.name} style={{
                ...styles.dataRow,
                ...(isRef ? styles.refRow : {}),
                ...(isHovered ? styles.dataRowHover : {}),
              }}
                onPointerEnter={() => setHoveredBody(b.name)}
                onPointerLeave={() => setHoveredBody(null)}
              >
                <div style={styles.bodyHeader}>
                  <span style={{ color }}>{"\u25CF"} {b.name}</span>
                  <span style={styles.dilationVal}>
                    {b.dilation_factor < 0.999
                      ? b.dilation_factor.toFixed(6)
                      : `1-${(1 - b.dilation_factor).toExponential(2)}`}
                  </span>
                </div>
                <div style={styles.bodyDetail}>
                  <span>Lost/yr: {formatSecondsLost(b.seconds_lost_per_year)}</span>
                  <span style={{ color: relDiff > 0 ? "#34d399" : relDiff < 0 ? "#f87171" : "#94a3b8" }}>
                    {isRef ? "REF" : formatMicroseconds(relDiff) + "/day"}
                  </span>
                </div>
                {/* Escape velocity — always shown */}
                <div style={styles.bodyDetail}>
                  <span>v_esc: {formatEscapeVelocity(vEsc)}</span>
                </div>
                {/* Description on hover */}
                {isHovered && BODY_DESCRIPTIONS[b.name] && (
                  <div style={styles.bodyDesc}>{BODY_DESCRIPTIONS[b.name]}</div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}

function formatSecondsLost(s: number): string {
  if (s < 0.001) return `${(s * 1e6).toFixed(1)} \xB5s`;
  if (s < 1) return `${(s * 1e3).toFixed(3)} ms`;
  if (s < 3600) return `${s.toFixed(3)} s`;
  return `${(s / 3600).toFixed(1)} hr`;
}

function formatMicroseconds(us: number): string {
  const abs = Math.abs(us);
  const sign = us >= 0 ? "+" : "-";
  if (abs < 0.001) return `${sign}${(abs * 1e3).toFixed(2)} ns`;
  if (abs < 1000) return `${sign}${abs.toFixed(2)} \xB5s`;
  return `${sign}${(abs / 1e3).toFixed(2)} ms`;
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: "flex", height: "calc(100vh - 130px)", gap: 0 },
  vizSection: {
    flex: 1, background: "#0a0f18", borderRadius: "8px",
    border: "1px solid #1e293b", overflow: "hidden", display: "flex",
    alignItems: "center", justifyContent: "center",
  },
  panel: {
    width: "300px", background: "rgba(17,24,39,0.85)", backdropFilter: "blur(12px)",
    border: "1px solid #1e293b",
    borderRadius: "8px", padding: "14px", marginLeft: "10px",
    overflow: "auto", display: "flex", flexDirection: "column", gap: "10px",
  },
  panelTitle: {
    fontSize: "13px", fontWeight: 600, color: "#a78bfa",
    letterSpacing: "1px", textTransform: "uppercase" as const,
  },
  controls: { display: "flex", alignItems: "center", gap: "8px" },
  controlLabel: { fontSize: "11px", color: "#94a3b8" },
  select: {
    background: "#1e293b", color: "#e2e8f0", border: "1px solid #334155",
    borderRadius: "4px", padding: "4px 8px", fontSize: "11px", fontFamily: "inherit", flex: 1,
  },
  dataList: { display: "flex", flexDirection: "column", gap: "6px" },
  dataRow: {
    background: "#0f172a", borderRadius: "6px", padding: "8px",
    cursor: "default", transition: "background 0.25s ease, transform 0.2s ease, box-shadow 0.25s ease",
    boxShadow: "0 0 15px rgba(0,0,0,0.3)",
  },
  dataRowHover: {
    boxShadow: "0 2px 12px rgba(148,163,184,0.15)",
    transform: "scale(1.02)",
    background: "#1e293b",
  },
  refRow: { background: "#1e293b30", border: "1px solid #3b82f640" },
  bodyHeader: {
    display: "flex", justifyContent: "space-between",
    fontSize: "11px", fontWeight: 600, marginBottom: "3px",
  },
  dilationVal: { color: "#94a3b8", fontVariantNumeric: "tabular-nums", fontSize: "10px" },
  bodyDetail: {
    display: "flex", justifyContent: "space-between",
    fontSize: "10px", color: "#94a3b8", fontVariantNumeric: "tabular-nums",
  },
  bodyDesc: {
    fontSize: "9px", color: "#94a3b8", fontStyle: "italic",
    marginTop: "3px", lineHeight: "1.3", opacity: 0.85,
  },
  barBg: {
    height: "3px", background: "#1e293b", borderRadius: "2px",
    marginTop: "4px", overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: "2px", transition: "width 0.3s" },
  compSection: {
    background: "#0f172a", borderRadius: "6px", padding: "8px",
    display: "flex", flexDirection: "column", gap: "4px",
    boxShadow: "0 0 15px rgba(0,0,0,0.3)",
  },
  compTitle: { fontSize: "10px", color: "#64748b", fontWeight: 600, letterSpacing: "0.5px" },
  compSubtitle: { fontSize: "9px", color: "#475569", fontStyle: "italic", marginBottom: "2px" },
  compControls: {
    display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px",
  },
  selectSmall: {
    background: "#1e293b", color: "#e2e8f0", border: "1px solid #334155",
    borderRadius: "4px", padding: "3px 6px", fontSize: "10px", fontFamily: "inherit", flex: 1,
  },
  compRow: {
    display: "flex", justifyContent: "space-between",
    fontSize: "10px", padding: "2px 0",
  },
  compLabel: { color: "#94a3b8" },
  compValue: { fontWeight: 600, fontVariantNumeric: "tabular-nums" },
};
