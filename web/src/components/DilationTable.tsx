import React, { useMemo, useState } from "react";
import { engine, BodyDilation } from "../engine/wasm-bridge";

export function DilationTable() {
  const [referenceBody, setReferenceBody] = useState("Earth");

  const bodies = useMemo(() => engine.getSolarSystemDilation(), []);

  const refBody = bodies.find((b) => b.name === referenceBody);
  const refFactor = refBody?.dilation_factor ?? 1;

  // Additional extreme objects
  const extremeObjects = useMemo(
    () => [
      {
        name: "Neutron Star (1.4M\u2609)",
        dilation_factor: engine.schwarzschildDilation(
          1.4 * engine.constants.gmSun(),
          10_000
        ),
        seconds_lost_per_year: engine.secondsLostPerYear(
          engine.schwarzschildDilation(1.4 * engine.constants.gmSun(), 10_000)
        ),
        schwarzschild_radius: (2 * 1.4 * engine.constants.gmSun()) / (299792458 * 299792458),
        surface_gravity:
          (1.4 * engine.constants.gmSun()) / (10_000 * 10_000),
      },
      {
        name: "Black Hole (3r\u209b)",
        dilation_factor: engine.schwarzschildDilation(
          10 * engine.constants.gmSun(),
          3 * (2 * 10 * engine.constants.gmSun()) / (299792458 * 299792458)
        ),
        seconds_lost_per_year: 0,
        schwarzschild_radius:
          (2 * 10 * engine.constants.gmSun()) / (299792458 * 299792458),
        surface_gravity: 0,
      },
    ],
    []
  );

  const allBodies = [...bodies, ...extremeObjects];

  return (
    <div style={styles.container}>
      <div style={styles.controls}>
        <label style={styles.controlLabel}>Reference frame:</label>
        <select
          value={referenceBody}
          onChange={(e) => setReferenceBody(e.target.value)}
          style={styles.select}
        >
          {bodies.map((b) => (
            <option key={b.name} value={b.name}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Body</th>
            <th style={styles.th}>d\u03C4/dt</th>
            <th style={styles.th}>Lost / year vs \u221E</th>
            <th style={styles.th}>vs {referenceBody} (\u03BCs/day)</th>
            <th style={styles.th}>g (m/s\u00B2)</th>
          </tr>
        </thead>
        <tbody>
          {allBodies.map((b) => {
            const relDiff =
              (b.dilation_factor - refFactor) * 86_400 * 1e6;
            const isRef = b.name === referenceBody;
            return (
              <tr
                key={b.name}
                style={isRef ? styles.refRow : undefined}
              >
                <td style={styles.td}>
                  <span style={{ color: dilationColor(b.dilation_factor) }}>
                    {"\u25CF"}{" "}
                  </span>
                  {b.name}
                </td>
                <td style={styles.tdMono}>
                  {b.dilation_factor < 0.999
                    ? b.dilation_factor.toFixed(6)
                    : `1 - ${(1 - b.dilation_factor).toExponential(3)}`}
                </td>
                <td style={styles.tdMono}>
                  {formatSecondsLost(b.seconds_lost_per_year)}
                </td>
                <td
                  style={{
                    ...styles.tdMono,
                    color: relDiff > 0 ? "#34d399" : relDiff < 0 ? "#f87171" : "#94a3b8",
                  }}
                >
                  {isRef ? "\u2014" : formatMicroseconds(relDiff)}
                </td>
                <td style={styles.tdMono}>
                  {b.surface_gravity > 0
                    ? b.surface_gravity < 100
                      ? b.surface_gravity.toFixed(2)
                      : b.surface_gravity.toExponential(2)
                    : "\u2014"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={styles.comparison}>
        <div style={styles.compTitle}>Body Comparisons (\u03BCs/day)</div>
        <div style={styles.compGrid}>
          {[
            ["Earth", "Mars"],
            ["Earth", "Sun"],
            ["Earth", "Jupiter"],
            ["Mercury", "Earth"],
          ].map(([a, b]) => {
            const diff = engine.compareBodies(a, b);
            return (
              <div key={`${a}-${b}`} style={styles.compCard}>
                <span style={styles.compLabel}>
                  {a} vs {b}
                </span>
                <span
                  style={{
                    ...styles.compValue,
                    color: diff > 0 ? "#34d399" : "#f87171",
                  }}
                >
                  {diff > 0 ? "+" : ""}
                  {diff.toFixed(2)} \u03BCs/day
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function dilationColor(factor: number): string {
  if (factor > 0.9999999) return "#60a5fa"; // nearly flat spacetime
  if (factor > 0.999) return "#34d399"; // mild
  if (factor > 0.9) return "#fbbf24"; // moderate
  if (factor > 0.5) return "#f97316"; // strong
  return "#ef4444"; // extreme
}

function formatSecondsLost(s: number): string {
  if (s < 0.001) return `${(s * 1e6).toFixed(1)} \u03BCs`;
  if (s < 1) return `${(s * 1e3).toFixed(3)} ms`;
  if (s < 3600) return `${s.toFixed(3)} s`;
  if (s < 86400) return `${(s / 3600).toFixed(1)} hr`;
  if (s < 86400 * 365.25) return `${(s / 86400).toFixed(1)} days`;
  return `${(s / (86400 * 365.25)).toFixed(1)} yr`;
}

function formatMicroseconds(us: number): string {
  const abs = Math.abs(us);
  const sign = us >= 0 ? "+" : "-";
  if (abs < 0.001) return `${sign}${(abs * 1e3).toFixed(2)} ns`;
  if (abs < 1000) return `${sign}${abs.toFixed(2)}`;
  if (abs < 1e6) return `${sign}${(abs / 1e3).toFixed(2)} ms`;
  return `${sign}${(abs / 1e6).toFixed(2)} s`;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: "1100px",
    margin: "0 auto",
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "16px",
  },
  controlLabel: {
    fontSize: "12px",
    color: "#94a3b8",
    letterSpacing: "1px",
  },
  select: {
    background: "#1e293b",
    color: "#e2e8f0",
    border: "1px solid #334155",
    borderRadius: "4px",
    padding: "4px 8px",
    fontSize: "13px",
    fontFamily: "inherit",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "13px",
  },
  th: {
    textAlign: "left",
    padding: "8px 12px",
    borderBottom: "1px solid #1e293b",
    color: "#64748b",
    fontSize: "11px",
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
  },
  td: {
    padding: "8px 12px",
    borderBottom: "1px solid #111827",
    color: "#e2e8f0",
  },
  tdMono: {
    padding: "8px 12px",
    borderBottom: "1px solid #111827",
    color: "#94a3b8",
    fontVariantNumeric: "tabular-nums",
  },
  refRow: {
    background: "#1e293b30",
  },
  comparison: {
    marginTop: "20px",
  },
  compTitle: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#94a3b8",
    marginBottom: "8px",
    letterSpacing: "1px",
  },
  compGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: "8px",
  },
  compCard: {
    background: "#111827",
    border: "1px solid #1e293b",
    borderRadius: "6px",
    padding: "10px 14px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  compLabel: {
    fontSize: "12px",
    color: "#94a3b8",
  },
  compValue: {
    fontSize: "13px",
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
  },
};
