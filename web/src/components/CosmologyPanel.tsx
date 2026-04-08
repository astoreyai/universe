import React, { useMemo, useState } from "react";
import { engine } from "../engine/wasm-bridge";

export function CosmologyPanel() {
  const [redshift, setRedshift] = useState(1.0);

  const ageGyr = useMemo(() => engine.ageOfUniverseGyr(), []);

  const data = useMemo(
    () => ({
      dilation: engine.cosmologicalDilation(redshift),
      lookback: engine.lookbackTimeGyr(redshift),
      comoving: engine.comovingDistanceGly(redshift),
      hubble: engine.hubbleParameterKmSMpc(redshift),
    }),
    [redshift]
  );

  // Redshift milestones
  const milestones = useMemo(
    () =>
      [0.01, 0.1, 0.5, 1, 2, 5, 10, 100, 1100].map((z) => ({
        z,
        dilation: engine.cosmologicalDilation(z),
        lookback: engine.lookbackTimeGyr(z),
        comoving: engine.comovingDistanceGly(z),
      })),
    []
  );

  return (
    <div style={styles.container}>
      <div style={styles.heroGrid}>
        <div style={styles.heroCard}>
          <div style={styles.heroLabel}>Age of Universe (UCT)</div>
          <div style={styles.heroValue}>{ageGyr.toFixed(2)} Gyr</div>
          <div style={styles.heroDetail}>
            CMB rest frame proper time since Big Bang
          </div>
        </div>
        <div style={styles.heroCard}>
          <div style={styles.heroLabel}>Hubble Constant H{"\u2080"}</div>
          <div style={styles.heroValue}>67.4 km/s/Mpc</div>
          <div style={styles.heroDetail}>Planck 2018 {"\u039B"}CDM</div>
        </div>
        <div style={styles.heroCard}>
          <div style={styles.heroLabel}>Matter {"\u03A9"}_m</div>
          <div style={styles.heroValue}>0.315</div>
          <div style={styles.heroDetail}>
            {"\u03A9"}{"\u039B"} = 0.685 | {"\u03A9"}_r = 9.1{"\u00D7"}10{"\u207B\u2075"}
          </div>
        </div>
      </div>

      <div style={styles.sliderSection}>
        <div style={styles.sliderHeader}>
          <span style={styles.sliderLabel}>Redshift Explorer</span>
          <span style={styles.sliderValue}>z = {redshift.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min="0"
          max="3"
          step="0.01"
          value={Math.log10(redshift + 1)}
          onChange={(e) =>
            setRedshift(Math.pow(10, parseFloat(e.target.value)) - 1)
          }
          style={styles.slider}
        />
        <div style={styles.sliderTicks}>
          <span>z=0</span>
          <span>z=1</span>
          <span>z=10</span>
          <span>z=100</span>
          <span>z=1000</span>
        </div>
      </div>

      <div style={styles.resultGrid}>
        <ResultCard
          label="Time Dilation"
          value={`${data.dilation.toFixed(2)}\u00D7`}
          detail="1 second there = this many seconds here"
          color="#f59e0b"
        />
        <ResultCard
          label="Lookback Time"
          value={`${data.lookback.toFixed(2)} Gyr`}
          detail="Light travel time to us"
          color="#3b82f6"
        />
        <ResultCard
          label="Comoving Distance"
          value={`${data.comoving.toFixed(2)} Gly`}
          detail="Current proper distance"
          color="#8b5cf6"
        />
        <ResultCard
          label="H(z)"
          value={`${data.hubble.toFixed(1)} km/s/Mpc`}
          detail="Hubble parameter at this redshift"
          color="#06b6d4"
        />
      </div>

      <div style={styles.tableSection}>
        <div style={styles.tableTitle}>Redshift Milestones</div>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>z</th>
              <th style={styles.th}>Scale Factor a</th>
              <th style={styles.th}>Time Dilation</th>
              <th style={styles.th}>Lookback (Gyr)</th>
              <th style={styles.th}>Comoving (Gly)</th>
              <th style={styles.th}>Description</th>
            </tr>
          </thead>
          <tbody>
            {milestones.map((m) => (
              <tr key={m.z}>
                <td style={styles.td}>{m.z}</td>
                <td style={styles.tdMono}>
                  {(1 / (1 + m.z)).toFixed(4)}
                </td>
                <td style={styles.tdMono}>{m.dilation.toFixed(2)}{"\u00D7"}</td>
                <td style={styles.tdMono}>{m.lookback.toFixed(2)}</td>
                <td style={styles.tdMono}>{m.comoving.toFixed(2)}</td>
                <td style={styles.tdDesc}>{describeRedshift(m.z)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={styles.flrwCard}>
        <div style={styles.flrwTitle}>FLRW Metric</div>
        <div style={styles.flrwEq}>
          ds{"\u00B2"} = -c{"\u00B2"}dt{"\u00B2"} + a(t){"\u00B2"}[dr
          {"\u00B2"}/(1-kr{"\u00B2"}) + r{"\u00B2"}d{"\u03A9"}{"\u00B2"}]
        </div>
        <div style={styles.flrwDetail}>
          {"\u0394"}t_obs = (1+z) {"\u00D7"} {"\u0394"}t_emit | H(z) = H
          {"\u2080"}{"\u221A"}({"\u03A9"}_m(1+z){"\u00B3"} + {"\u03A9"}_
          {"\u039B"})
        </div>
      </div>
    </div>
  );
}

function ResultCard({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: string;
  detail: string;
  color: string;
}) {
  return (
    <div style={{ ...styles.resultCard, borderColor: color + "40" }}>
      <div style={{ ...styles.resultLabel, color }}>{label}</div>
      <div style={styles.resultValue}>{value}</div>
      <div style={styles.resultDetail}>{detail}</div>
    </div>
  );
}

function describeRedshift(z: number): string {
  if (z <= 0.01) return "Local universe";
  if (z <= 0.1) return "Nearby galaxies";
  if (z <= 0.5) return "Intermediate distance";
  if (z <= 1) return "Half current universe size";
  if (z <= 2) return "Peak star formation era";
  if (z <= 5) return "Early galaxies forming";
  if (z <= 10) return "Cosmic dawn / reionization";
  if (z <= 100) return "Dark ages";
  return "Last scattering (CMB)";
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: "1100px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  heroGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "12px",
  },
  heroCard: {
    background: "#111827",
    border: "1px solid #1e293b",
    borderRadius: "8px",
    padding: "16px",
    textAlign: "center",
  },
  heroLabel: {
    fontSize: "11px",
    color: "#64748b",
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
    marginBottom: "4px",
  },
  heroValue: {
    fontSize: "24px",
    fontWeight: 700,
    color: "#f1f5f9",
    fontVariantNumeric: "tabular-nums",
  },
  heroDetail: {
    fontSize: "10px",
    color: "#475569",
    marginTop: "4px",
  },
  sliderSection: {
    background: "#111827",
    border: "1px solid #1e293b",
    borderRadius: "8px",
    padding: "16px",
  },
  sliderHeader: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "8px",
  },
  sliderLabel: {
    fontSize: "13px",
    color: "#94a3b8",
    fontWeight: 600,
  },
  sliderValue: {
    fontSize: "15px",
    color: "#f59e0b",
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
  },
  slider: {
    width: "100%",
    height: "6px",
    appearance: "auto",
    accentColor: "#3b82f6",
  },
  sliderTicks: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "10px",
    color: "#475569",
    marginTop: "4px",
  },
  resultGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: "10px",
  },
  resultCard: {
    background: "#111827",
    border: "1px solid",
    borderRadius: "8px",
    padding: "14px",
  },
  resultLabel: {
    fontSize: "11px",
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
    marginBottom: "4px",
  },
  resultValue: {
    fontSize: "20px",
    fontWeight: 700,
    color: "#f1f5f9",
    fontVariantNumeric: "tabular-nums",
  },
  resultDetail: {
    fontSize: "10px",
    color: "#475569",
    marginTop: "2px",
  },
  tableSection: {
    background: "#111827",
    border: "1px solid #1e293b",
    borderRadius: "8px",
    padding: "16px",
    overflow: "auto",
  },
  tableTitle: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#94a3b8",
    letterSpacing: "1px",
    marginBottom: "8px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "13px",
  },
  th: {
    textAlign: "left",
    padding: "6px 10px",
    borderBottom: "1px solid #1e293b",
    color: "#64748b",
    fontSize: "10px",
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
  },
  td: {
    padding: "6px 10px",
    borderBottom: "1px solid #0f172a",
    color: "#e2e8f0",
  },
  tdMono: {
    padding: "6px 10px",
    borderBottom: "1px solid #0f172a",
    color: "#94a3b8",
    fontVariantNumeric: "tabular-nums",
  },
  tdDesc: {
    padding: "6px 10px",
    borderBottom: "1px solid #0f172a",
    color: "#64748b",
    fontSize: "11px",
  },
  flrwCard: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: "8px",
    padding: "16px",
    textAlign: "center",
  },
  flrwTitle: {
    fontSize: "11px",
    color: "#64748b",
    letterSpacing: "2px",
    textTransform: "uppercase" as const,
    marginBottom: "8px",
  },
  flrwEq: {
    fontSize: "16px",
    color: "#a78bfa",
    fontStyle: "italic",
    marginBottom: "8px",
  },
  flrwDetail: {
    fontSize: "12px",
    color: "#64748b",
  },
};
