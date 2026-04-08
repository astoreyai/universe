import React, { useRef, useMemo, useState } from "react";
import { Canvas, useFrame, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Line, Html, Stars as DreiStars } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { engine } from "../engine/wasm-bridge";

// ─── Data ───────────────────────────────────────────────────────────────────

// [name, semiMajorAxis_AU, orbitalPeriod_yr, radius_km, color, hasRings]
const PLANETS: [string, number, number, number, string, boolean][] = [
  ["Mercury", 0.387, 0.241, 2440, "#8c8c8c", false],
  ["Venus", 0.723, 0.615, 6052, "#e8c87a", false],
  ["Earth", 1.0, 1.0, 6371, "#4a90d9", false],
  ["Mars", 1.524, 1.881, 3390, "#c1440e", false],
  ["Jupiter", 5.203, 11.86, 69911, "#c88b3a", false],
  ["Saturn", 9.537, 29.46, 58232, "#d4b87a", true],
];

const AU = 10;
const PLANET_SCALE = 0.0002;
const SUN_R = 0.5;
const MIN_R = 0.12;
const TIME_SPEED = 0.5;

interface PData {
  name: string;
  au: number;
  period: number;
  rKm: number;
  color: string;
  rings: boolean;
  df: number;
  lost: number;
}

// ─── Root ───────────────────────────────────────────────────────────────────

