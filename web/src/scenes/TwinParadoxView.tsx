import React, { useState, useMemo } from "react";
import { engine } from "../engine/wasm-bridge";

const C = 299792458;

export function TwinParadoxView() {
  const [speed, setSpeed] = useState(0.5); // fraction of c
  const [durationYears, setDurationYears] = useState(10);
  const [scenario, setScenario] = useState<
    "custom" | "gps" | "iss" | "proxima" | "galactic"
  >("custom");

  // Presets
  const presets: Record<string, { speed: number; years: number; desc: string }> = {
    custom: { speed, years: durationYears, desc: "Custom parameters" },
    gps: {
      speed: 3874 / C,
      years: 1,
      desc: "GPS satellite vs Earth surface, 1 year",
    },
    iss: {
      speed: 7660 / C,
      years: 1,
      desc: "ISS orbital speed, 1 year",
    },
    proxima: {
      speed: 0.1,
      years: 84.6,
      desc: "Trip to Proxima Centauri at 0.1c (4.24 ly)",
    },
    galactic: {
      speed: 0.99,
      years: 100,
      desc: "Galactic voyage at 0.99c, 100 coord years",
    },
  };

  const active = scenario === "custom" ? presets.custom : presets[scenario];

  const results = useMemo(() => {
    const v = active.speed * C;
    const coordTime = active.years * 365.25 * 86400;

    // SR time dilation: γ = 1/√(1 - v²/c²)
    const beta2 = active.speed * active.speed;
    const gamma = 1 / Math.sqrt(1 - beta2);
    const travelProper = coordTime / gamma;

    // For Earth observer, also include gravitational dilation on Earth surface
    const earthDilation = engine.schwarzschildDilation(
      engine.constants.gmEarth(),
      engine.constants.rEarth()
    );
    const earthProper = earthDilation * coordTime;

    const diffSeconds = earthProper - travelProper;
    const diffYears = diffSeconds / (365.25 * 86400);

    // Distance covered (in light-years, coordinate frame)
    const distanceLy =
      (active.speed * C * coordTime) / (C * 365.25 * 86400);

    // Traveler's perceived distance (length contraction)
    const contractedLy = distanceLy / gamma;

    return {
      gamma,
      coordTimeYears: active.years,
      earthAgingYears: earthProper / (365.25 * 86400),
      travelerAgingYears: travelProper / (365.25 * 86400),
      differenceYears: diffYears,
      differenceSeconds: diffSeconds,
      distanceLy,
      contractedLy,
      speedKmS: active.speed * C / 1000,
    };
  }, [active.speed, active.years]);

  return (
    <div style={styles.container} data-testid="twin-paradox-view">
      <div style={styles.header}>
        <h2 style={styles.title}>Twin Paradox Calculator</h2>
        <p style={styles.subtitle}>
          Differential aging for relativistic travel
        </p>
      </div>

      <div style={styles.scenarios}>
        {Object.entries(presets).map(([key, preset]) => (
          <button
            key={key}
            onClick={() => {
              setScenario(key as typeof scenario);
              if (key !== "custom") {
                setSpeed(preset.speed);
                setDurationYears(preset.years);
              }
            }}
            style={{
              ...styles.scenarioBtn,
              ...(scenario === key ? styles.scenarioBtnActive : {}),
            }}
          >
            {key === "custom"
              ? "Custom"
              : key === "gps"
                ? "GPS Satellite"
                : key === "iss"
                  ? "ISS"
                  : key === "proxima"
                    ? "Proxima Centauri"
                    : "Galactic Voyage"}
          </button>
        ))}
      </div>

      <div style={styles.controlsGrid}>
        <div style={styles.control}>
          <div style={styles.controlLabel}>
            Speed: {(active.speed * 100).toFixed(4)}% c (
            {results.speedKmS.toFixed(1)} km/s)
          </div>
          <input
            type="range"
            min={0.0001}
            max={0.9999}
            step={0.0001}
            value={active.speed}
            onChange={(e) => {
              setScenario("custom");
              setSpeed(parseFloat(e.target.value));
            }}
            style={styles.rangeInput}
          />
        </div>
        <div style={styles.control}>
          <div style={styles.controlLabel}>
            Coordinate duration: {active.years.toFixed(1)} years
          </div>
          <input
            type="range"
            min={0.1}
            max={1000}
            step={0.1}
            value={active.years}
            onChange={(e) => {
              setScenario("custom");
              setDurationYears(parseFloat(e.target.value));
            }}
            style={styles.rangeInput}
          />
        </div>
      </div>

      <div style={styles.resultGrid}>
        <ResultCard
          label="Lorentz Factor"
          value={`\u03B3 = ${results.gamma < 100 ? results.gamma.toFixed(4) : results.gamma.toExponential(3)}`}
          color="#8b5cf6"
        />
        <ResultCard
          label="Earth Twin Ages"
          value={`${results.earthAgingYears.toFixed(4)} years`}
          color="#4a90d9"
        />
        <ResultCard
          label="Traveler Ages"
          value={`${results.travelerAgingYears.toFixed(4)} years`}
          color="#f59e0b"
        />
        <ResultCard
          label="Differential Aging"
          value={formatDiff(results.differenceSeconds)}
          sub={`${results.differenceYears.toFixed(4)} years`}
          color={results.differenceSeconds > 0 ? "#34d399" : "#f87171"}
        />
        <ResultCard
          label="Distance (coord frame)"
          value={`${results.distanceLy.toFixed(2)} ly`}
          color="#06b6d4"
        />
        <ResultCard
          label="Distance (traveler)"
          value={`${results.contractedLy.toFixed(2)} ly`}
          sub="Length-contracted"
          color="#14b8a6"
        />
      </div>

      <div style={styles.visualization}>
        <div style={styles.vizTitle}>Timeline Comparison</div>
        <div style={styles.timelines}>
          <Timeline
            label="Earth Twin"
            years={results.earthAgingYears}
            maxYears={results.coordTimeYears}
            color="#4a90d9"
          />
          <Timeline
            label="Traveler"
            years={results.travelerAgingYears}
            maxYears={results.coordTimeYears}
            color="#f59e0b"
          />
          <Timeline
            label="Coordinate Time"
            years={results.coordTimeYears}
            maxYears={results.coordTimeYears}
            color="#64748b"
          />
        </div>
      </div>

      <div style={styles.formula}>
        <div style={styles.formulaTitle}>Formulas</div>
        <div style={styles.formulaText}>
          {"\u03B3"} = 1/{"\u221A"}(1 - v{"\u00B2"}/c{"\u00B2"}) | {"\u0394"}{"\u03C4"}
          _traveler = {"\u0394"}t / {"\u03B3"} | L_contracted = L / {"\u03B3"}
        </div>
      </div>
    </div>
  );
}

function ResultCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div style={{ ...styles.resultCard, borderColor: color + "40" }}>
      <div style={{ ...styles.resultLabel, color }}>{label}</div>
      <div style={styles.resultValue}>{value}</div>
      {sub && <div style={styles.resultSub}>{sub}</div>}
    </div>
  );
}

function Timeline({
  label,
  years,
  maxYears,
  color,
}: {
  label: string;
  years: number;
  maxYears: number;
  color: string;
}) {
  const pct = Math.min((years / maxYears) * 100, 100);
  return (
    <div style={styles.timelineRow}>
      <div style={styles.timelineLabel}>{label}</div>
      <div style={styles.timelineBar}>
        <div
          style={{
            ...styles.timelineFill,
            width: `${pct}%`,
            background: color,
          }}
        />
      </div>
      <div style={styles.timelineValue}>{years.toFixed(2)} yr</div>
    </div>
  );
}

function formatDiff(s: number): string {
  const abs = Math.abs(s);
  if (abs < 1e-3) return `${(abs * 1e6).toFixed(2)} \u03BCs`;
  if (abs < 1) return `${(abs * 1e3).toFixed(2)} ms`;
  if (abs < 60) return `${abs.toFixed(3)} s`;
  if (abs < 3600) return `${(abs / 60).toFixed(1)} min`;
  if (abs < 86400) return `${(abs / 3600).toFixed(1)} hr`;
  if (abs < 86400 * 365.25) return `${(abs / 86400).toFixed(1)} days`;
  return `${(abs / (86400 * 365.25)).toFixed(1)} years`;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: "1100px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  header: { textAlign: "center" },
  title: {
    fontSize: "18px",
    fontWeight: 700,
    color: "#f1f5f9",
    margin: 0,
  },
  subtitle: {
    fontSize: "11px",
    color: "#64748b",
    margin: 0,
  },
  scenarios: {
    display: "flex",
    justifyContent: "center",
    gap: "6px",
    flexWrap: "wrap",
  },
  scenarioBtn: {
    padding: "6px 12px",
    border: "1px solid #1e293b",
    borderRadius: "6px",
    background: "transparent",
    color: "#94a3b8",
    cursor: "pointer",
    fontSize: "12px",
    fontFamily: "inherit",
  },
  scenarioBtnActive: {
    background: "#1e293b",
    color: "#e2e8f0",
    borderColor: "#3b82f6",
  },
  controlsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px",
  },
  control: {
    background: "#111827",
    border: "1px solid #1e293b",
    borderRadius: "6px",
    padding: "10px",
  },
  controlLabel: {
    fontSize: "11px",
    color: "#94a3b8",
    marginBottom: "6px",
    fontVariantNumeric: "tabular-nums",
  },
  rangeInput: {
    width: "100%",
    accentColor: "#3b82f6",
  },
  resultGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: "10px",
  },
  resultCard: {
    background: "#111827",
    border: "1px solid",
    borderRadius: "8px",
    padding: "12px",
  },
  resultLabel: {
    fontSize: "10px",
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
    marginBottom: "4px",
  },
  resultValue: {
    fontSize: "17px",
    fontWeight: 700,
    color: "#f1f5f9",
    fontVariantNumeric: "tabular-nums",
  },
  resultSub: {
    fontSize: "10px",
    color: "#475569",
    marginTop: "2px",
  },
  visualization: {
    background: "#111827",
    border: "1px solid #1e293b",
    borderRadius: "8px",
    padding: "14px",
  },
  vizTitle: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#94a3b8",
    marginBottom: "10px",
  },
  timelines: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  timelineRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  timelineLabel: {
    width: "100px",
    fontSize: "11px",
    color: "#94a3b8",
    textAlign: "right",
  },
  timelineBar: {
    flex: 1,
    height: "16px",
    background: "#0f172a",
    borderRadius: "4px",
    overflow: "hidden",
  },
  timelineFill: {
    height: "100%",
    borderRadius: "4px",
    transition: "width 0.3s ease",
  },
  timelineValue: {
    width: "80px",
    fontSize: "11px",
    color: "#e2e8f0",
    fontVariantNumeric: "tabular-nums",
  },
  formula: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: "8px",
    padding: "12px",
    textAlign: "center",
  },
  formulaTitle: {
    fontSize: "10px",
    color: "#475569",
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
    marginBottom: "4px",
  },
  formulaText: {
    fontSize: "13px",
    color: "#a78bfa",
    fontStyle: "italic",
  },
};
