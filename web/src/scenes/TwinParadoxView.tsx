import React, { useRef, useState, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, Stars as DreiStars, Line } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { engine } from "../engine/wasm-bridge";

const C = 299792458;

// ─── Presets ───────────────────────────────────────────────────────────────

type Scenario = "custom" | "gps" | "iss" | "proxima" | "galactic";

const PRESETS: Record<string, { speed: number; years: number; label: string; description: string }> = {
  custom: { speed: 0.5, years: 10, label: "Custom", description: "User-defined speed and duration" },
  gps: { speed: 3874 / C, years: 1, label: "GPS Satellite", description: "GPS requires +38.6 \u00B5s/day correction — without relativity, positioning drifts ~10 km/day" },
  iss: { speed: 7660 / C, years: 1, label: "ISS", description: "Low Earth orbit at 7,660 m/s — astronauts age slightly less" },
  proxima: { speed: 0.1, years: 84.6, label: "Proxima Centauri", description: "Round trip to nearest star at 10% c — 4.24 ly each way" },
  galactic: { speed: 0.99, years: 100, label: "Galactic Voyage", description: "Near-light-speed journey — extreme time dilation, traveler barely ages" },
};

// ─── Main component ────────────────────────────────────────────────────────

export function TwinParadoxView() {
  const [speed, setSpeed] = useState(0.5);
  const [durationYears, setDurationYears] = useState(10);
  const [scenario, setScenario] = useState<Scenario>("custom");

  const active = useMemo(() => {
    if (scenario === "custom") return { speed, years: durationYears };
    return PRESETS[scenario];
  }, [scenario, speed, durationYears]);

  const results = useMemo(() => {
    const v = active.speed * C;
    const coordTime = active.years * 365.25 * 86400;
    const beta2 = active.speed * active.speed;
    const gamma = 1 / Math.sqrt(1 - beta2);
    const travelProper = coordTime / gamma;
    let earthDilation = 1;
    try {
      const ed = engine.schwarzschildDilation(
        engine.constants.gmEarth(),
        engine.constants.rEarth()
      );
      if (!isNaN(ed)) earthDilation = ed;
    } catch (e) {
      // fallback to 1
    }
    const earthProper = earthDilation * coordTime;
    const diffSeconds = earthProper - travelProper;
    const diffYears = diffSeconds / (365.25 * 86400);
    const distanceLy = (active.speed * C * coordTime) / (C * 365.25 * 86400);
    const contractedLy = distanceLy / gamma;

    return {
      gamma: isNaN(gamma) ? 1 : gamma,
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
    <div style={styles.container} className="scene-layout" data-testid="twin-paradox-view">
      <div style={styles.canvasWrapper} className="scene-canvas">
        <Canvas
          camera={{ position: [0, 4, 14], fov: 50 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
          style={{ background: "#010108" }}
        >
          <color attach="background" args={["#010108"]} />
          <ambientLight intensity={0.05} />
          <TwinScene beta={active.speed} gamma={results.gamma} />
          <DreiStars radius={80} depth={60} count={7000} factor={3} saturation={0.1} fade speed={0.4} />
          <EffectComposer>
            <Bloom luminanceThreshold={0.15} luminanceSmoothing={0.9} intensity={1.3} mipmapBlur />
            <Vignette eskil={false} offset={0.15} darkness={0.75} />
          </EffectComposer>
          <OrbitControls enablePan maxDistance={30} minDistance={5} enableDamping dampingFactor={0.05} />
        </Canvas>
      </div>

      <div style={styles.panel} className="scene-panel" data-testid="twin-panel">
        <div style={styles.panelTitle}>Twin Paradox Calculator</div>
        <div style={styles.subtitle}>Differential aging for relativistic travel</div>

        {/* Scenario presets */}
        <div style={styles.presetRow}>
          {Object.entries(PRESETS).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => {
                setScenario(key as Scenario);
                if (key !== "custom") {
                  setSpeed(preset.speed);
                  setDurationYears(preset.years);
                }
              }}
              style={{
                ...styles.presetBtn,
                ...(scenario === key ? styles.presetBtnActive : {}),
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Round 10 — Scenario description */}
        {scenario !== "custom" && (
          <div style={{ fontSize: "10px", color: "#64748b", fontStyle: "italic", padding: "0 2px", marginTop: "-6px" }}>
            {PRESETS[scenario].description}
          </div>
        )}

        {/* Speed slider */}
        <div style={styles.sliderGroup}>
          <div style={styles.sliderHeader}>
            <span style={styles.sliderLabel}>
              Speed: {(active.speed * 100).toFixed(4)}% c
            </span>
            <span style={styles.sliderValue}>{results.speedKmS.toFixed(1)} km/s</span>
          </div>
          <input
            type="range" min={0.0001} max={0.9999} step={0.0001}
            value={active.speed}
            onChange={(e) => { setScenario("custom"); setSpeed(parseFloat(e.target.value)); }}
            style={styles.sliderInput}
          />
        </div>

        {/* Duration slider */}
        <div style={styles.sliderGroup}>
          <div style={styles.sliderHeader}>
            <span style={styles.sliderLabel}>Coordinate duration</span>
            <span style={styles.sliderValue}>{active.years.toFixed(1)} years</span>
          </div>
          <input
            type="range" min={0.1} max={1000} step={0.1}
            value={active.years}
            onChange={(e) => { setScenario("custom"); setDurationYears(parseFloat(e.target.value)); }}
            style={styles.sliderInput}
          />
        </div>

        {/* Gamma display */}
        <div style={{ textAlign: "center", fontSize: "20px", color: "#8b5cf6", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", padding: "4px 0" }}>
          {"\u03B3"} = {results.gamma < 100 ? results.gamma.toFixed(4) : results.gamma.toExponential(3)}
        </div>

        {/* Results */}
        <div style={styles.results}>
          <div style={{ ...styles.resultRow, color: "#8b5cf6" }}>
            <span>Lorentz {"\u03B3"}</span>
            <span>{results.gamma < 100 ? results.gamma.toFixed(4) : results.gamma.toExponential(3)}</span>
          </div>
          <div style={styles.resultRow}>
            <span>Earth twin ages</span>
            <span style={{ color: "#4a90d9" }}>{results.earthAgingYears.toFixed(4)} yr</span>
          </div>
          <div style={styles.resultRow}>
            <span>Traveler ages</span>
            <span style={{ color: "#f59e0b" }}>{results.travelerAgingYears.toFixed(4)} yr</span>
          </div>
          <div style={styles.resultRow}>
            <span>Differential</span>
            <span style={{ color: "#34d399" }}>{formatDiff(results.differenceSeconds)}</span>
          </div>
          <div style={styles.resultRow}>
            <span>Distance (coord)</span>
            <span>{results.distanceLy.toFixed(2)} ly</span>
          </div>
          <div style={styles.resultRow}>
            <span>Distance (traveler)</span>
            <span>{results.contractedLy.toFixed(2)} ly</span>
          </div>
        </div>

        {/* Timeline bars */}
        <div style={styles.timelineSection}>
          <div style={styles.timelineTitle}>Who Ages More?</div>
          <TimeBar label="Earth Twin" years={results.earthAgingYears} max={results.coordTimeYears} color="#4a90d9" />
          <TimeBar label="Traveler" years={results.travelerAgingYears} max={results.coordTimeYears} color="#f59e0b" />
        </div>

        {/* Formula */}
        <div style={styles.formulaCard}>
          <div style={styles.formulaTitle}>Formulas</div>
          <div style={styles.formulaText}>
            {"\u03B3"} = 1/{"\u221A"}(1 - v{"\u00B2"}/c{"\u00B2"}) | {"\u0394"}{"\u03C4"}_trav = {"\u0394"}t / {"\u03B3"} | L' = L / {"\u03B3"}
          </div>
        </div>

        {/* Why This Matters */}
        <div style={styles.infoCard}>
          The twin paradox is real — verified by flying atomic clocks on aircraft (Hafele-Keating, 1971) and by GPS satellite corrections every day. Astronaut Scott Kelly aged 5 milliseconds less than his twin Mark during 340 days on the ISS.
        </div>
      </div>
    </div>
  );
}

// ─── 3D Scene ──────────────────────────────────────────────────────────────

function TwinScene({ beta, gamma }: { beta: number; gamma: number }) {
  return (
    <group>
      <EarthTwin gamma={gamma} />
      <TravelerShip beta={beta} gamma={gamma} />
      <SpacetimeGrid beta={beta} />
      <StreakingStars beta={beta} />
      {/* Doppler legend */}
      <Html position={[12, 4, 0]} center style={{ pointerEvents: "none" }}>
        <div style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", background: "rgba(1,1,8,0.9)", padding: "4px 8px", borderRadius: "4px", whiteSpace: "nowrap", border: "1px solid #1e293b" }}>
          <span style={{ color: "#60a5fa" }}>{"\u2605"} Blue = approaching</span>
          <span style={{ color: "#475569", margin: "0 4px" }}>|</span>
          <span style={{ color: "#ef4444" }}>{"\u2605"} Red = receding</span>
        </div>
      </Html>
      {/* Round 5 — Reference cubes for Lorentz contraction comparison */}
      <ContractionCubes gamma={gamma} />
      {/* Round 7 — Speed of light indicator line */}
      <SpeedOfLightIndicator />
      {/* Round 9 — Distance ruler */}
      <DistanceRuler />
    </group>
  );
}

// Earth twin — small blue sphere with label
function EarthTwin({ gamma }: { gamma: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.getElapsedTime() * 0.2;
  });

  return (
    <group position={[-4, 0, 0]}>
      <mesh ref={ref}>
        <sphereGeometry args={[0.9, 32, 32]} />
        <meshStandardMaterial color="#4a90d9" roughness={0.7} metalness={0.1} emissive="#4a90d9" emissiveIntensity={0.25} />
      </mesh>
      {/* Atmosphere glow */}
      <mesh>
        <sphereGeometry args={[1.08, 32, 32]} />
        <meshBasicMaterial color="#60a5fa" transparent opacity={0.08} />
      </mesh>
      <Html position={[0, 1.1, 0]} center style={{ pointerEvents: "none" }}>
        <div style={labelStyle("#4a90d9")}>Earth Twin</div>
      </Html>
      {/* Clock display */}
      <Html position={[0, -1.0, 0]} center style={{ pointerEvents: "none" }}>
        <EarthClock />
      </Html>
      {/* Round 8 — Age display */}
      <Html position={[0, -1.6, 0]} center style={{ pointerEvents: "none" }}>
        <EarthAgeLabel />
      </Html>
    </group>
  );
}

// Earth clock ticking at normal rate
function EarthClock() {
  const ref = useRef<HTMLDivElement>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      const t = clock.getElapsedTime();
      const h = Math.floor(t / 3.6) % 24;
      const m = Math.floor(t / 0.6) % 60;
      const s = Math.floor(t * 10) % 60;
      ref.current.textContent = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
  });
  return <div ref={ref} style={clockStyle("#4a90d9")}>00:00:00</div>;
}

// Traveler ship — golden wedge with trail, oscillating along path
function TravelerShip({ beta, gamma }: { beta: number; gamma: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const trailRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      // Oscillate along X axis — period proportional to journey duration
      const t = clock.getElapsedTime();
      const journeyPeriod = Math.max(gamma > 1.01 ? 4 / gamma : 8, 2); // faster journeys = faster oscillation
      const amplitude = 3 + beta * 5;
      const phase = Math.sin(t * (Math.PI / journeyPeriod)) * amplitude;
      groupRef.current.position.x = 4 + phase;
    }
    if (trailRef.current) {
      (trailRef.current.material as THREE.MeshBasicMaterial).opacity = 0.15 + beta * 0.3;
    }
  });

  // Lorentz contraction: flatten along direction of motion (X axis)
  // Cone is rotated Z→X, so cone's Y axis becomes X in world space — scale Y for contraction
  const contractFactor = Math.max(1 / gamma, 0.05);

  return (
    <group ref={groupRef} position={[4, 0, 0]}>
      {/* Ship body — wedge shape, contracted along motion direction */}
      <mesh rotation={[0, 0, Math.PI / 2]} scale={[0.3, contractFactor * 0.5, 0.3]}>
        <coneGeometry args={[0.4, 1.2, 4]} />
        <meshBasicMaterial color="#ffd54f" />
      </mesh>
      {/* Engine glow */}
      <mesh position={[-0.4, 0, 0]}>
        <sphereGeometry args={[0.25 + beta * 0.2, 16, 16]} />
        <meshBasicMaterial color="#ff6f00" transparent opacity={0.7 + beta * 0.3} />
      </mesh>
      {/* Motion trail */}
      <mesh ref={trailRef as any} position={[-1.5, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.01, 0.08, 2.5, 8]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.2} />
      </mesh>
      <Html position={[0, 1.1, 0]} center style={{ pointerEvents: "none" }}>
        <div style={labelStyle("#f59e0b")}>
          <div>Traveler ({(beta * 100).toFixed(1)}% c)</div>
          <div style={{ fontSize: "10px", color: "#a78bfa" }}>{"\u03B3"} = {gamma < 100 ? gamma.toFixed(3) : gamma.toExponential(2)}</div>
        </div>
      </Html>
      {/* Dilated clock */}
      <Html position={[0, -1.0, 0]} center style={{ pointerEvents: "none" }}>
        <TravelerClock gamma={gamma} />
      </Html>
      {/* Round 8 — Age display */}
      <Html position={[0, -1.6, 0]} center style={{ pointerEvents: "none" }}>
        <TravelerAgeLabel gamma={gamma} />
      </Html>
    </group>
  );
}

// Traveler clock ticking slower by factor gamma
function TravelerClock({ gamma }: { gamma: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      const t = clock.getElapsedTime() / gamma; // time dilated
      const h = Math.floor(t / 3.6) % 24;
      const m = Math.floor(t / 0.6) % 60;
      const s = Math.floor(t * 10) % 60;
      ref.current.textContent = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
  });
  return <div ref={ref} style={clockStyle("#f59e0b")}>00:00:00</div>;
}

// Spacetime grid showing Lorentz contraction — contracts along X near traveler
function SpacetimeGrid({ beta }: { beta: number }) {
  const contractFactor = Math.sqrt(1 - beta * beta);

  // Pre-compute all line segment positions as flat arrays (no THREE.js object creation in render)
  const { positions, isContracted } = useMemo(() => {
    const segs: { p: number[]; c: boolean }[] = [];
    // Horizontal grid lines (unaffected)
    for (let z = -6; z <= 6; z += 2) {
      segs.push({ p: [-12, -2, z, 12, -2, z], c: false });
    }
    // Vertical grid lines — contracted by Lorentz factor
    for (let x = -12; x <= 12; x += 2) {
      const cx = x * contractFactor;
      segs.push({ p: [cx, -2, -6, cx, -2, 6], c: true });
    }
    return { positions: segs.map(s => s.p), isContracted: segs.map(s => s.c) };
  }, [contractFactor]);

  // Single geometry with all lines — no per-render allocation
  const geometry = useMemo(() => {
    const allPos: number[] = [];
    positions.forEach(p => allPos.push(...p));
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(allPos, 3));
    return geom;
  }, [positions]);

  return (
    <group>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial color="#3b82f6" transparent opacity={0.4} />
      </lineSegments>
      <Html position={[-12, -1.5, 0]} center style={{ pointerEvents: "none" }}>
        <div style={{ color: "#3b82f6", fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", background: "rgba(1,1,8,0.85)", padding: "2px 6px", borderRadius: "3px", whiteSpace: "nowrap" }}>
          Grid spacing contracted by 1/{"\u03B3"} = {contractFactor.toFixed(3)}
        </div>
      </Html>
    </group>
  );
}

// Stars that streak at relativistic speeds with Doppler color shift (Round 6)
function StreakingStars({ beta }: { beta: number }) {
  const { positions, velocities, colors } = useMemo(() => {
    const N = 300;
    const pos = new Float32Array(N * 3);
    const vel = new Float32Array(N);
    const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 12;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 20;
      vel[i] = 0.5 + Math.random() * 0.5;
      // Default white
      col[i * 3] = 0.63;
      col[i * 3 + 1] = 0.77;
      col[i * 3 + 2] = 1.0;
    }
    return { positions: pos, velocities: vel, colors: col };
  }, []);

  const pointsRef = useRef<THREE.Points>(null);

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    const posAttr = pointsRef.current.geometry.getAttribute("position") as THREE.BufferAttribute;
    const colAttr = pointsRef.current.geometry.getAttribute("color") as THREE.BufferAttribute;
    const streakSpeed = beta * 0.15;
    for (let i = 0; i < velocities.length; i++) {
      posAttr.array[i * 3] -= streakSpeed * velocities[i];
      if (posAttr.array[i * 3] < -15) posAttr.array[i * 3] = 15;
      // Round 6 — Doppler shift: stars moving toward viewer (negative x velocity) are blue, away are red
      const vx = -streakSpeed * velocities[i];
      if (beta > 0.05) {
        const shift = Math.min(Math.abs(vx) * 20, 1.0);
        if (vx < 0) {
          // Moving toward — blueshift
          colAttr.array[i * 3] = 0.4 - shift * 0.3;
          colAttr.array[i * 3 + 1] = 0.6 + shift * 0.2;
          colAttr.array[i * 3 + 2] = 1.0;
        } else {
          // Moving away — redshift
          colAttr.array[i * 3] = 1.0;
          colAttr.array[i * 3 + 1] = 0.5 - shift * 0.3;
          colAttr.array[i * 3 + 2] = 0.4 - shift * 0.3;
        }
      }
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  });

  const size = beta > 0.5 ? 0.06 : 0.04;

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial vertexColors size={size} transparent opacity={0.4 + beta * 0.4} sizeAttenuation />
    </points>
  );
}

