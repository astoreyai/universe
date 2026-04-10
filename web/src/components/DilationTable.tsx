import React, { useMemo, useState, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, Stars as DreiStars } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { engine, BodyDilation } from "../engine/wasm-bridge";

// ─── Body config ───────────────────────────────────────────────────────────

const BODY_COLORS: Record<string, string> = {
  Sun: "#ffd54f", Mercury: "#8c8c8c", Venus: "#e8c87a", Earth: "#4a90d9",
  Mars: "#c1440e", Moon: "#c0c0c0", Jupiter: "#c88b3a", Saturn: "#d4b87a",
  "Neutron Star (1.4M\u2609)": "#a78bfa", "Black Hole (3r\u209b)": "#ef4444",
};

const BODY_DESCRIPTIONS: Record<string, string> = {
  Sun: "Deepest gravity well in solar system \u2014 clocks lose 66s/year",
  Earth: "Our reference frame \u2014 GPS corrects +38.6 \xB5s/day",
  Mars: "Weaker gravity \u2014 clocks run slightly faster than Earth",
  Jupiter: "Most massive planet \u2014 second deepest gravity well",
  "Neutron Star (1.4M\u2609)": "Collapsed stellar core \u2014 extreme spacetime curvature",
  "Black Hole (3r\u209b)": "At 3\u00D7 Schwarzschild radius \u2014 time nearly frozen",
};

// Body positions on the spacetime grid (x, z in scene units)
const BODY_POSITIONS: Record<string, [number, number]> = {
  Sun: [0, 0],
  Mercury: [2.5, 0],
  Venus: [3.5, 1.5],
  Earth: [4.5, 0],
  Moon: [5.0, 0.8],
  Mars: [5.5, -1.5],
  Jupiter: [-3, -2],
  Saturn: [-4.5, 1.5],
  "Neutron Star (1.4M\u2609)": [-2, 3.5],
  "Black Hole (3r\u209b)": [3, -3.5],
};

