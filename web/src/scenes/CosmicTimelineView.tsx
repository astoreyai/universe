import React, { useRef, useMemo, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, Stars as DreiStars } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { engine } from "../engine/wasm-bridge";

// ─── Coordinate mapping ────────────────────────────────────────────────────

const SCENE_HEIGHT = 14; // scene units, ~1 unit per Gyr
const AGE_NOW = 13.8; // Gyr (approximate, exact from engine)
const R_K = 3; // asinh radial scale
const R_L = 5; // asinh reference distance (Gly)

function cosmicTimeToY(ageGyr: number): number {
  return (ageGyr / AGE_NOW) * SCENE_HEIGHT;
}

function comovingToSceneR(distGly: number): number {
  return R_K * Math.asinh(distGly / R_L);
}

// ─── Milestones ────────────────────────────────────────────────────────────

const MILESTONES = [
  { z: 1100, label: "CMB / Last Scattering", color: "#ef4444", short: "CMB" },
  { z: 20, label: "First Stars", color: "#f97316", short: "Stars" },
  { z: 10, label: "Cosmic Dawn", color: "#fbbf24", short: "Dawn" },
  { z: 2, label: "Peak Star Formation", color: "#34d399", short: "Peak SF" },
  { z: 0, label: "Present Day", color: "#60a5fa", short: "Now" },
];

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

// ─── Age-to-redshift lookup table ──────────────────────────────────────────

interface LookupEntry {
  age: number;
  z: number;
}

function buildAgeLookup(): LookupEntry[] {
  const table: LookupEntry[] = [];
  for (let i = 0; i <= 500; i++) {
    const z = Math.max(Math.pow(10, (i / 500) * 3.04) - 1, 0);
    try {
      const age = engine.ageAtRedshiftGyr(z);
      if (!isNaN(age)) table.push({ age, z });
    } catch (e) {
      // skip this sample on engine error
    }
  }
  return table.sort((a, b) => a.age - b.age);
}

function ageToRedshift(table: LookupEntry[], ageGyr: number): number {
  if (ageGyr <= table[0].age) return table[0].z;
  if (ageGyr >= table[table.length - 1].age) return 0;
  let lo = 0,
    hi = table.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid].age < ageGyr) lo = mid;
    else hi = mid;
  }
  const frac = (ageGyr - table[lo].age) / (table[hi].age - table[lo].age);
  return table[lo].z + frac * (table[hi].z - table[lo].z);
}

// ─── Main component ────────────────────────────────────────────────────────