// Round 5 — Reference cubes for Lorentz contraction comparison
function ContractionCubes({ gamma }: { gamma: number }) {
  const contractFactor = Math.max(1 / gamma, 0.05);
  return (
    <group>
      {/* Earth reference cube — fixed size */}
      <group position={[-4, -2.5, 0]}>
        <mesh>
          <boxGeometry args={[0.8, 0.8, 0.8]} />
          <meshBasicMaterial color="#4a90d9" wireframe />
        </mesh>
        <Html position={[0, -0.6, 0]} center style={{ pointerEvents: "none" }}>
          <div style={{ color: "#4a90d9", fontSize: "8px", fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap" }}>
            Rest frame
          </div>
        </Html>
      </group>
      {/* Traveler contracted cube — scaled along X by 1/gamma */}
      <group position={[4, -2.5, 0]}>
        <mesh scale={[contractFactor, 1, 1]}>
          <boxGeometry args={[0.8, 0.8, 0.8]} />
          <meshBasicMaterial color="#f59e0b" wireframe />
        </mesh>
        <Html position={[0, -0.6, 0]} center style={{ pointerEvents: "none" }}>
          <div style={{ color: "#f59e0b", fontSize: "8px", fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap" }}>
            Contracted (1/{"\u03B3"})
          </div>
        </Html>
      </group>
    </group>
  );
}

// Round 7 — Speed of light indicator line
function SpeedOfLightIndicator() {
  const points = useMemo(() => [
    new THREE.Vector3(10, -2, -6),
    new THREE.Vector3(10, -2, 6),
  ], []);
  const dashPoints = useMemo(() => {
    const segs: THREE.Vector3[][] = [];
    for (let z = -6; z <= 5; z += 1) {
      if (z % 2 === 0) {
        segs.push([
          new THREE.Vector3(10, -2, z),
          new THREE.Vector3(10, -2, z + 1),
        ]);
      }
    }
    return segs;
  }, []);

  return (
    <group>
      {dashPoints.map((seg, i) => (
        <Line key={i} points={seg} color="#ef4444" lineWidth={0.8} transparent opacity={0.5} />
      ))}
      <Html position={[10, -1.2, 0]} center style={{ pointerEvents: "none" }}>
        <div style={{ color: "#ef4444", fontSize: "9px", fontFamily: "'JetBrains Mono', monospace", background: "rgba(1,1,8,0.8)", padding: "1px 6px", borderRadius: "3px", whiteSpace: "nowrap", border: "1px solid #ef444430" }}>
          c (speed of light)
        </div>
      </Html>
    </group>
  );
}

// Round 8 — Earth age label (accumulates at normal rate)
function EarthAgeLabel() {
  const ref = useRef<HTMLDivElement>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      const t = clock.getElapsedTime();
      // Scale: 1 real second = 0.1 simulated years for readability
      const age = (t * 0.1).toFixed(2);
      ref.current.textContent = `Age: ${age} yr`;
    }
  });
  return (
    <div ref={ref} style={{
      color: "#4a90d9",
      fontSize: "9px",
      fontFamily: "'JetBrains Mono', monospace",
      background: "rgba(1,1,8,0.85)",
      padding: "1px 6px",
      borderRadius: "3px",
      whiteSpace: "nowrap",
      fontVariantNumeric: "tabular-nums",
    }}>
      Age: 0.00 yr
    </div>
  );
}

// Round 8 — Traveler age label (accumulates slower by gamma)
function TravelerAgeLabel({ gamma }: { gamma: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      const t = clock.getElapsedTime();
      const age = (t * 0.1 / gamma).toFixed(2);
      ref.current.textContent = `Age: ${age} yr`;
    }
  });
  return (
    <div ref={ref} style={{
      color: "#f59e0b",
      fontSize: "9px",
      fontFamily: "'JetBrains Mono', monospace",
      background: "rgba(1,1,8,0.85)",
      padding: "1px 6px",
      borderRadius: "3px",
      whiteSpace: "nowrap",
      fontVariantNumeric: "tabular-nums",
    }}>
      Age: 0.00 yr
    </div>
  );
}