function computeEscapeVelocity(b: BodyDilation): number | null {
  if (b.surface_gravity <= 0 || b.schwarzschild_radius <= 0) return null;
  const C2 = 299792458 * 299792458;
  const GM = b.schwarzschild_radius * C2 / 2;
  const R = GM / b.surface_gravity;
  return Math.sqrt(2 * GM / R);
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

// ─── Main component ────────────────────────────────────────────────────────

export function DilationTable() {
  const [referenceBody, setReferenceBody] = useState("Earth");
  const [hoveredBody, setHoveredBody] = useState<string | null>(null);

  const bodies = useMemo(() => {
    try { return engine.getSolarSystemDilation(); } catch { return []; }
  }, []);

  const extremeObjects: BodyDilation[] = useMemo(() => {
    try {
      return [
        {
          name: "Neutron Star (1.4M\u2609)",
          dilation_factor: engine.schwarzschildDilation(1.4 * engine.constants.gmSun(), 10_000),
          seconds_lost_per_year: engine.secondsLostPerYear(engine.schwarzschildDilation(1.4 * engine.constants.gmSun(), 10_000)),
          schwarzschild_radius: (2 * 1.4 * engine.constants.gmSun()) / (299792458 * 299792458),
          surface_gravity: (1.4 * engine.constants.gmSun()) / (10_000 * 10_000),
        },
        {
          name: "Black Hole (3r\u209b)",
          dilation_factor: engine.schwarzschildDilation(10 * engine.constants.gmSun(), 3 * (2 * 10 * engine.constants.gmSun()) / (299792458 * 299792458)),
          seconds_lost_per_year: engine.secondsLostPerYear(engine.schwarzschildDilation(10 * engine.constants.gmSun(), 3 * (2 * 10 * engine.constants.gmSun()) / (299792458 * 299792458))),
          schwarzschild_radius: (2 * 10 * engine.constants.gmSun()) / (299792458 * 299792458),
          surface_gravity: 0,
        },
      ];
    } catch { return []; }
  }, []);

  const allBodies = useMemo(() => {
    return [...bodies, ...extremeObjects].sort((a, b) => (1 - b.dilation_factor) - (1 - a.dilation_factor));
  }, [bodies, extremeObjects]);

  const refBody = allBodies.find((b) => b.name === referenceBody);
  const refFactor = refBody?.dilation_factor ?? 1;

  return (
    <div style={styles.container} className="scene-layout">
      {/* 3D curved spacetime visualization */}
      <div style={styles.canvasWrapper} className="scene-canvas">
        <Canvas
          camera={{ position: [0, 8, 10], fov: 50 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
          style={{ background: "#020208" }}
        >
          <color attach="background" args={["#020208"]} />
          <ambientLight intensity={0.15} />
          <pointLight position={[5, 10, 5]} intensity={0.5} />
          <SpacetimeFabric bodies={allBodies} referenceBody={referenceBody} hoveredBody={hoveredBody} onHover={setHoveredBody} onSelect={setReferenceBody} />
          <DreiStars radius={60} depth={40} count={3000} factor={2} saturation={0.05} fade speed={0.3} />
          <EffectComposer>
            <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} intensity={1.2} mipmapBlur />
            <Vignette eskil={false} offset={0.15} darkness={0.7} />
          </EffectComposer>
          <OrbitControls enablePan enableZoom maxDistance={25} minDistance={3} enableDamping dampingFactor={0.05} />
        </Canvas>
      </div>

      {/* Data panel */}
      <div style={styles.panel} className="scene-panel">
        <div style={styles.panelTitle}>Curved Spacetime</div>
        <div style={styles.subtitle}>Gravity bends spacetime — deeper wells = slower clocks</div>

        <div style={styles.whyCard}>
          <div style={styles.whyTitle}>Why This Matters</div>
          <div style={styles.whyText}>
            The grid curves deeper near massive objects {"\u2014"} that curvature IS gravity. Clocks at the bottom of a well tick slower. GPS satellites orbit above Earth's well, so their clocks tick +38.6 {"\u03BCs"}/day faster. The deeper the well, the greater the effect.
          </div>
        </div>

        <div style={styles.controls}>
          <label style={styles.controlLabel}>Reference:</label>
          <select value={referenceBody} onChange={(e) => setReferenceBody(e.target.value)} style={styles.select}>
            {bodies.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
          </select>
        </div>

        <div style={styles.dataList}>
          {allBodies.map((b) => {
            const relDiff = (b.dilation_factor - refFactor) * 86_400 * 1e6;
            const isRef = b.name === referenceBody;
            const isHovered = hoveredBody === b.name;
            const color = BODY_COLORS[b.name] || "#94a3b8";
            const shift = 1 - b.dilation_factor;
            const vEsc = computeEscapeVelocity(b);
            return (
              <div key={b.name}
                style={{ ...styles.dataRow, ...(isRef ? styles.refRow : {}), ...(isHovered ? { borderLeft: `2px solid ${color}` } : {}) }}
                onPointerEnter={() => setHoveredBody(b.name)}
                onPointerLeave={() => setHoveredBody(null)}
              >
                <div style={styles.bodyHeader}>
                  <span style={{ color }}>{"\u25CF"} {b.name}</span>
                  <span style={styles.dilationVal}>
                    {b.dilation_factor < 0.999 ? b.dilation_factor.toFixed(6) : `1\u2212${shift.toExponential(2)}`}
                  </span>
                </div>
                <div style={styles.bodyDetail}>
                  <span>Lost/yr: {formatSecondsLost(b.seconds_lost_per_year)}</span>
                  <span style={{ color: relDiff > 0 ? "#34d399" : relDiff < 0 ? "#f87171" : "#94a3b8" }}>
                    {isRef ? "REF" : formatMicroseconds(relDiff) + "/day"}
                  </span>
                </div>
                {vEsc && <div style={styles.bodyDetail}><span>v_esc: {(vEsc / 1000).toFixed(1)} km/s</span></div>}
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

// ─── 3D Curved Spacetime Grid ──────────────────────────────────────────────

function SpacetimeFabric({ bodies, referenceBody, hoveredBody, onHover, onSelect }: {
  bodies: BodyDilation[]; referenceBody: string; hoveredBody: string | null;
  onHover: (name: string | null) => void; onSelect: (name: string) => void;
}) {
  // Build a deformable grid mesh
  const gridSize = 14;
  const gridRes = 80;

  const { geometry, wellDepths } = useMemo(() => {
    const geom = new THREE.PlaneGeometry(gridSize, gridSize, gridRes, gridRes);
    geom.rotateX(-Math.PI / 2);
    const pos = geom.attributes.position;
    const depths: { name: string; x: number; z: number; depth: number; color: string }[] = [];

    // Compute well depths from dilation factors
    bodies.forEach((b) => {
      const bPos = BODY_POSITIONS[b.name] || [0, 0];
      const shift = 1 - b.dilation_factor;
      // Log-scale depth: maps tiny shifts (1e-10 for Earth) and huge ones (0.23 for NS) to visible range
      const depth = shift > 0 ? Math.max((Math.log10(shift) + 10) / 10, 0) * 3.5 : 0;
      depths.push({ name: b.name, x: bPos[0], z: bPos[1], depth, color: BODY_COLORS[b.name] || "#94a3b8" });
    });

    // Deform grid vertices
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      let totalDeform = 0;
      depths.forEach((d) => {
        const dx = vx - d.x;
        const dz = vz - d.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        // Gaussian-like well: depth * exp(-dist²/σ²)
        const sigma = 0.8 + d.depth * 0.3;
        totalDeform += d.depth * Math.exp(-(dist * dist) / (sigma * sigma));
      });
      pos.setY(i, -totalDeform);
    }

    geom.computeVertexNormals();
    return { geometry: geom, wellDepths: depths };
  }, [bodies]);

  const gridRef = useRef<THREE.Mesh>(null);

  return (
    <group>
      {/* Wireframe spacetime grid */}
      <mesh ref={gridRef} geometry={geometry}>
        <meshBasicMaterial color="#2a4a6f" wireframe transparent opacity={0.3} />
      </mesh>
      {/* Solid surface underneath for depth perception */}
      <mesh geometry={geometry}>
        <meshBasicMaterial color="#0a1628" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>

      {/* Bodies sitting in their wells */}
      {wellDepths.map((d) => {
        const isRef = d.name === referenceBody;
        const isHovered = hoveredBody === d.name;
        const sphereR = 0.08 + d.depth * 0.12;
        const isExtreme = d.name.includes("Neutron") || d.name.includes("Black");

        return (
          <group key={d.name} position={[d.x, -d.depth + sphereR, d.z]}>
            {/* Body sphere */}
            <mesh
              onClick={(e) => { e.stopPropagation(); if (!isExtreme) onSelect(d.name); }}
              onPointerEnter={() => onHover(d.name)}
              onPointerLeave={() => onHover(null)}
            >
              <sphereGeometry args={[sphereR, 16, 16]} />
              <meshBasicMaterial color={isRef ? "#ffffff" : d.color} />
            </mesh>
            {/* Glow */}
            <mesh>
              <sphereGeometry args={[sphereR * 1.6, 16, 16]} />
              <meshBasicMaterial color={d.color} transparent opacity={isHovered ? 0.25 : 0.1} />
            </mesh>
            {/* Selection ring */}
            {isRef && (
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <ringGeometry args={[sphereR * 1.8, sphereR * 2.0, 32]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.4} side={THREE.DoubleSide} />
              </mesh>
            )}
            {/* Label */}
            {(isHovered || isRef) && (
              <Html position={[0, sphereR + 0.2, 0]} center style={{ pointerEvents: "none" }}>
                <div style={{
                  color: d.color, fontSize: "10px", fontWeight: 700,
                  fontFamily: "'JetBrains Mono', monospace",
                  background: "rgba(2,2,8,0.9)", padding: "2px 6px",
                  borderRadius: "3px", whiteSpace: "nowrap",
                  border: `1px solid ${d.color}30`,
                }}>
                  {d.name.length > 15 ? d.name.slice(0, 13) + ".." : d.name}
                  <div style={{ fontSize: "9px", color: "#94a3b8", fontWeight: 400 }}>
                    well depth: {d.depth.toFixed(2)}
                  </div>
                </div>
              </Html>
            )}
          </group>
        );
      })}

      {/* Grid edge glow lines */}
      <mesh position={[0, 0, 0]}>
        <ringGeometry args={[gridSize * 0.49, gridSize * 0.5, 64]} />
        <meshBasicMaterial color="#1e3a5f" transparent opacity={0.15} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: { display: "flex", height: "calc(100vh - 130px)", gap: 0 },
  canvasWrapper: {
    flex: 1, borderRadius: "8px", overflow: "hidden", border: "1px solid #1e293b",
  },
  panel: {
    width: "280px", background: "rgba(17,24,39,0.85)", backdropFilter: "blur(12px)",
    border: "1px solid #1e293b", borderRadius: "8px", padding: "14px", marginLeft: "10px",
    overflow: "auto", display: "flex", flexDirection: "column", gap: "10px",
  },
  panelTitle: { fontSize: "13px", fontWeight: 600, color: "#a78bfa", letterSpacing: "1px", textTransform: "uppercase" as const },
  subtitle: { fontSize: "10px", color: "#64748b", marginTop: "-6px" },
  whyCard: {
    background: "#0f172a", borderRadius: "6px", padding: "10px",
    borderLeft: "3px solid #3b82f6", boxShadow: "0 0 15px rgba(0,0,0,0.3)",
  },
  whyTitle: { fontSize: "11px", fontWeight: 600, color: "#3b82f6", marginBottom: "4px" },
  whyText: { fontSize: "10px", color: "#e2e8f0", lineHeight: 1.5 },
  controls: { display: "flex", alignItems: "center", gap: "8px" },
  controlLabel: { fontSize: "11px", color: "#94a3b8" },
  select: {
    background: "#1e293b", color: "#e2e8f0", border: "1px solid #334155",
    borderRadius: "4px", padding: "4px 8px", fontSize: "11px", fontFamily: "inherit", flex: 1,
  },
  dataList: { display: "flex", flexDirection: "column", gap: "6px" },
  dataRow: {
    background: "#0f172a", borderRadius: "6px", padding: "8px",
    transition: "all 0.2s ease", borderLeft: "2px solid transparent",
    boxShadow: "0 0 15px rgba(0,0,0,0.3)",
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
    fontSize: "10px", color: "#64748b", fontStyle: "italic",
    marginTop: "4px", lineHeight: 1.4,
  },
};