export function CosmicTimelineView() {
  const [epochAge, setEpochAge] = useState(13.8); // Gyr — default to present
  const [showHubble, setShowHubble] = useState(false);
  const [showParticles, setShowParticles] = useState(true);
  const [showLabels, setShowLabels] = useState(true);

  const ageLookup = useMemo(() => {
    try {
      return buildAgeLookup();
    } catch (e) {
      return [];
    }
  }, []);
  const ageNow = useMemo(() => {
    try {
      const v = engine.ageOfUniverseGyr();
      return isNaN(v) ? 13.8 : v;
    } catch (e) {
      return 13.8;
    }
  }, []);

  const sliceZ = useMemo(() => ageToRedshift(ageLookup, epochAge), [ageLookup, epochAge]);
  const sliceData = useMemo(
    () => {
      const s = (fn: () => number, fallback = 0) => {
        try { const v = fn(); return isNaN(v) ? fallback : v; } catch { return fallback; }
      };
      return {
        z: sliceZ,
        a: s(() => engine.scaleFactorFromRedshift(sliceZ), 1),
        age: epochAge,
        hubble: s(() => engine.hubbleParameterKmSMpc(sliceZ), 67.4),
        comoving: s(() => engine.comovingDistanceGly(sliceZ)),
        dilation: s(() => engine.cosmologicalDilation(sliceZ), 1),
        lookback: s(() => engine.lookbackTimeGyr(sliceZ)),
      };
    },
    [sliceZ, epochAge]
  );

  // Log slider: maps 0..1 → 0.001..ageNow Gyr
  const sliderToAge = (v: number) => Math.pow(10, v * (Math.log10(ageNow) - Math.log10(0.001)) + Math.log10(0.001));
  const ageToSlider = (age: number) =>
    (Math.log10(Math.max(age, 0.001)) - Math.log10(0.001)) / (Math.log10(ageNow) - Math.log10(0.001));

  // Milestones table
  const milestones = useMemo(
    () => {
      const s = (fn: () => number, fallback = 0) => {
        try { const v = fn(); return isNaN(v) ? fallback : v; } catch { return fallback; }
      };
      return [0.01, 0.1, 0.5, 1, 2, 5, 10, 100, 1100].map((z) => ({
        z,
        a: (1 / (1 + z)).toFixed(4),
        dilation: s(() => engine.cosmologicalDilation(z), 1),
        lookback: s(() => engine.lookbackTimeGyr(z)),
        comoving: s(() => engine.comovingDistanceGly(z)),
        age: s(() => engine.ageAtRedshiftGyr(z)),
      }));
    },
    []
  );

  return (
    <div style={styles.container} className="scene-layout">
      <div style={styles.canvasWrapper} className="scene-canvas">
        <Canvas
          camera={{ position: [0, 7, 18], fov: 50 }}
          gl={{
            antialias: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.0,
          }}
          style={{ background: "#010108" }}
        >
          <color attach="background" args={["#010108"]} />
          <ambientLight intensity={0.03} />
          <CosmicScene
            epochAge={epochAge}
            sliceZ={sliceZ}
            showHubble={showHubble}
            showParticles={showParticles}
            showLabels={showLabels}
          />
          <DreiStars radius={80} depth={60} count={7000} factor={3} saturation={0.05} fade speed={0.4} />
          <EffectComposer>
            <Bloom luminanceThreshold={0.15} luminanceSmoothing={0.9} intensity={1.5} mipmapBlur />
            <Vignette eskil={false} offset={0.15} darkness={0.75} />
          </EffectComposer>
          <OrbitControls enablePan maxDistance={50} minDistance={3} enableDamping dampingFactor={0.05} />
        </Canvas>
      </div>

      <div style={styles.panel} className="scene-panel" data-testid="cosmic-panel">
        <div style={styles.panelTitle}>Cosmic Timeline</div>

        {/* Epoch slider */}
        <div style={styles.sliderSection}>
          <div style={styles.sliderHeader}>
            <span style={styles.sliderLabel}>Epoch Slice</span>
            <span style={styles.sliderValue}>{epochAge.toFixed(2)} Gyr</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.002"
            value={ageToSlider(epochAge)}
            onChange={(e) => setEpochAge(sliderToAge(parseFloat(e.target.value)))}
            style={styles.sliderInput}
            data-testid="epoch-slider"
          />
          <div style={styles.sliderTicks}>
            <span>Big Bang</span>
            <span>Now</span>
          </div>
        </div>

        {/* Epoch readout */}
        <div style={{ ...styles.results, transition: "all 0.3s ease" }} data-testid="epoch-readout">
          <div style={styles.resultRow}>
            <span>Redshift z</span>
            <span style={{ color: "#f59e0b" }}>{sliceData.z < 100 ? sliceData.z.toFixed(2) : sliceData.z.toFixed(0)}</span>
          </div>
          <div style={styles.resultRow}>
            <span>Scale factor a</span>
            <span>{sliceData.a.toFixed(4)}</span>
          </div>
          <div style={styles.resultRow}>
            <span>Cosmic age</span>
            <span>{sliceData.age.toFixed(2)} Gyr</span>
          </div>
          <div style={styles.resultRow}>
            <span>H(z)</span>
            <span>{sliceData.hubble.toFixed(1)} km/s/Mpc</span>
          </div>
          <div style={styles.resultRow}>
            <span>Comoving radius</span>
            <span>{sliceData.comoving.toFixed(2)} Gly</span>
          </div>
          <div style={styles.resultRow}>
            <span>Time dilation</span>
            <span>{sliceData.dilation.toFixed(2)}{"\u00D7"}</span>
          </div>
          <div style={styles.resultRow}>
            <span>Lookback time</span>
            <span>{sliceData.lookback.toFixed(2)} Gyr</span>
          </div>
          <div style={{ ...styles.resultRow, color: "#94a3b8", fontSize: "10px", marginTop: "4px", transition: "color 0.3s ease" }}>
            {describeRedshift(sliceData.z)}
          </div>
          {/* Round 7 — Prominent epoch description */}
          {(() => {
            const desc = describeRedshift(sliceData.z);
            const nearMilestone = MILESTONES.reduce<{ ms: typeof MILESTONES[0]; dist: number } | null>((best, ms) => {
              const dist = Math.abs(sliceData.z - ms.z) / Math.max(ms.z, 1);
              if (!best || dist < best.dist) return { ms, dist };
              return best;
            }, null);
            const useColor = nearMilestone && nearMilestone.dist < 0.3 ? nearMilestone.ms.color : "#cbd5e1";
            return (
              <div style={{
                marginTop: "6px",
                padding: "6px 8px",
                background: "rgba(15,23,42,0.6)",
                borderRadius: "4px",
                borderLeft: `3px solid ${useColor}`,
                fontSize: "13px",
                fontWeight: 600,
                color: useColor,
                lineHeight: "1.3",
                transition: "all 0.3s ease",
              }}>
                {desc}
              </div>
            );
          })()}
        </div>

        {/* ΛCDM parameters */}
        <div style={styles.paramSection}>
          <div style={styles.paramTitle}>{"\u039B"}CDM Parameters</div>
          <div style={styles.resultRow}>
            <span>Age</span>
            <span>{ageNow.toFixed(2)} Gyr</span>
          </div>
          <div style={styles.resultRow}>
            <span>H{"\u2080"}</span>
            <span>67.4 km/s/Mpc</span>
          </div>
          <div style={styles.resultRow}>
            <span>{"\u03A9"}{"\u2098"}</span>
            <span>0.315</span>
          </div>
          <div style={styles.resultRow}>
            <span>{"\u03A9"}{"\u039B"}</span>
            <span>0.685</span>
          </div>
        </div>

        {/* View toggles */}
        <div style={styles.toggleSection}>
          <label style={styles.toggleLabel}>
            <input type="checkbox" checked={showHubble} onChange={(e) => setShowHubble(e.target.checked)} />
            <span>Hubble Sphere</span>
            <span
              title="The Hubble sphere is where the recession velocity equals the speed of light. Beyond it, space expands faster than c."
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "14px",
                height: "14px",
                borderRadius: "50%",
                border: "1px solid #475569",
                fontSize: "9px",
                color: "#64748b",
                cursor: "help",
                marginLeft: "2px",
                flexShrink: 0,
              }}
            >?</span>
          </label>
          <label style={styles.toggleLabel}>
            <input type="checkbox" checked={showParticles} onChange={(e) => setShowParticles(e.target.checked)} />
            <span>Particle Field</span>
          </label>
          <label style={styles.toggleLabel}>
            <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
            <span>Milestone Labels</span>
          </label>
        </div>

        {/* Milestones table */}
        <div style={styles.tableSection}>
          <div style={styles.paramTitle}>Redshift Milestones</div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>z</th>
                <th style={styles.th}>a</th>
                <th style={styles.th}>Lookback</th>
                <th style={styles.th}>d(Gly)</th>
              </tr>
            </thead>
            <tbody>
              {milestones.map((m) => (
                <tr key={m.z} onClick={() => setEpochAge(m.age)} style={{ cursor: "pointer" }}
                  title={`Jump to z=${m.z} (${m.age.toFixed(2)} Gyr)`}>
                  <td style={styles.td}>{m.z}</td>
                  <td style={styles.tdMono}>{m.a}</td>
                  <td style={styles.tdMono}>{m.lookback.toFixed(1)}</td>
                  <td style={styles.tdMono}>{m.comoving.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* FLRW metric */}
        <div style={styles.flrwCard}>
          <div style={styles.flrwTitle}>FLRW Metric</div>
          <div style={styles.flrwEq}>
            ds{"\u00B2"} = -c{"\u00B2"}dt{"\u00B2"} + a(t){"\u00B2"}[dr{"\u00B2"} + r{"\u00B2"}d{"\u03A9"}{"\u00B2"}]
          </div>
          <div style={styles.flrwDetail}>
            {"\u0394"}t_obs = (1+z) {"\u00D7"} {"\u0394"}t_emit | H(z) = H{"\u2080"}{"\u221A"}({"\u03A9"}_m(1+z){"\u00B3"} + {"\u03A9"}_{"\u039B"})
          </div>
        </div>

        {/* Round 6 — Light cone color legend */}
        <div style={styles.flrwCard}>
          <div style={styles.flrwTitle}>Light Cone Colors</div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", justifyContent: "center", marginTop: "6px" }}>
            <span style={{ fontSize: "10px", color: "#ef4444", whiteSpace: "nowrap" }}>CMB (z=1100)</span>
            <svg width="120" height="16" style={{ flexShrink: 0 }}>
              <defs>
                <linearGradient id="cone-legend-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#ef4444" />
                  <stop offset="30%" stopColor="#f97316" />
                  <stop offset="60%" stopColor="#34d399" />
                  <stop offset="100%" stopColor="#60a5fa" />
                </linearGradient>
              </defs>
              <rect x="0" y="3" width="120" height="10" rx="3" fill="url(#cone-legend-grad)" opacity="0.85" />
            </svg>
            <span style={{ fontSize: "10px", color: "#60a5fa", whiteSpace: "nowrap" }}>Present (z=0)</span>
          </div>
        </div>

        {/* Round 10 — Age/distance conversion helper */}
        <div style={styles.flrwCard}>
          <div style={styles.flrwTitle}>Unit Conversions</div>
          <div style={{ fontSize: "10px", color: "#94a3b8", lineHeight: "1.6", marginTop: "4px" }}>
            <div>1 Gly = 1 billion light-years = 9.46 {"\u00D7"} 10{"\u00B2\u2074"} m</div>
            <div>1 Gyr = 1 billion years = 3.156 {"\u00D7"} 10{"\u00B9\u2076"} s</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 3D Scene ──────────────────────────────────────────────────────────────

function CosmicScene({
  epochAge,
  sliceZ,
  showHubble,
  showParticles,
  showLabels,
}: {
  epochAge: number;
  sliceZ: number;
  showHubble: boolean;
  showParticles: boolean;
  showLabels: boolean;
}) {
  return (
    <group>
      <LightConeSurface />
      <MilestoneRings showLabels={showLabels} epochAge={epochAge} />
      <CosmicTimeAxis />
      <EpochSlicePlane epochAge={epochAge} sliceZ={sliceZ} />
      {showParticles && <ParticleField />}
      {showHubble && <HubbleSphere />}
      <ObserverMarker />
      {/* Round 8 — Observable Universe Edge label at z=1100 */}
      {showLabels && <ObservableUniverseLabel />}
    </group>
  );
}

// ─── Light cone surface ────────────────────────────────────────────────────

function LightConeSurface() {
  const geometry = useMemo(() => {
    const N_Z = 200;
    const N_THETA = 64;

    // Sample redshifts logarithmically: z from 0 to 1100
    const zSamples: number[] = [0];
    for (let i = 1; i <= N_Z; i++) {
      const z = Math.pow(10, (i / N_Z) * 3.04) - 1;
      zSamples.push(z);
    }

    // Compute ring positions from engine
    const rings = zSamples.map((z) => ({
      y: cosmicTimeToY(engine.ageAtRedshiftGyr(z)),
      r: comovingToSceneR(engine.comovingDistanceGly(z)),
    }));

    const vCount = (N_Z + 1) * (N_THETA + 1);
    const positions = new Float32Array(vCount * 3);

    for (let i = 0; i <= N_Z; i++) {
      for (let j = 0; j <= N_THETA; j++) {
        const idx = (i * (N_THETA + 1) + j) * 3;
        const angle = (j / N_THETA) * Math.PI * 2;
        positions[idx] = rings[i].r * Math.cos(angle);
        positions[idx + 1] = rings[i].y;
        positions[idx + 2] = rings[i].r * Math.sin(angle);
      }
    }

    const indices: number[] = [];
    for (let i = 0; i < N_Z; i++) {
      for (let j = 0; j < N_THETA; j++) {
        const a = i * (N_THETA + 1) + j;
        const b = a + N_THETA + 1;
        indices.push(a, b, a + 1);
        indices.push(a + 1, b, b + 1);
      }
    }

    // Vertex colors: red (CMB/z~1100) → orange → cyan (present/z=0)
    const colors = new Float32Array(vCount * 3);
    for (let i = 0; i <= N_Z; i++) {
      const t = i / N_Z; // 0=present, 1=CMB
      // Color ramp: cyan(0) → green(0.3) → orange(0.7) → red(1.0)
      let r, g, b;
      if (t < 0.3) {
        const f = t / 0.3;
        r = 0.2 + f * 0.2; g = 0.6 + f * 0.2; b = 0.9 - f * 0.5;
      } else if (t < 0.7) {
        const f = (t - 0.3) / 0.4;
        r = 0.4 + f * 0.5; g = 0.8 - f * 0.3; b = 0.4 - f * 0.3;
      } else {
        const f = (t - 0.7) / 0.3;
        r = 0.9 + f * 0.1; g = 0.5 - f * 0.3; b = 0.1 - f * 0.05;
      }
      for (let j = 0; j <= N_THETA; j++) {
        const idx = (i * (N_THETA + 1) + j) * 3;
        colors[idx] = r; colors[idx + 1] = g; colors[idx + 2] = b;
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  }, []);

  return (
    <group>
      {/* Translucent surface with redshift color gradient */}
      <mesh geometry={geometry}>
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={0.15}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Wireframe overlay */}
      <lineSegments>
        <wireframeGeometry args={[geometry]} />
        <lineBasicMaterial color="#60a5fa" transparent opacity={0.1} />
      </lineSegments>
    </group>
  );
}

// ─── Milestone rings ───────────────────────────────────────────────────────

function MilestoneRings({ showLabels, epochAge }: { showLabels: boolean; epochAge: number }) {
  const rings = useMemo(
    () =>
      MILESTONES.map((m) => {
        const age = engine.ageAtRedshiftGyr(m.z);
        const y = cosmicTimeToY(age);
        const cDist = engine.comovingDistanceGly(m.z);
        const r = comovingToSceneR(cDist);
        return { ...m, y, r, age };
      }),
    []
  );

  return (
    <group>
      {rings.map((m) => {
        // Glow when epoch slider is near this milestone
        const proximity = Math.max(0, 1 - Math.abs(epochAge - m.age) / 1.5);
        const ringWidth = 0.08 + proximity * 0.06;
        const ringOpacity = 0.6 + proximity * 0.5;
        return (
        <group key={m.z}>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, m.y, 0]}>
            <ringGeometry args={[Math.max(m.r - ringWidth, 0), m.r + ringWidth, 128]} />
            <meshBasicMaterial
              color={m.color}
              transparent
              opacity={ringOpacity}
              side={THREE.DoubleSide}
            />
          </mesh>
          {showLabels && m.r > 0.1 && (
            <Html
              position={[m.r + 0.3, m.y, 0]}
              center
              style={{ pointerEvents: "none" }}
            >
              <div
                style={{
                  color: m.color,
                  fontSize: "10px",
                  fontFamily: "'JetBrains Mono', monospace",
                  background: "rgba(1,1,8,0.85)",
                  padding: "2px 6px",
                  borderRadius: "3px",
                  whiteSpace: "nowrap",
                  border: `1px solid ${m.color}30`,
                }}
              >
                {m.label} (z={m.z})
              </div>
            </Html>
          )}
          {/* Present day label at center */}
          {showLabels && m.z === 0 && (
            <Html
              position={[0.6, m.y, 0]}
              center
              style={{ pointerEvents: "none" }}
            >
              <div
                style={{
                  color: m.color,
                  fontSize: "10px",
                  fontFamily: "'JetBrains Mono', monospace",
                  background: "rgba(1,1,8,0.85)",
                  padding: "2px 6px",
                  borderRadius: "3px",
                  whiteSpace: "nowrap",
                  border: `1px solid ${m.color}30`,
                }}
              >
                Present Day (z=0)
              </div>
            </Html>
          )}
        </group>
        );
      })}
    </group>
  );
}

// ─── Time axis ─────────────────────────────────────────────────────────────

function CosmicTimeAxis() {
  const ticks = useMemo(() => {
    const t = [
      { age: 0, label: "Big Bang" },
      { age: 1, label: "1 Gyr" },
      { age: 5, label: "5 Gyr" },
      { age: 9.2, label: "9.2 Gyr" },
      { age: 13.8, label: "Now" },
    ];
    return t.map((tick) => ({
      ...tick,
      y: cosmicTimeToY(tick.age),
    }));
  }, []);

  return (
    <group position={[-0.5, 0, 0]}>
      {/* Vertical axis line */}
      <group position={[0, SCENE_HEIGHT / 2, 0]}>
        <mesh>
          <cylinderGeometry args={[0.015, 0.015, SCENE_HEIGHT, 8]} />
          <meshBasicMaterial color="#334155" />
        </mesh>
      </group>
      {/* Tick marks */}
      {ticks.map((tick) => (
        <group key={tick.age} position={[0, tick.y, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.01, 0.01, 0.15, 4]} />
            <meshBasicMaterial color="#475569" />
          </mesh>
          <Html
            position={[-0.5, 0, 0]}
            center
            style={{ pointerEvents: "none" }}
          >
            <div
              style={{
                color: "#94a3b8",
                fontSize: "10px",
                fontFamily: "'JetBrains Mono', monospace",
                whiteSpace: "nowrap",
              }}
            >
              {tick.label}
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}

// ─── Epoch slice plane ─────────────────────────────────────────────────────

function EpochSlicePlane({ epochAge, sliceZ }: { epochAge: number; sliceZ: number }) {
  const sliceY = cosmicTimeToY(epochAge);
  const cDist = engine.comovingDistanceGly(sliceZ);
  const sliceR = comovingToSceneR(cDist);

  return (
    <group>
      {/* Translucent disc */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, sliceY, 0]}>
        <circleGeometry args={[Math.max(sliceR, 0.1), 64]} />
        <meshBasicMaterial
          color="#f59e0b"
          transparent
          opacity={0.08}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Edge ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, sliceY, 0]}>
        <ringGeometry args={[Math.max(sliceR - 0.03, 0), sliceR + 0.03, 128]} />
        <meshBasicMaterial
          color="#f59e0b"
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Label */}
      <Html
        position={[sliceR + 0.4, sliceY, 0]}
        center
        style={{ pointerEvents: "none" }}
      >
        <div
          style={{
            color: "#f59e0b",
            fontSize: "10px",
            fontFamily: "'JetBrains Mono', monospace",
            background: "rgba(1,1,8,0.9)",
            padding: "2px 8px",
            borderRadius: "3px",
            whiteSpace: "nowrap",
            border: "1px solid #f59e0b30",
          }}
        >
          {epochAge.toFixed(1)} Gyr | z={sliceZ < 100 ? sliceZ.toFixed(1) : sliceZ.toFixed(0)}
        </div>
      </Html>
    </group>
  );
}

// ─── Particle field ────────────────────────────────────────────────────────

function ParticleField() {
  const { positions, colors, sizes } = useMemo(() => {
    const N = 3000;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const sz = new Float32Array(N);

    // Simple hash for pseudo-noise clustering (filament/void structure)
    const hash = (x: number, y: number) => {
      const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      return h - Math.floor(h);
    };

    let placed = 0;
    let attempts = 0;
    while (placed < N && attempts < N * 5) {
      attempts++;
      const z = Math.max(Math.pow(10, Math.random() * 3.04) - 1, 0);
      const ageAtZ = engine.ageAtRedshiftGyr(z);
      const maxR = engine.comovingDistanceGly(z);
      const maxSceneR = comovingToSceneR(maxR);

      const r = Math.random() * maxSceneR * 0.9;
      const theta = Math.random() * Math.PI * 2;
      const x = r * Math.cos(theta);
      const zPos = r * Math.sin(theta);

      // Clustering: use noise to create filament probability
      // Higher noise value = filament (galaxy cluster), lower = void
      const nx = Math.floor(x * 2) * 0.5;
      const nz = Math.floor(zPos * 2) * 0.5;
      const noiseVal = hash(nx + ageAtZ * 0.3, nz + ageAtZ * 0.7);

      // Accept with probability proportional to noise — high noise = filament/cluster, low = void
      // noiseVal in [0,1], acceptance = noiseVal^0.5 (sqrt bias toward acceptance) + 0.15 base
      const acceptProb = Math.sqrt(noiseVal) * 0.7 + 0.15;
      if (Math.random() > acceptProb) continue;

      const y = cosmicTimeToY(ageAtZ);

      pos[placed * 3] = x;
      pos[placed * 3 + 1] = y;
      pos[placed * 3 + 2] = zPos;

      // Color: early universe red-orange → late universe blue-white
      const t = ageAtZ / AGE_NOW;
      const isCluster = noiseVal > 0.7;
      if (isCluster) {
        // Bright cluster nodes — white-yellow
        col[placed * 3] = 0.9 + t * 0.1;
        col[placed * 3 + 1] = 0.85 + t * 0.1;
        col[placed * 3 + 2] = 0.6 + t * 0.3;
        sz[placed] = 0.08 + noiseVal * 0.06;
      } else {
        // Filament particles — dimmer blue-purple
        col[placed * 3] = 0.3 + t * 0.35;
        col[placed * 3 + 1] = 0.25 + t * 0.35;
        col[placed * 3 + 2] = 0.6 + t * 0.2;
        sz[placed] = 0.03 + Math.random() * 0.03;
      }

      placed++;
    }

    return {
      positions: pos.slice(0, placed * 3),
      colors: col.slice(0, placed * 3),
      sizes: sz.slice(0, placed),
    };
  }, []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.06} vertexColors transparent opacity={0.7} sizeAttenuation />
    </points>
  );
}

// ─── Hubble sphere ─────────────────────────────────────────────────────────

function HubbleSphere() {
  const geometry = useMemo(() => {
    const N = 200;
    const profile: THREE.Vector2[] = [];

    for (let i = 0; i <= N; i++) {
      const z = Math.pow(10, (i / N) * 3.04) - 1;
      const age = engine.ageAtRedshiftGyr(Math.max(z, 0));
      const y = cosmicTimeToY(age);

      // Hubble sphere: d_H = c / H(z) in comoving coords: d_H_comoving = c / (a * H)
      const hSI = engine.hubbleParameterKmSMpc(Math.max(z, 0.001)) * 1000 / 3.0857e22; // km/s/Mpc → s⁻¹
      const C_M = 299792458;
      const SECS_PER_YR = 365.25 * 86400;
      const dComovingM = C_M / ((1 + Math.max(z, 0)) * hSI);
      const dComovingGly = dComovingM / (C_M * SECS_PER_YR * 1e9);
      const r = comovingToSceneR(dComovingGly);

      profile.push(new THREE.Vector2(r, y));
    }

    return new THREE.LatheGeometry(profile, 64);
  }, []);

  return (
    <group>
      <mesh geometry={geometry}>
        <meshBasicMaterial
          color="#06b6d4"
          transparent
          opacity={0.12}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Bright wireframe edge for visibility */}
      <lineSegments>
        <wireframeGeometry args={[geometry]} />
        <lineBasicMaterial color="#06b6d4" transparent opacity={0.15} />
      </lineSegments>
    </group>
  );
}