// Round 9 — Distance ruler with markers at 0, 5, 10 light-years
function DistanceRuler() {
  const rulerY = -3;
  const markers = [0, 5, 10];
  const rulerPoints = useMemo(() => [
    new THREE.Vector3(-12, rulerY, 7),
    new THREE.Vector3(12, rulerY, 7),
  ], []);

  return (
    <group>
      <Line points={rulerPoints} color="#475569" lineWidth={1} transparent opacity={0.5} />
      {markers.map((ly) => {
        const x = -12 + (ly / 10) * 24;
        return (
          <group key={ly}>
            <Line
              points={[new THREE.Vector3(x, rulerY - 0.2, 7), new THREE.Vector3(x, rulerY + 0.2, 7)]}
              color="#475569"
              lineWidth={1}
              transparent
              opacity={0.5}
            />
            <Html position={[x, rulerY - 0.5, 7]} center style={{ pointerEvents: "none" }}>
              <div style={{ color: "#64748b", fontSize: "8px", fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap" }}>
                {ly} ly
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatDiff(s: number): string {
  const abs = Math.abs(s);
  if (abs < 1e-3) return `${(abs * 1e6).toFixed(2)} \xB5s`;
  if (abs < 1) return `${(abs * 1e3).toFixed(2)} ms`;
  if (abs < 60) return `${abs.toFixed(3)} s`;
  if (abs < 3600) return `${(abs / 60).toFixed(1)} min`;
  if (abs < 86400) return `${(abs / 3600).toFixed(1)} hr`;
  if (abs < 86400 * 365.25) return `${(abs / 86400).toFixed(1)} days`;
  return `${(abs / (86400 * 365.25)).toFixed(1)} years`;
}

function TimeBar({ label, years, max, color }: { label: string; years: number; max: number; color: string }) {
  const pct = Math.min((years / max) * 100, 100);
  return (
    <div style={styles.timelineRow}>
      <div style={styles.timelineLabel}>{label}</div>
      <div style={styles.timelineBar}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "3px", transition: "width 0.3s" }} />
      </div>
      <div style={styles.timelineValue}>{years.toFixed(2)} yr</div>
    </div>
  );
}

const labelStyle = (color: string): React.CSSProperties => ({
  color,
  fontSize: "10px",
  fontFamily: "'JetBrains Mono', monospace",
  background: "rgba(1,1,8,0.85)",
  padding: "2px 8px",
  borderRadius: "3px",
  whiteSpace: "nowrap",
  border: `1px solid ${color}30`,
});

const clockStyle = (color: string): React.CSSProperties => ({
  color,
  fontSize: "13px",
  fontWeight: 700,
  fontFamily: "'JetBrains Mono', monospace",
  background: "rgba(1,1,8,0.9)",
  padding: "3px 10px",
  borderRadius: "4px",
  border: `1px solid ${color}40`,
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "1px",
});

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
  subtitle: {
    fontSize: "10px",
    color: "#64748b",
    marginTop: "-6px",
  },
  presetRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "4px",
  },
  presetBtn: {
    padding: "4px 8px",
    border: "1px solid #1e293b",
    borderRadius: "4px",
    background: "transparent",
    color: "#94a3b8",
    cursor: "pointer",
    fontSize: "10px",
    fontFamily: "inherit",
  },
  presetBtnActive: {
    background: "#1e293b",
    color: "#e2e8f0",
    borderColor: "#3b82f6",
  },
  sliderGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  sliderHeader: {
    display: "flex",
    justifyContent: "space-between",
  },
  sliderLabel: {
    fontSize: "10px",
    color: "#94a3b8",
  },
  sliderValue: {
    fontSize: "10px",
    color: "#f59e0b",
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
  },
  sliderInput: {
    width: "100%",
    accentColor: "#3b82f6",
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
  timelineSection: {
    background: "#0f172a",
    borderRadius: "6px",
    padding: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  timelineTitle: {
    fontSize: "11px",
    color: "#64748b",
    fontWeight: 600,
    marginBottom: "2px",
  },
  timelineRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  timelineLabel: {
    width: "65px",
    fontSize: "10px",
    color: "#94a3b8",
    textAlign: "right",
  },
  timelineBar: {
    flex: 1,
    height: "10px",
    background: "#1e293b",
    borderRadius: "3px",
    overflow: "hidden",
  },
  timelineValue: {
    width: "55px",
    fontSize: "10px",
    color: "#e2e8f0",
    fontVariantNumeric: "tabular-nums",
  },
  formulaCard: {
    background: "#0f172a",
    borderRadius: "6px",
    padding: "8px",
    textAlign: "center",
  },
  formulaTitle: {
    fontSize: "10px",
    color: "#94a3b8",
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
    marginBottom: "3px",
  },
  formulaText: {
    fontSize: "11px",
    color: "#a78bfa",
    fontStyle: "italic",
  },
  infoCard: {
    background: "#0f172a",
    borderRadius: "6px",
    padding: "10px",
    fontSize: "10px",
    color: "#94a3b8",
    lineHeight: "1.5",
    borderLeft: "3px solid #3b82f6",
  },
};