export function SolarSystemView() {
  const [selected, setSelected] = useState("Earth");
  const [hovered, setHovered] = useState<string | null>(null);

  const planets: PData[] = useMemo(() => {
    const dd = engine.getSolarSystemDilation();
    return PLANETS.map(([n, a, p, r, c, rings]) => {
      const d = dd.find((x) => x.name === n);
      return { name: n, au: a, period: p, rKm: r, color: c, rings, df: d?.dilation_factor ?? 1, lost: d?.seconds_lost_per_year ?? 0 };
    });
  }, []);

  const sunD = useMemo(() => engine.getSolarSystemDilation().find((b) => b.name === "Sun"), []);
  const selP = planets.find((p) => p.name === selected);
  const refDf = selP?.df ?? (selected === "Sun" ? sunD?.dilation_factor ?? 1 : 1);

  return (
    <div style={S.container} className="scene-layout">
      <div style={S.canvas} className="scene-canvas">
        <Canvas camera={{ position: [0, 18, 25], fov: 45 }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }} style={{ background: "#020208" }}>
          <color attach="background" args={["#020208"]} />
          <ambientLight intensity={0.08} />

          <Sun selected={selected === "Sun"} onClick={() => setSelected("Sun")} onHover={setHovered} />

          {planets.map((p) => (
            <Planet key={p.name} d={p} selected={selected === p.name} hovered={hovered === p.name} refDf={refDf} onClick={() => setSelected(p.name)} onHover={setHovered} />
          ))}

          {planets.map((p) => (
            <OrbitRing key={`o-${p.name}`} r={p.au * AU} active={selected === p.name} />
          ))}

          <DreiStars radius={100} depth={80} count={4000} factor={3} saturation={0.1} fade speed={0.5} />

          <EffectComposer>
            <Bloom luminanceThreshold={0.4} luminanceSmoothing={0.9} intensity={0.8} mipmapBlur />
            <Vignette eskil={false} offset={0.2} darkness={0.7} />
          </EffectComposer>

          <OrbitControls enablePan maxDistance={80} minDistance={3} enableDamping dampingFactor={0.05} />
        </Canvas>
      </div>

      <div style={S.panel} className="scene-panel" data-testid="solar-system-panel">
        <div style={S.panelHdr}>Observer Frame</div>

        <div style={S.btns}>
          {["Sun", ...planets.map((p) => p.name)].map((n) => (
            <button key={n} onClick={() => setSelected(n)} style={{ ...S.btn, ...(selected === n ? S.btnA : {}) }}>{n}</button>
          ))}
        </div>

        <div style={S.info}>
          <div style={S.infoName}>{selected}</div>
          {selected === "Sun" ? (
            <div style={S.infoD}>
              <Row l="d\u03C4/dt" v={sunD ? `1 - ${(1 - sunD.dilation_factor).toExponential(3)}` : "\u2014"} />
              <Row l="Lost/year" v={sunD ? `${sunD.seconds_lost_per_year.toFixed(1)} s` : "\u2014"} />
            </div>
          ) : selP ? (
            <div style={S.infoD}>
              <Row l="d\u03C4/dt" v={`1 - ${(1 - selP.df).toExponential(3)}`} />
              <Row l="Lost/year" v={fmt(selP.lost)} />
              <Row l="Orbit" v={`${selP.au.toFixed(3)} AU  |  ${selP.period.toFixed(2)} yr`} />
            </div>
          ) : null}
        </div>

        <div style={S.comp}>
          <div style={S.compHdr}>Differential Aging vs {selected}</div>
          {planets.filter((p) => p.name !== selected).map((p) => {
            const d = engine.compareBodies(selected, p.name);
            return (
              <div key={p.name} style={S.compRow}>
                <span style={{ color: p.color }}>{"\u25CF"} {p.name}</span>
                <span style={{ color: d > 0 ? "#34d399" : "#f87171", fontVariantNumeric: "tabular-nums" }}>
                  {d > 0 ? "+" : ""}{d.toFixed(2)} \u03BCs/day
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Sun ────────────────────────────────────────────────────────────────────

function Sun({ selected, onClick, onHover }: { selected: boolean; onClick: () => void; onHover: (n: string | null) => void }) {
  const ref = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.05;
    if (glowRef.current) glowRef.current.rotation.z += dt * 0.02;
  });

  return (
    <group>
      {/* Core */}
      <mesh ref={ref} onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(); }} onPointerEnter={() => onHover("Sun")} onPointerLeave={() => onHover(null)}>
        <sphereGeometry args={[SUN_R, 48, 48]} />
        <meshBasicMaterial color="#ffd54f" />
      </mesh>
      {/* Glow layers */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[SUN_R * 1.3, 32, 32]} />
        <meshBasicMaterial color="#ffab00" transparent opacity={0.12} />
      </mesh>
      <mesh>
        <sphereGeometry args={[SUN_R * 1.8, 32, 32]} />
        <meshBasicMaterial color="#ff6f00" transparent opacity={0.04} />
      </mesh>
      {/* Point light from center */}
      <pointLight position={[0, 0, 0]} intensity={3} color="#fff3e0" distance={100} decay={1.5} />
      {/* Selection indicator */}
      {selected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[SUN_R * 1.5, SUN_R * 1.6, 48]} />
          <meshBasicMaterial color="#ffd54f" transparent opacity={0.3} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

// ─── Planet ─────────────────────────────────────────────────────────────────

function Planet({ d, selected, hovered, refDf, onClick, onHover }: { d: PData; selected: boolean; hovered: boolean; refDf: number; onClick: () => void; onHover: (n: string | null) => void }) {
  const gRef = useRef<THREE.Group>(null);
  const mRef = useRef<THREE.Mesh>(null);
  const orbR = d.au * AU;
  const sz = Math.max(d.rKm * PLANET_SCALE, MIN_R);
  const ddiff = d.df - refDf;
  const dColor = ddiff > 0 ? "#34d399" : "#f87171";

  useFrame(({ clock }) => {
    if (gRef.current) {
      const a = (clock.getElapsedTime() * TIME_SPEED) / d.period + d.au * 1.5;
      gRef.current.position.x = Math.cos(a) * orbR;
      gRef.current.position.z = Math.sin(a) * orbR;
    }
    if (mRef.current) mRef.current.rotation.y += 0.008;
  });

  return (
    <group ref={gRef}>
      <mesh ref={mRef} onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(); }} onPointerEnter={() => onHover(d.name)} onPointerLeave={() => onHover(null)}>
        <sphereGeometry args={[sz, 32, 32]} />
        <meshStandardMaterial color={d.color} roughness={0.7} metalness={0.1} emissive={selected || hovered ? d.color : "#000"} emissiveIntensity={selected ? 0.5 : hovered ? 0.25 : 0} />
      </mesh>

      {/* Atmosphere glow for Earth */}
      {d.name === "Earth" && (
        <mesh>
          <sphereGeometry args={[sz * 1.08, 32, 32]} />
          <meshBasicMaterial color="#4a90d9" transparent opacity={0.1} />
        </mesh>
      )}

      {/* Saturn rings */}
      {d.rings && (
        <mesh rotation={[Math.PI * 0.45, 0, 0]}>
          <ringGeometry args={[sz * 1.4, sz * 2.2, 64]} />
          <meshBasicMaterial color="#c8a87a" transparent opacity={0.4} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Selection ring */}
      {selected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[sz * 1.5, sz * 1.65, 48]} />
          <meshBasicMaterial color={d.color} transparent opacity={0.4} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Label */}
      {(selected || hovered) && (
        <Html position={[0, sz + 0.35, 0]} center style={{ pointerEvents: "none" }}>
          <div style={{ color: "#f1f5f9", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", background: "rgba(15,23,42,0.85)", padding: "3px 8px", borderRadius: "4px", border: `1px solid ${d.color}50`, backdropFilter: "blur(4px)", whiteSpace: "nowrap" }}>
            <div style={{ fontWeight: 700, marginBottom: "1px" }}>{d.name}</div>
            <div style={{ color: dColor, fontSize: "10px" }}>
              {ddiff >= 0 ? "+" : ""}{(ddiff * 86400 * 1e6).toFixed(2)} \u03BCs/day
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

// ─── Orbit Ring ─────────────────────────────────────────────────────────────

function OrbitRing({ r, active }: { r: number; active: boolean }) {
  const pts = useMemo(() => {
    const p: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      p.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    return p;
  }, [r]);

  return <Line points={pts} color={active ? "#60a5fa" : "#1e293b"} lineWidth={active ? 1.2 : 0.4} transparent opacity={active ? 0.5 : 0.15} />;
}

// ─── UI Helpers ─────────────────────────────────────────────────────────────

function Row({ l, v }: { l: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#94a3b8", padding: "1px 0" }}>
      <span style={{ color: "#64748b" }}>{l}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{v}</span>
    </div>
  );
}

function fmt(s: number): string {
  if (s < 0.001) return `${(s * 1e6).toFixed(1)} \u03BCs`;
  if (s < 1) return `${(s * 1e3).toFixed(3)} ms`;
  return `${s.toFixed(3)} s`;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  container: { display: "flex", height: "calc(100vh - 120px)", gap: 0 },
  canvas: { flex: 1, borderRadius: "8px", overflow: "hidden", border: "1px solid #1e293b" },
  panel: { width: "280px", background: "#0f1219", border: "1px solid #1e293b", borderRadius: "8px", padding: "14px", marginLeft: "10px", overflow: "auto", display: "flex", flexDirection: "column", gap: "12px" },
  panelHdr: { fontSize: "12px", fontWeight: 600, color: "#94a3b8", letterSpacing: "1.5px", textTransform: "uppercase" },
  btns: { display: "flex", flexWrap: "wrap", gap: "4px" },
  btn: { padding: "4px 8px", border: "1px solid #1e293b", borderRadius: "4px", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: "11px", fontFamily: "inherit", transition: "all 0.15s" },
  btnA: { background: "#1e293b", color: "#e2e8f0", borderColor: "#3b82f6" },
  info: { background: "#0a0f18", borderRadius: "6px", padding: "10px", border: "1px solid #1e293b30" },
  infoName: { fontSize: "16px", fontWeight: 700, color: "#f1f5f9", marginBottom: "6px" },
  infoD: { display: "flex", flexDirection: "column", gap: "2px" },
  comp: { display: "flex", flexDirection: "column", gap: "4px" },
  compHdr: { fontSize: "11px", color: "#64748b", letterSpacing: "0.5px", marginBottom: "2px" },
  compRow: { display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "2px 0", borderBottom: "1px solid #0a0f18" },
};
