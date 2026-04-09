import React, { useMemo, useState } from "react";
import { engine, BodyDilation } from "../engine/wasm-bridge";

// ─── Body visual config ────────────────────────────────────────────────────

const BODY_COLORS: Record<string, string> = {
  Sun: "#ffd54f", Mercury: "#8c8c8c", Venus: "#e8c87a", Earth: "#4a90d9",
  Mars: "#c1440e", Moon: "#c0c0c0", Jupiter: "#c88b3a", Saturn: "#d4b87a",
  "Neutron Star (1.4M\u2609)": "#a78bfa", "Black Hole (3r\u209b)": "#ef4444",
};

export function DilationTable() {
  const [referenceBody, setReferenceBody] = useState("Earth");
  const [hoveredBody, setHoveredBody] = useState<string | null>(null);

  const bodies = useMemo(() => engine.getSolarSystemDilation(), []);

  const refBody = bodies.find((b) => b.name === referenceBody);
  const refFactor = refBody?.dilation_factor ?? 1;

  const extremeObjects: BodyDilation[] = useMemo(
    () => [
      {
        name: "Neutron Star (1.4M\u2609)",
        dilation_factor: engine.schwarzschildDilation(1.4 * engine.constants.gmSun(), 10_000),
        seconds_lost_per_year: engine.secondsLostPerYear(
          engine.schwarzschildDilation(1.4 * engine.constants.gmSun(), 10_000)
        ),
        schwarzschild_radius: (2 * 1.4 * engine.constants.gmSun()) / (299792458 * 299792458),
        surface_gravity: (1.4 * engine.constants.gmSun()) / (10_000 * 10_000),
      },
      {
        name: "Black Hole (3r\u209b)",
        dilation_factor: engine.schwarzschildDilation(
          10 * engine.constants.gmSun(),
          3 * (2 * 10 * engine.constants.gmSun()) / (299792458 * 299792458)
        ),
        seconds_lost_per_year: engine.secondsLostPerYear(
          engine.schwarzschildDilation(
            10 * engine.constants.gmSun(),
            3 * (2 * 10 * engine.constants.gmSun()) / (299792458 * 299792458)
          )
        ),
        schwarzschild_radius: (2 * 10 * engine.constants.gmSun()) / (299792458 * 299792458),
        surface_gravity: 0,
      },
    ],
    []
  );

  const allBodies = [...bodies, ...extremeObjects];

  // Compute radial chart data — use log scale for dilation severity
  const chartBodies = useMemo(() => {
    return allBodies.map((b) => {
      const shift = 1 - b.dilation_factor; // 0 = flat spacetime, ~1 = event horizon
      // Log-scale the severity so tiny differences (Earth ~7e-10) and huge ones (NS ~0.23) both show
      const logSeverity = shift > 0 ? Math.max(Math.log10(shift) + 10, 0) / 10 : 0;
      return { ...b, shift, logSeverity, color: BODY_COLORS[b.name] || "#94a3b8" };
    });
  }, [allBodies]);

  return (
    <div style={styles.container} className="scene-layout">
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
            <circle key={r} cx={300} cy={250} r={r} fill="none" stroke="#1e293b" strokeWidth={0.5} />
          ))}

          {/* Title */}
          <text x={300} y={28} textAnchor="middle" fill="#94a3b8" fontSize={13} fontWeight={600} letterSpacing={2}>
            GRAVITATIONAL TIME DILATION MAP
          </text>
          <text x={300} y={46} textAnchor="middle" fill="#475569" fontSize={10}>
            Circle size = dilation severity (log scale) | Reference: {referenceBody}
          </text>

          {/* Bodies arranged radially */}
          {chartBodies.map((b, i) => {
            const angle = (i / chartBodies.length) * Math.PI * 2 - Math.PI / 2;
            const dist = 60 + i * 18; // Spread outward
            const cx = 300 + Math.cos(angle) * dist;
            const cy = 250 + Math.sin(angle) * dist;
            const radius = 8 + b.logSeverity * 60; // Visual size based on dilation
            const isHovered = hoveredBody === b.name;
            const isRef = b.name === referenceBody;
            const relDiff = (b.dilation_factor - refFactor) * 86_400 * 1e6;

            return (
              <g key={b.name}
                onMouseEnter={() => setHoveredBody(b.name)}
                onMouseLeave={() => setHoveredBody(null)}
                onClick={() => setReferenceBody(b.name.includes("Neutron") || b.name.includes("Black") ? referenceBody : b.name)}
                style={{ cursor: b.name.includes("Neutron") || b.name.includes("Black") ? "default" : "pointer" }}
              >
                {/* Gravity well glow */}
                <circle cx={cx} cy={cy} r={radius * 1.5}
                  fill={`url(#grad-${b.name.replace(/[^a-z]/gi, "")})`}
                  opacity={isHovered ? 0.8 : 0.5}
                />
                {/* Body circle */}
                <circle cx={cx} cy={cy} r={Math.max(radius * 0.4, 5)}
                  fill={b.color}
                  stroke={isRef ? "#fff" : isHovered ? b.color : "none"}
                  strokeWidth={isRef ? 2 : 1}
                  opacity={0.9}
                />
                {/* Label */}
                <text x={cx} y={cy + radius * 0.4 + 14} textAnchor="middle"
                  fill={isHovered ? "#f1f5f9" : "#94a3b8"} fontSize={9} fontFamily="'JetBrains Mono', monospace">
                  {b.name.length > 12 ? b.name.slice(0, 10) + ".." : b.name}
                </text>
                {/* Dilation value on hover */}
                {isHovered && (
                  <g>
                    <rect x={cx - 55} y={cy - radius * 0.4 - 32} width={110} height={24} rx={4}
                      fill="rgba(15,23,42,0.9)" stroke={b.color + "50"} strokeWidth={1} />
                    <text x={cx} y={cy - radius * 0.4 - 16} textAnchor="middle"
                      fill="#f1f5f9" fontSize={9} fontFamily="'JetBrains Mono', monospace">
                      {b.dilation_factor < 0.999
                        ? `d\u03C4/dt = ${b.dilation_factor.toFixed(4)}`
                        : `1 - ${(1 - b.dilation_factor).toExponential(2)}`}
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
          <text x={300} y={248} textAnchor="middle" fill="#64748b" fontSize={8}>flat</text>
          <text x={300} y={260} textAnchor="middle" fill="#64748b" fontSize={8}>spacetime</text>

          {/* Legend */}
          <text x={30} y={480} fill="#475569" fontSize={9}>
            {"\u25CF"} Larger = stronger gravitational dilation | Click body to set reference frame
          </text>
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

        {/* Compact data rows */}
        <div style={styles.dataList}>
          {allBodies.map((b) => {
            const relDiff = (b.dilation_factor - refFactor) * 86_400 * 1e6;
            const isRef = b.name === referenceBody;
            const color = BODY_COLORS[b.name] || "#94a3b8";
            return (
              <div key={b.name} style={{ ...styles.dataRow, ...(isRef ? styles.refRow : {}) }}
                onMouseEnter={() => setHoveredBody(b.name)}
                onMouseLeave={() => setHoveredBody(null)}
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
                    {isRef ? "REF" : formatMicroseconds(relDiff) + " \u03BCs/day"}
                  </span>
                </div>
                {/* Visual severity bar */}
                <div style={styles.barBg}>
                  <div style={{
                    ...styles.barFill,
                    width: `${Math.min((1 - b.dilation_factor) * 1e8 * 0.8, 100)}%`,
                    background: color,
                  }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Comparison pairs */}
        <div style={styles.compSection}>
          <div style={styles.compTitle}>Pairwise Comparisons</div>
          {[["Earth", "Mars"], ["Earth", "Sun"], ["Earth", "Jupiter"], ["Mercury", "Earth"]].map(([a, b]) => {
            const diff = engine.compareBodies(a, b);
            return (
              <div key={`${a}-${b}`} style={styles.compRow}>
                <span style={styles.compLabel}>{a} vs {b}</span>
                <span style={{ ...styles.compValue, color: diff > 0 ? "#34d399" : "#f87171" }}>
                  {diff > 0 ? "+" : ""}{diff.toFixed(2)} \u03BCs/day
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function formatSecondsLost(s: number): string {
  if (s < 0.001) return `${(s * 1e6).toFixed(1)} \u03BCs`;
  if (s < 1) return `${(s * 1e3).toFixed(3)} ms`;
  if (s < 3600) return `${s.toFixed(3)} s`;
  return `${(s / 3600).toFixed(1)} hr`;
}

function formatMicroseconds(us: number): string {
  const abs = Math.abs(us);
  const sign = us >= 0 ? "+" : "-";
  if (abs < 0.001) return `${sign}${(abs * 1e3).toFixed(2)} ns`;
  if (abs < 1000) return `${sign}${abs.toFixed(2)}`;
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
    width: "300px", background: "#111827", border: "1px solid #1e293b",
    borderRadius: "8px", padding: "14px", marginLeft: "10px",
    overflow: "auto", display: "flex", flexDirection: "column", gap: "10px",
  },
  panelTitle: {
    fontSize: "13px", fontWeight: 600, color: "#94a3b8",
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
    cursor: "default", transition: "background 0.15s",
  },
  refRow: { background: "#1e293b30", border: "1px solid #3b82f640" },
  bodyHeader: {
    display: "flex", justifyContent: "space-between",
    fontSize: "11px", fontWeight: 600, marginBottom: "3px",
  },
  dilationVal: { color: "#94a3b8", fontVariantNumeric: "tabular-nums", fontSize: "10px" },
  bodyDetail: {
    display: "flex", justifyContent: "space-between",
    fontSize: "9px", color: "#64748b", fontVariantNumeric: "tabular-nums",
  },
  barBg: {
    height: "3px", background: "#1e293b", borderRadius: "2px",
    marginTop: "4px", overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: "2px", transition: "width 0.3s" },
  compSection: {
    background: "#0f172a", borderRadius: "6px", padding: "8px",
    display: "flex", flexDirection: "column", gap: "4px",
  },
  compTitle: { fontSize: "10px", color: "#64748b", fontWeight: 600, letterSpacing: "0.5px" },
  compRow: {
    display: "flex", justifyContent: "space-between",
    fontSize: "10px", padding: "2px 0",
  },
  compLabel: { color: "#94a3b8" },
  compValue: { fontWeight: 600, fontVariantNumeric: "tabular-nums" },
};
