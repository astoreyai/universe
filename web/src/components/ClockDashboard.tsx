import React, { useEffect, useState, useRef } from "react";
import { engine, TimeRepresentations } from "../engine/wasm-bridge";

export function ClockDashboard() {
  const [time, setTime] = useState<TimeRepresentations | null>(null);
  const [mtcStr, setMtcStr] = useState("--:--:--");
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const tick = () => {
      const now = Date.now() / 1000;
      setTime(engine.getTimeRepresentations(now));
      setMtcStr(engine.getMTC(now));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  if (!time) return null;

  const utcDate = new Date(time.unix_utc * 1000);
  const utcStr = utcDate.toISOString().replace("T", " ").slice(0, 19);

  // TAI = UTC + 37s (current leap seconds)
  const taiDate = new Date((time.unix_utc + 37) * 1000);
  const taiStr = taiDate.toISOString().replace("T", " ").slice(0, 19);

  // TT = TAI + 32.184s
  const ttDate = new Date((time.unix_utc + 37 + 32.184) * 1000);
  const ttStr = ttDate.toISOString().replace("T", " ").slice(0, 19);

  return (
    <div style={styles.grid}>
      <ClockCard
        label="UTC"
        sublabel="Coordinated Universal Time"
        value={utcStr}
        detail={`JD ${time.jd_utc.toFixed(6)}`}
        color="#3b82f6"
      />
      <ClockCard
        label="TAI"
        sublabel="International Atomic Time"
        value={taiStr}
        detail={`UTC + 37 leap seconds`}
        color="#8b5cf6"
      />
      <ClockCard
        label="TT"
        sublabel="Terrestrial Time"
        value={ttStr}
        detail={`JD ${time.jd_tt.toFixed(6)}`}
        color="#a78bfa"
      />
      <ClockCard
        label="TCG"
        sublabel="Geocentric Coordinate Time"
        value={`TT + ${time.tcg_minus_tt_s.toFixed(6)} s`}
        detail={`Rate: 1 + ${(6.96929e-10).toExponential(4)}`}
        color="#06b6d4"
      />
      <ClockCard
        label="TCB"
        sublabel="Barycentric Coordinate Time"
        value={`TT + ${time.tcb_minus_tt_s.toFixed(4)} s`}
        detail={`Rate: 1 + ${(1.55052e-8).toExponential(4)}`}
        color="#14b8a6"
      />
      <ClockCard
        label="MTC"
        sublabel="Coordinated Mars Time"
        value={mtcStr}
        detail={`Sol ${time.mars_sol_date.toFixed(4)}`}
        color="#f59e0b"
      />

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
          <div>
            L_G = 6.969290134 {"\u00d7"} 10{"\u207b\u00b9\u2070"} (TT/TCG rate
            diff)
          </div>
          <div>
            L_B = 1.550519768 {"\u00d7"} 10{"\u207b\u2078"} (TDB/TCB rate diff)
          </div>
        </div>
      </div>
    </div>
  );
}

function ClockCard({
  label,
  sublabel,
  value,
  detail,
  color,
}: {
  label: string;
  sublabel: string;
  value: string;
  detail: string;
  color: string;
}) {
  return (
    <div style={{ ...styles.card, borderColor: color + "40" }}>
      <div style={{ ...styles.label, color }}>{label}</div>
      <div style={styles.sublabel}>{sublabel}</div>
      <div style={styles.value}>{value}</div>
      <div style={styles.detail}>{detail}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: "12px",
    maxWidth: "1200px",
    margin: "0 auto",
  },
  card: {
    background: "#111827",
    border: "1px solid",
    borderRadius: "8px",
    padding: "16px",
  },
  label: {
    fontSize: "16px",
    fontWeight: 700,
    letterSpacing: "2px",
  },
  sublabel: {
    fontSize: "10px",
    color: "#6b7280",
    marginBottom: "8px",
    letterSpacing: "0.5px",
  },
  value: {
    fontSize: "20px",
    fontWeight: 600,
    color: "#f1f5f9",
    fontVariantNumeric: "tabular-nums",
    marginBottom: "4px",
  },
  detail: {
    fontSize: "11px",
    color: "#64748b",
    fontVariantNumeric: "tabular-nums",
  },
  infoCard: {
    gridColumn: "1 / -1",
    background: "#111827",
    border: "1px solid #1e293b",
    borderRadius: "8px",
    padding: "16px",
  },
  infoTitle: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#94a3b8",
    marginBottom: "8px",
    letterSpacing: "1px",
  },
  chain: {
    fontSize: "14px",
    color: "#e2e8f0",
    marginBottom: "8px",
    lineHeight: 1.8,
  },
  arrow: {
    color: "#60a5fa",
    fontSize: "11px",
    padding: "0 4px",
  },
  constants: {
    fontSize: "11px",
    color: "#64748b",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
};
