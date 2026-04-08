import React, { useRef, useEffect, useState, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, Stars as DreiStars } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { engine, TimeRepresentations } from "../engine/wasm-bridge";

// ─── Clock data for holographic displays ───────────────────────────────────

const CLOCKS = [
  { key: "utc", label: "UTC", sublabel: "Coordinated Universal Time", color: "#3b82f6", angle: 0 },
  { key: "tai", label: "TAI", sublabel: "International Atomic Time", color: "#8b5cf6", angle: Math.PI / 3 },
  { key: "tt", label: "TT", sublabel: "Terrestrial Time", color: "#a78bfa", angle: (2 * Math.PI) / 3 },
  { key: "tcg", label: "TCG", sublabel: "Geocentric Coordinate Time", color: "#06b6d4", angle: Math.PI },
  { key: "tcb", label: "TCB", sublabel: "Barycentric Coordinate Time", color: "#14b8a6", angle: (4 * Math.PI) / 3 },
  { key: "mtc", label: "MTC", sublabel: "Coordinated Mars Time", color: "#f59e0b", angle: (5 * Math.PI) / 3 },
];

// ─── Main component ────────────────────────────────────────────────────────

export function ClockDashboard() {
  return (
    <div style={styles.container}>
      <div style={styles.canvasWrapper}>
        <Canvas
          camera={{ position: [0, 3, 8], fov: 50 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
          style={{ background: "#010108" }}
        >
          <color attach="background" args={["#010108"]} />
          <ambientLight intensity={0.08} />
          <pointLight position={[10, 5, 5]} intensity={0.6} color="#ffeedd" />
          <HeroScene />
          <DreiStars radius={100} depth={80} count={4000} factor={3} saturation={0.08} fade speed={0.3} />
          <EffectComposer>
            <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} intensity={0.9} mipmapBlur />
            <Vignette eskil={false} offset={0.12} darkness={0.7} />
          </EffectComposer>
          <OrbitControls enablePan={false} maxDistance={20} minDistance={4} enableDamping dampingFactor={0.05} autoRotate autoRotateSpeed={0.3} />
        </Canvas>
      </div>

      <div style={styles.panel}>
        <div style={styles.panelTitle}>Time Scales</div>
        <div style={styles.subtitle}>Multi-frame temporal reference system</div>
        <ClockList />
        <InfoCard />
      </div>
    </div>
  );
}

// ─── 3D Hero Scene ─────────────────────────────────────────────────────────

function HeroScene() {
  return (
    <group>
      <Earth />
      <HolographicClocks />
      <OrbitalRings />
    </group>
  );
}

// Earth with day/night
function Earth() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.getElapsedTime() * 0.05;
  });

  return (
    <group>
      {/* Earth body */}
      <mesh ref={ref}>
        <sphereGeometry args={[1.2, 64, 64]} />
        <meshStandardMaterial
          color="#1a5276"
          roughness={0.6}
          metalness={0.1}
          emissive="#1a3c5e"
          emissiveIntensity={0.3}
        />
      </mesh>
      {/* Atmosphere */}
      <mesh>
        <sphereGeometry args={[1.32, 64, 64]} />
        <meshBasicMaterial color="#60a5fa" transparent opacity={0.06} side={THREE.BackSide} />
      </mesh>
      {/* City lights (night side glow) */}
      <mesh>
        <sphereGeometry args={[1.21, 64, 64]} />
        <meshBasicMaterial color="#ffd54f" transparent opacity={0.04} />
      </mesh>
    </group>
  );
}

// Holographic clock panels floating around Earth
function HolographicClocks() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = clock.getElapsedTime() * 0.08;
    }
  });

  const radius = 3.0;

  return (
    <group ref={groupRef}>
      {CLOCKS.map((c) => {
        const x = Math.cos(c.angle) * radius;
        const z = Math.sin(c.angle) * radius;
        const y = Math.sin(c.angle * 2) * 0.3; // slight vertical undulation
        return (
          <group key={c.key} position={[x, y, z]}>
            <Html center style={{ pointerEvents: "none" }} distanceFactor={8}>
              <HoloClock clockKey={c.key} label={c.label} color={c.color} />
            </Html>
          </group>
        );
      })}
    </group>
  );
}