// ─── Observer marker ───────────────────────────────────────────────────────

function ObserverMarker() {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (ref.current) {
      const s = 1 + Math.sin(clock.getElapsedTime() * 2) * 0.15;
      ref.current.scale.setScalar(s);
    }
  });

  return (
    <group position={[0, SCENE_HEIGHT, 0]}>
      <mesh ref={ref}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshBasicMaterial color="#60a5fa" />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.35, 16, 16]} />
        <meshBasicMaterial color="#60a5fa" transparent opacity={0.15} />
      </mesh>
      <Html position={[0, 0.35, 0]} center style={{ pointerEvents: "none" }}>
        <div
          style={{
            color: "#60a5fa",
            fontSize: "10px",
            fontFamily: "'JetBrains Mono', monospace",
            background: "rgba(1,1,8,0.85)",
            padding: "2px 6px",
            borderRadius: "3px",
            whiteSpace: "nowrap",
            border: "1px solid #60a5fa30",
          }}
        >
          Observer (Here & Now)
        </div>
      </Html>
    </group>
  );
}

// ─── Observable Universe Edge label (Round 8) ─────────────────────────────

function ObservableUniverseLabel() {
  const { y, r } = useMemo(() => {
    const age = engine.ageAtRedshiftGyr(1100);
    const cDist = engine.comovingDistanceGly(1100);
    return { y: cosmicTimeToY(age), r: comovingToSceneR(cDist) };
  }, []);

  return (
    <Html
      position={[0, y - 0.3, 0]}
      center
      style={{ pointerEvents: "none" }}
    >
      <div
        style={{
          color: "#ef4444",
          fontSize: "10px",
          fontFamily: "'JetBrains Mono', monospace",
          background: "rgba(1,1,8,0.9)",
          padding: "3px 8px",
          borderRadius: "3px",
          whiteSpace: "nowrap",
          border: "1px solid #ef444430",
          textAlign: "center",
        }}
      >
        Observable Universe Edge ~46 Gly
      </div>
    </Html>
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
    width: "280px",
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
  sliderSection: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  sliderHeader: {
    display: "flex",
    justifyContent: "space-between",
  },
  sliderLabel: {
    fontSize: "11px",
    color: "#94a3b8",
    fontWeight: 600,
  },
  sliderValue: {
    fontSize: "12px",
    color: "#f59e0b",
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
  },
  sliderInput: {
    width: "100%",
    accentColor: "#f59e0b",
  },
  sliderTicks: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "10px",
    color: "#94a3b8",
  },
  results: {
    background: "#0f172a",
    borderRadius: "6px",
    padding: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  resultRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "11px",
    color: "#94a3b8",
    fontVariantNumeric: "tabular-nums",
  },
  paramSection: {
    background: "#0f172a",
    borderRadius: "6px",
    padding: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  paramTitle: {
    fontSize: "11px",
    color: "#64748b",
    letterSpacing: "0.5px",
    marginBottom: "2px",
    fontWeight: 600,
  },
  toggleSection: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  toggleLabel: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "11px",
    color: "#94a3b8",
    cursor: "pointer",
  },
  tableSection: {
    background: "#0f172a",
    borderRadius: "6px",
    padding: "8px",
    overflow: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "10px",
  },
  th: {
    textAlign: "left",
    padding: "3px 6px",
    borderBottom: "1px solid #1e293b",
    color: "#94a3b8",
    fontSize: "10px",
    letterSpacing: "0.5px",
    textTransform: "uppercase" as const,
  },
  td: {
    padding: "3px 6px",
    borderBottom: "1px solid #0f172a",
    color: "#e2e8f0",
  },
  tdMono: {
    padding: "3px 6px",
    borderBottom: "1px solid #0f172a",
    color: "#94a3b8",
    fontVariantNumeric: "tabular-nums",
  },
  flrwCard: {
    background: "#0f172a",
    borderRadius: "6px",
    padding: "10px",
    textAlign: "center",
  },
  flrwTitle: {
    fontSize: "10px",
    color: "#64748b",
    letterSpacing: "1.5px",
    textTransform: "uppercase" as const,
    marginBottom: "4px",
  },
  flrwEq: {
    fontSize: "13px",
    color: "#a78bfa",
    fontStyle: "italic",
    marginBottom: "4px",
  },
  flrwDetail: {
    fontSize: "10px",
    color: "#64748b",
  },
};