// Individual holographic clock display
function HoloClock({ clockKey, label, color }: { clockKey: string; label: string; color: string }) {
  const valueRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      if (!valueRef.current) return;
      const now = Date.now() / 1000;
      const time = engine.getTimeRepresentations(now);
      const utcDate = new Date(time.unix_utc * 1000);

      let val = "";
      let det = "";

      switch (clockKey) {
        case "utc":
          val = utcDate.toISOString().replace("T", " ").slice(0, 19);
          det = `JD ${time.jd_utc.toFixed(4)}`;
          break;
        case "tai":
          val = new Date((time.unix_utc + 37) * 1000).toISOString().replace("T", " ").slice(11, 19);
          det = "UTC + 37s";
          break;
        case "tt":
          val = new Date((time.unix_utc + 69.184) * 1000).toISOString().replace("T", " ").slice(11, 19);
          det = `JD ${time.jd_tt.toFixed(4)}`;
          break;
        case "tcg":
          val = `+${time.tcg_minus_tt_s.toFixed(5)}s`;
          det = "vs TT";
          break;
        case "tcb":
          val = `+${time.tcb_minus_tt_s.toFixed(3)}s`;
          det = "vs TT";
          break;
        case "mtc":
          val = engine.getMTC(now);
          det = `Sol ${time.mars_sol_date.toFixed(2)}`;
          break;
      }

      valueRef.current.textContent = val;
      if (detailRef.current) detailRef.current.textContent = det;
    };

    update();
    const id = setInterval(update, 100);
    return () => clearInterval(id);
  }, [clockKey]);

  return (
    <div style={{
      background: `rgba(1, 1, 8, 0.85)`,
      border: `1px solid ${color}50`,
      borderRadius: "6px",
      padding: "6px 12px",
      textAlign: "center",
      minWidth: "110px",
      backdropFilter: "blur(4px)",
      boxShadow: `0 0 12px ${color}20`,
    }}>
      <div style={{ color, fontSize: "11px", fontWeight: 700, letterSpacing: "2px" }}>{label}</div>
      <div ref={valueRef} style={{
        color: "#f1f5f9",
        fontSize: "13px",
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
        fontFamily: "'JetBrains Mono', monospace",
        margin: "3px 0",
      }}>--</div>
      <div ref={detailRef} style={{ color: "#64748b", fontSize: "8px" }}>--</div>
    </div>
  );
}

// Orbital rings around Earth
function OrbitalRings() {
  return (
    <group>
      {[2.0, 2.5, 3.5].map((r, i) => (
        <mesh key={i} rotation={[Math.PI / 2 + i * 0.15, i * 0.3, 0]}>
          <ringGeometry args={[r - 0.005, r + 0.005, 128]} />
          <meshBasicMaterial color="#1e293b" transparent opacity={0.3} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Side panel clock list (text-based, real-time) ─────────────────────────

function ClockList() {
  const [time, setTime] = useState<TimeRepresentations | null>(null);
  const [mtcStr, setMtcStr] = useState("--:--:--");

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const now = Date.now() / 1000;
      setTime(engine.getTimeRepresentations(now));
      setMtcStr(engine.getMTC(now));
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

  return (
    <div style={styles.clockList}>
      <ClockRow label="UTC" value={utcStr} detail={`JD ${time.jd_utc.toFixed(6)}`} color="#3b82f6" />
      <ClockRow label="TAI" value={taiStr} detail="UTC + 37 leap seconds" color="#8b5cf6" />
      <ClockRow label="TT" value={ttStr} detail={`JD ${time.jd_tt.toFixed(6)}`} color="#a78bfa" />
      <ClockRow label="TCG" value={`TT + ${time.tcg_minus_tt_s.toFixed(6)} s`} detail={`Rate: 1 + ${(6.96929e-10).toExponential(4)}`} color="#06b6d4" />
      <ClockRow label="TCB" value={`TT + ${time.tcb_minus_tt_s.toFixed(4)} s`} detail={`Rate: 1 + ${(1.55052e-8).toExponential(4)}`} color="#14b8a6" />
      <ClockRow label="MTC" value={mtcStr} detail={`Sol ${time.mars_sol_date.toFixed(4)}`} color="#f59e0b" />
    </div>
  );
}

function ClockRow({ label, value, detail, color }: { label: string; value: string; detail: string; color: string }) {
  return (
    <div style={styles.clockRow}>
      <div style={{ ...styles.clockLabel, color }}>{label}</div>
      <div style={styles.clockValue}>{value}</div>
      <div style={styles.clockDetail}>{detail}</div>
    </div>
  );
}

function InfoCard() {
  return (
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
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    height: "calc(100vh - 130px)",
    gap: "0",
  },
  canvasWrapper: {
    flex: 1,
    borderRadius: "8px",
    overflow: "hidden",
    border: "1px solid #1e293b",
  },
  panel: {
    width: "320px",
    background: "#111827",
    border: "1px solid #1e293b",
    borderRadius: "8px",
    padding: "14px",
    marginLeft: "10px",
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  panelTitle: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#94a3b8",
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
  },
  subtitle: {
    fontSize: "10px",
    color: "#64748b",
    marginTop: "-6px",
  },
  clockList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  clockRow: {
    background: "#0f172a",
    borderRadius: "6px",
    padding: "8px 10px",
  },
  clockLabel: {
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "2px",
    marginBottom: "2px",
  },
  clockValue: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#f1f5f9",
    fontVariantNumeric: "tabular-nums",
    marginBottom: "2px",
  },
  clockDetail: {
    fontSize: "10px",
    color: "#64748b",
    fontVariantNumeric: "tabular-nums",
  },
  infoCard: {
    background: "#0f172a",
    borderRadius: "6px",
    padding: "10px",
  },
  infoTitle: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#94a3b8",
    marginBottom: "6px",
    letterSpacing: "0.5px",
  },
  chain: {
    fontSize: "11px",
    color: "#e2e8f0",
    marginBottom: "6px",
    lineHeight: 1.8,
  },
  arrow: {
    color: "#60a5fa",
    fontSize: "9px",
    padding: "0 3px",
  },
  constants: {
    fontSize: "10px",
    color: "#64748b",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
};
