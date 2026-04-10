import React, { useRef, useMemo, useState, useCallback, useEffect } from "react";
import { Canvas, useFrame, useLoader, useThree, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Line, Html, Stars as DreiStars } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { engine } from "../engine/wasm-bridge";

// ─── Data ───────────────────────────────────────────────────────────────────

// [name, semiMajorAxis_AU, orbitalPeriod_yr, radius_km, color, hasRings, inclination_deg, texture]
const PLANETS: [string, number, number, number, string, boolean, number, string][] = [
  ["Mercury", 0.387, 0.241, 2440, "#8c8c8c", false, 7.0, "mercury.jpg"],
  ["Venus", 0.723, 0.615, 6052, "#e8c87a", false, 3.39, "venus.jpg"],
  ["Earth", 1.0, 1.0, 6371, "#4a90d9", false, 0.0, "earth.jpg"],
  ["Mars", 1.524, 1.881, 3390, "#c1440e", false, 1.85, "mars.jpg"],
  ["Jupiter", 5.203, 11.86, 69911, "#c88b3a", false, 1.31, "jupiter.jpg"],
  ["Saturn", 9.537, 29.46, 58232, "#d4b87a", true, 2.49, "saturn.jpg"],
  ["Uranus", 19.19, 84.01, 25362, "#73d4e0", false, 0.77, "venus.jpg"],
  ["Neptune", 30.07, 164.8, 24622, "#3b5fc0", false, 1.77, "jupiter.jpg"],
  ["Pluto", 39.48, 247.9, 1188, "#c8b898", false, 17.16, "mercury.jpg"],
];

// Major moons: [name, parentPlanet, orbitalRadius_km, radius_km, color, inclination_deg]
// Inclination sources: Wikipedia/NASA NSSDCA (to parent equator except Moon/Callisto to ecliptic)
const MOONS: [string, string, number, number, string, number][] = [
  ["Moon", "Earth", 384400, 1737, "#c0c0c0", 5.15],
  ["Phobos", "Mars", 9376, 11, "#8a7d6b", 1.09],
  ["Deimos", "Mars", 23460, 6, "#8a7d6b", 0.93],
  ["Io", "Jupiter", 421700, 1822, "#c8a432", 0.05],
  ["Europa", "Jupiter", 671100, 1561, "#b8a888", 0.47],
  ["Ganymede", "Jupiter", 1070400, 2634, "#888078", 0.20],
  ["Callisto", "Jupiter", 1882700, 2410, "#555048", 2.02],
  ["Titan", "Saturn", 1221870, 2575, "#d4a030", 0.35],
  ["Enceladus", "Saturn", 238020, 252, "#f0f0f0", 0.009],
  ["Rhea", "Saturn", 527040, 764, "#c0b8a8", 0.35],
  ["Miranda", "Uranus", 129900, 236, "#b0a898", 4.34],
  ["Ariel", "Uranus", 190900, 579, "#c8c0b8", 0.04],
  ["Triton", "Neptune", 354759, 1353, "#c0d0d8", 156.87],
  ["Charon", "Pluto", 19591, 606, "#a89888", 0.0],
];

const BASE = import.meta.env.BASE_URL;
const AU = 10;
// Sqrt scaling: preserves size ordering while keeping everything visible
// Real sizes would make inner planets invisible — sqrt compresses the range
const SQRT_SCALE = 0.003;
const MIN_R = 0.1;
const SUN_R = Math.sqrt(696000) * SQRT_SCALE; // ~2.5 scene units
const TIME_SPEED = 0.5;
const MIN_MOON_R = 0.03;
const MIN_MOON_ORBIT = 0.3;

interface PData {
  name: string; au: number; period: number; rKm: number;
  color: string; rings: boolean; incl: number; texture: string;
  df: number; lost: number;
}

// ─── Grid overlay shader ───────────────────────────────────────────────────

const gridVertexShader = `
  varying vec2 vUv;
  void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
`;
const gridFragmentShader = `
  uniform float uTimeZones;
  uniform vec3 uGridColor;
  varying vec2 vUv;
  void main(){
    float lon=vUv.x*6.28318;
    float lat=(vUv.y-0.5)*3.14159;

    // Longitude lines (time zone boundaries) — thick and bright
    float tzInt=6.28318/uTimeZones;
    float lonLine=1.0-smoothstep(0.003,0.02,abs(mod(lon+tzInt*0.5,tzInt)-tzInt*0.5));

    // Latitude lines every 30° — visible reference
    float latInt=3.14159/6.0;
    float latLine=1.0-smoothstep(0.003,0.015,abs(mod(lat+latInt*0.5,latInt)-latInt*0.5));

    // Equator — thickest line
    float equator=1.0-smoothstep(0.005,0.025,abs(lat));

    // Tropics of Cancer/Capricorn (23.5°)
    float tropicLat=23.5*3.14159/180.0;
    float tropic=1.0-smoothstep(0.004,0.015,abs(abs(lat)-tropicLat));

    // Prime meridian — slightly brighter
    float primeMeridian=1.0-smoothstep(0.004,0.02,abs(mod(lon+3.14159,6.28318)-3.14159));

    float grid=max(max(max(lonLine*0.7,latLine*0.5),max(equator*1.0,tropic*0.4)),primeMeridian*0.5);
    gl_FragColor=vec4(uGridColor, grid);
  }
`;

// ─── Root ───────────────────────────────────────────────────────────────────

export function SolarSystemView() {
  const [selected, setSelected] = useState("Earth");
  const [selectedMoon, setSelectedMoon] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [showMoons, setShowMoons] = useState(true);
  const [showOrbits, setShowOrbits] = useState(true);
  const [focused, setFocused] = useState(false);
  const [timeSpeed, setTimeSpeed] = useState(0.5);
  const [paused, setPaused] = useState(false);
  const [detailView, setDetailView] = useState<string | null>(null); // null = system overview, planet name = detail
  const [showControls, setShowControls] = useState(true);
  const planetPositions = useRef<Record<string, THREE.Vector3>>({});

  // Escape key unfocuses
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFocused(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const planets: PData[] = useMemo(() => {
    try {
      const dd = engine.getSolarSystemDilation();
      return PLANETS.map(([n, a, p, r, c, rings, incl, tex]) => {
        const d = dd.find((x) => x.name === n);
        return { name: n, au: a, period: p, rKm: r, color: c, rings, incl, texture: tex, df: d?.dilation_factor ?? 1, lost: d?.seconds_lost_per_year ?? 0 };
      });
    } catch (e) {
      return PLANETS.map(([n, a, p, r, c, rings, incl, tex]) => ({
        name: n, au: a, period: p, rKm: r, color: c, rings, incl, texture: tex, df: 1, lost: 0,
      }));
    }
  }, []);

  const sunD = useMemo(() => {
    try {
      return engine.getSolarSystemDilation().find((b) => b.name === "Sun") ?? null;
    } catch (e) {
      return null;
    }
  }, []);
  const selP = planets.find((p) => p.name === selected);
  const refDf = selP?.df ?? (selected === "Sun" ? sunD?.dilation_factor ?? 1 : 1);

  return (
    <div style={S.container} className="scene-layout">
      <div style={S.canvas} className="scene-canvas">
        <Canvas camera={{ position: [0, 15, 30], fov: 55 }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }} style={{ background: "#020208" }}>
          <color attach="background" args={["#020208"]} />
          <ambientLight intensity={0.1} />

          <Sun selected={selected === "Sun"} onClick={() => { setSelected("Sun"); setFocused(true); }} onHover={setHovered} />

          {planets.map((p) => (
            <Planet key={p.name} d={p} selected={selected === p.name} hovered={hovered === p.name} refDf={refDf} showGrid={showGrid} showMoons={showMoons} timeSpeed={paused ? 0 : timeSpeed} planetPositions={planetPositions} onClick={() => { setSelected(p.name); setSelectedMoon(null); setFocused(true); }} onHover={setHovered} onSelectMoon={setSelectedMoon} />
          ))}

          {showOrbits && planets.map((p) => (
            <OrbitRing key={`o-${p.name}`} r={p.au * AU} incl={p.incl} active={selected === p.name} hovered={hovered === p.name} />
          ))}

          {/* Round 8 — Orbit trails for all planets */}
          {planets.map((p) => (
            <OrbitTrail key={`trail-${p.name}`} planet={p} timeSpeed={paused ? 0 : timeSpeed} planetPositions={planetPositions} trailOpacity={selected === p.name ? 1.0 : 0.15} />
          ))}

          <AsteroidBelt />
          <KuiperBelt />

          {/* Round 10 — Habitable zone indicator */}
          {showOrbits && <HabitableZone />}

          {/* Scale/disclaimer info moved to panel — removed from 3D scene to avoid floating text */}

          <DreiStars radius={200} depth={150} count={8000} factor={4} saturation={0.1} fade speed={0.5} />

          <EffectComposer>
            <Bloom luminanceThreshold={0.15} luminanceSmoothing={0.9} intensity={1.5} mipmapBlur />
            <Vignette eskil={false} offset={0.2} darkness={0.7} />
          </EffectComposer>

          <OrbitControls enablePan enableZoom enableRotate maxDistance={500} minDistance={0.5} enableDamping dampingFactor={0.05} />
        </Canvas>
      </div>

      <div style={S.panel} className="scene-panel" data-testid="solar-system-panel">
        {/* Sub-navigation: System Overview + Planet Detail tabs */}
        <div style={S.subNav}>
          <button onClick={() => { setDetailView(null); setSelectedMoon(null); }}
            style={{ ...S.subTab, ...(detailView === null ? S.subTabActive : {}) }}>
            System
          </button>
          {["Sun", ...planets.map((p) => p.name)].map((n) => (
            <button key={n}
              onClick={() => { setDetailView(n); setSelected(n); setSelectedMoon(null); }}
              style={{ ...S.subTab, ...(detailView === n ? S.subTabActive : {}), color: PLANETS.find(([pn]) => pn === n)?.[4] || "#ffd54f" }}>
              {n.slice(0, 3)}
            </button>
          ))}
        </div>

        {/* System overview mode */}
        {detailView === null && (
          <>
            <div style={S.panelHdr}>Solar System Overview</div>
            <div style={S.btns}>
              {["Sun", ...planets.map((p) => p.name)].map((n) => (
                <button key={n}
                  onClick={() => { setSelected(n); setDetailView(n); }}
                  onMouseEnter={() => setHovered(n)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ ...S.btn, ...(selected === n ? S.btnA : {}) }}>{n}</button>
              ))}
            </div>
          </>
        )}

        {/* Planet detail mode */}
        {detailView !== null && (
          <div style={S.panelHdr}>{detailView} {detailView === "Pluto" ? "(Dwarf Planet)" : ""}</div>
        )}

        {/* Prompt when detail view is set but nothing selected yet */}
        {detailView !== null && !selP && selected !== "Sun" && (
          <div style={{ fontSize: "11px", color: "#94a3b8", fontStyle: "italic", padding: "6px 8px" }}>
            Click a planet to see gravity and time dilation details.
          </div>
        )}

        <div style={S.info}>
          <div style={S.infoName}>{detailView || selected}</div>
          {selected === "Sun" ? (
            <div style={S.infoD}>
              <Row l="d\u03C4/dt" v={sunD ? `1 - ${(1 - sunD.dilation_factor).toExponential(3)}` : "\u2014"} />
              <Row l="Lost/year" v={sunD ? `${sunD.seconds_lost_per_year.toFixed(1)} s` : "\u2014"} />
            </div>
          ) : selP ? (
            <div style={S.infoD}>
              <Row l="d\u03C4/dt" v={`1 - ${(1 - selP.df).toExponential(3)}`} />
              <Row l="Lost/year" v={fmt(selP.lost)} />
              <Row l="Diameter" v={`${(selP.rKm * 2).toLocaleString()} km`} />
              <Row l="Distance" v={`${selP.au.toFixed(3)} AU (${(selP.au * 149.6).toFixed(0)}M km)`} />
              <Row l="Orbit" v={`${selP.period.toFixed(2)} yr`} />
              <Row l="Inclination" v={`${selP.incl.toFixed(2)}\u00B0`} />
              <Row l="Time zones" v={getTimeZoneCount(selP.name).toString()} />
              {MOONS.filter((m) => m[1] === selP.name).length > 0 && (
                <Row l="Moons" v={MOONS.filter((m) => m[1] === selP.name).map((m) => m[0]).join(", ")} />
              )}
              {/* Relativity note — distinct sub-card */}
              <div style={{ background: "#0f172a", borderLeft: "3px solid #a78bfa", padding: "6px 8px", borderRadius: "4px", marginTop: "6px" }}>
                <div style={{ fontSize: "10px", color: "#a78bfa", fontStyle: "italic", lineHeight: "1.4" }}>
                  {getRelativityNote(selP.name)}
                </div>
              </div>
              {/* Round 9 — Dwarf planet label for Pluto */}
              {selP.name === "Pluto" && (
                <>
                  <Row l="Classification" v="Dwarf planet" />
                  <div style={{ fontSize: "9px", color: "#64748b", marginTop: "4px", lineHeight: "1.4" }}>
                    Reclassified by the IAU in 2006 due to not clearing its orbital neighborhood (Kuiper belt).
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>

        {/* Moon buttons when in detail view */}
        {detailView && (() => {
          const planetMoons = MOONS.filter(([, parent]) => parent === detailView);
          if (planetMoons.length === 0) return null;
          return (
            <div style={S.moonSection}>
              <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600, marginBottom: "4px" }}>Moons ({planetMoons.length})</div>
              <div style={S.btns}>
                {planetMoons.map(([mName]) => (
                  <button key={mName} onClick={() => setSelectedMoon(selectedMoon === mName ? null : mName)}
                    style={{ ...S.btn, ...(selectedMoon === mName ? { ...S.btnA, borderColor: "#a78bfa" } : {}) }}>
                    {mName}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Selected moon info */}
        {selectedMoon && (() => {
          const m = MOONS.find(([n]) => n === selectedMoon);
          if (!m) return null;
          const [mName, mParent, mOrbit, mRad, _, mIncl] = m;
          return (
            <div style={S.info}>
              <div style={S.infoName}>{mName}</div>
              <div style={{ fontSize: "10px", color: "#94a3b8", marginBottom: "4px" }}>Moon of {mParent}</div>
              <div style={S.infoD}>
                <Row l="Diameter" v={`${(mRad * 2).toLocaleString()} km`} />
                <Row l="Orbit radius" v={`${mOrbit.toLocaleString()} km`} />
                <Row l="Inclination" v={`${mIncl.toFixed(2)}\u00B0`} />
                <Row l="Orbit period" v={`${(Math.pow(mOrbit / 384400, 1.5) * 27.3).toFixed(1)} days`} />
                {getMoonFact(mName) && <div style={{ fontSize: "10px", color: "#64748b", marginTop: "4px", fontStyle: "italic" }}>{getMoonFact(mName)}</div>}
              </div>
              <button onClick={() => setSelectedMoon(null)} style={{ ...S.btn, marginTop: "6px", width: "100%", textAlign: "center" as const }}>
                Deselect moon
              </button>
            </div>
          );
        })()}

        <div style={S.comp}>
          <div style={S.compHdr}>Differential Aging vs {selected}</div>
          {planets.filter((p) => p.name !== selected).map((p) => {
            let d: number;
            try {
              d = engine.compareBodies(selected, p.name);
            } catch (e) {
              d = NaN;
            }
            const valid = !isNaN(d);
            return (
              <div key={p.name} style={S.compRow}>
                <span style={{ color: p.color }}>{"\u25CF"} {p.name}</span>
                <span style={{ color: valid ? (d > 0 ? "#34d399" : "#f87171") : "#94a3b8", fontVariantNumeric: "tabular-nums" }}>
                  {valid ? `${d > 0 ? "+" : ""}${d.toFixed(2)} \xB5s/day` : "\u2014"}
                </span>
              </div>
            );
          })}
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", fontSize: "11px", color: "#64748b", fontWeight: 600 }}
            onClick={() => setShowControls(!showControls)}>
            <span>Controls</span>
            <span style={{ fontSize: "10px" }}>{showControls ? "\u25B2" : "\u25BC"}</span>
          </div>
          {showControls && (
            <>
              <div style={{ ...S.speedControl, marginTop: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "10px", color: "#64748b" }}>Speed: {timeSpeed.toFixed(1)}x</span>
                  <button onClick={() => setPaused(!paused)} style={S.pauseBtn}>{paused ? "\u25B6" : "\u23F8"}</button>
                </div>
                <input type="range" min="0.1" max="5" step="0.1" value={timeSpeed}
                  onChange={(e) => setTimeSpeed(parseFloat(e.target.value))} style={{ width: "100%", accentColor: "#3b82f6" }} />
                <div style={{ fontSize: "9px", color: "#475569", textAlign: "center" as const }}>
                  1 second {"\u2248"} {Math.round(timeSpeed * 365.25)} days
                </div>
              </div>

              <div style={{ ...S.toggles, marginTop: "6px" }}>
                <label style={S.toggle}>
                  <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
                  <span>Time Zone Grid</span>
                </label>
                <label style={S.toggle}>
                  <input type="checkbox" checked={showMoons} onChange={(e) => setShowMoons(e.target.checked)} />
                  <span>Moons</span>
                </label>
                <label style={S.toggle}>
                  <input type="checkbox" checked={showOrbits} onChange={(e) => setShowOrbits(e.target.checked)} />
                  <span>Orbital Planes</span>
                </label>
              </div>

              <div style={{ ...S.note, marginTop: "6px" }}>
                Asteroid belt: 2.1{"\u2013"}3.3 AU between Mars and Jupiter
                <br />
                Kuiper belt: 30{"\u2013"}50 AU beyond Neptune
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sun ────────────────────────────────────────────────────────────────────

function Sun({ selected, onClick, onHover }: { selected: boolean; onClick: () => void; onHover: (n: string | null) => void }) {
  const ref = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const sunTex = useLoader(THREE.TextureLoader, `${BASE}textures/sun.jpg`);

  useFrame(({ clock }, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.05;
    if (glowRef.current) {
      glowRef.current.rotation.z += dt * 0.02;
      // Subtle pulsing scale on the outer glow
      const pulse = 1.0 + Math.sin(clock.getElapsedTime() * (Math.PI * 2 / 3)) * 0.05;
      glowRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <group>
      <mesh ref={ref} onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(); }} onPointerEnter={() => onHover("Sun")} onPointerLeave={() => onHover(null)}>
        <sphereGeometry args={[SUN_R, 48, 48]} />
        <meshBasicMaterial map={sunTex} />
      </mesh>
      <mesh ref={glowRef}>
        <sphereGeometry args={[SUN_R * 1.3, 32, 32]} />
        <meshBasicMaterial color="#ffab00" transparent opacity={0.12} />
      </mesh>
      <mesh>
        <sphereGeometry args={[SUN_R * 3.0, 32, 32]} />
        <meshBasicMaterial color="#ff6f00" transparent opacity={0.04} />
      </mesh>
      <mesh>
        <sphereGeometry args={[SUN_R * 5.0, 32, 32]} />
        <meshBasicMaterial color="#ff6f00" transparent opacity={0.02} />
      </mesh>
      <pointLight position={[0, 0, 0]} intensity={5} color="#fff3e0" distance={400} decay={1.5} />
      {selected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[SUN_R * 1.5, SUN_R * 1.6, 48]} />
          <meshBasicMaterial color="#ffd54f" transparent opacity={0.3} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

// ─── Planet with texture + grid + moons ────────────────────────────────────

function Planet({ d, selected, hovered, refDf, showGrid, showMoons, timeSpeed, planetPositions, onClick, onHover, onSelectMoon }: {
  d: PData; selected: boolean; hovered: boolean; refDf: number; showGrid: boolean; showMoons: boolean;
  timeSpeed: number; planetPositions: React.MutableRefObject<Record<string, THREE.Vector3>>;
  onClick: () => void; onHover: (n: string | null) => void; onSelectMoon: (name: string | null) => void;
}) {
  const gRef = useRef<THREE.Group>(null);
  const mRef = useRef<THREE.Mesh>(null);
  const orbR = d.au * AU;
  const sz = Math.max(Math.sqrt(d.rKm) * SQRT_SCALE, MIN_R);
  const ddiff = d.df - refDf;
  const dColor = ddiff > 0 ? "#34d399" : "#f87171";
  const tzCount = getTimeZoneCount(d.name);
  const inclRad = (d.incl * Math.PI) / 180;

  const tex = useLoader(THREE.TextureLoader, `${BASE}textures/${d.texture}`);
  // Earth night lights — always loads earth_night.jpg (cached by TextureLoader, only rendered for Earth)
  const nightTex = useLoader(THREE.TextureLoader, `${BASE}textures/earth_night.jpg`);

  const gridMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: gridVertexShader,
    fragmentShader: gridFragmentShader,
    uniforms: {
      uTimeZones: { value: tzCount },
      uGridColor: { value: new THREE.Color(d.name === "Earth" ? "#60a5fa" : d.name === "Mars" ? "#ff6b35" : "#ffffff") },
    },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }), [d.name, tzCount]);

  const moons = useMemo(() => MOONS.filter((m) => m[1] === d.name), [d.name]);

  useFrame(({ clock }) => {
    if (gRef.current) {
      const a = (clock.getElapsedTime() * timeSpeed) / d.period + d.au * 1.5;
      gRef.current.position.x = Math.cos(a) * orbR;
      gRef.current.position.y = Math.sin(a) * Math.sin(inclRad) * orbR * 0.4;
      gRef.current.position.z = Math.sin(a) * orbR;
      // Report position for camera focus
      if (!planetPositions.current[d.name]) planetPositions.current[d.name] = new THREE.Vector3();
      planetPositions.current[d.name].copy(gRef.current.position);
    }
    // Realistic relative rotation: Earth ~1 rotation per 10s visual, scaled by planet's real rate
    if (mRef.current) mRef.current.rotation.y += 0.001 * getRotationRate(d.name);
  });

  return (
    <group ref={gRef}>
      {/* Planet body with NASA texture */}
      <mesh ref={mRef}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(); }}
        onPointerEnter={() => onHover(d.name)}
        onPointerLeave={() => onHover(null)}
      >
        <sphereGeometry args={[sz, 64, 64]} />
        {d.name === "Uranus" || d.name === "Neptune" || d.name === "Pluto"
          ? <meshBasicMaterial color={d.color} />
          : <meshBasicMaterial map={tex} />}
      </mesh>

      {/* Earth night lights layer */}
      {d.name === "Earth" && (
        <mesh rotation={[0, Math.PI, 0]}>
          <sphereGeometry args={[sz * 1.001, 64, 64]} />
          <meshBasicMaterial map={nightTex} transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      )}

      {/* Time zone grid overlay */}
      {showGrid && (
        <mesh>
          <sphereGeometry args={[sz * 1.003, 64, 64]} />
          <primitive object={gridMat} attach="material" />
        </mesh>
      )}

      {/* Atmosphere */}
      <mesh>
        <sphereGeometry args={[sz * (d.name === "Venus" ? 1.12 : 1.06), 32, 32]} />
        <meshBasicMaterial
          color={d.name === "Earth" ? "#4a90d9" : d.name === "Venus" ? "#e8c87a" : d.name === "Mars" ? "#c1440e" : d.color}
          transparent opacity={d.name === "Venus" ? 0.15 : d.name === "Earth" ? 0.08 : 0.04}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Dilation glow — red for strong dilation (close to Sun), green for weak */}
      {(() => {
        const dilationGlow = d.df < 1 ? Math.log10(1 / d.df) * 0.3 : 0;
        // Strong dilation (closer to Sun / more massive) = red, weak = green
        const glowColor = dilationGlow > 0.001 ? "#ef4444" : "#34d399";
        return dilationGlow > 0 ? (
          <mesh>
            <sphereGeometry args={[sz * (1 + dilationGlow), 32, 32]} />
            <meshBasicMaterial color={glowColor} transparent opacity={0.08} side={THREE.BackSide} depthWrite={false} />
          </mesh>
        ) : null;
      })()}

      {/* Saturn rings with texture */}
      {d.rings && <SaturnRings size={sz} />}

      {/* Moons */}
      {showMoons && moons.map(([mName, _, mOrbit, mRad, mColor, mIncl]) => (
        <MoonBody key={mName} name={mName} orbitR={mOrbit} radius={mRad} color={mColor} parentR={sz} inclination={mIncl} onClick={() => onSelectMoon(mName)} />
      ))}

      {/* Selection ring */}
      {selected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[sz * 1.5, sz * 1.65, 48]} />
          <meshBasicMaterial color={d.color} transparent opacity={0.4} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Label */}
      {(selected || hovered) && (
        <Html position={[0, sz + 0.4, 0]} center style={{ pointerEvents: "none" }}>
          <div style={{ color: "#f1f5f9", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", background: "rgba(15,23,42,0.85)", padding: "4px 10px", borderRadius: "4px", border: `1px solid ${d.color}50`, backdropFilter: "blur(4px)", whiteSpace: "nowrap" }}>
            <div style={{ fontWeight: 700, marginBottom: "2px" }}>{d.name}</div>
            <div style={{ color: dColor, fontSize: "10px" }}>
              {ddiff >= 0 ? "+" : ""}{(ddiff * 86400 * 1e6).toFixed(2)} {"\u03BCs/day"}
            </div>
            <div style={{ color: "#94a3b8", fontSize: "10px" }}>
              {d.incl.toFixed(1)}{"\u00B0"} incl{showMoons && moons.length > 0 ? ` | ${moons.length} moon${moons.length > 1 ? "s" : ""}` : ""}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

// ─── Moon ───────────────────────────────────────────────────────────────────

function MoonBody({ name, orbitR, radius, color, parentR, inclination, onClick }: {
  name: string; orbitR: number; radius: number; color: string; parentR: number; inclination: number; onClick: () => void;
}) {
  const ref = useRef<THREE.Group>(null);
  // Same sqrt scaling as planets for consistent proportions
  const moonR = Math.max(Math.sqrt(radius) * SQRT_SCALE, MIN_MOON_R);
  // Orbit: sqrt of (real orbit / parent radius in km) * parent scene radius, offset from surface
  const parentRealKm = (parentR / SQRT_SCALE) ** 2; // reverse sqrt to get parent km
  const realOrbitRatio = orbitR / Math.max(parentRealKm, 1);
  const orbitSceneR = Math.max(parentR * Math.sqrt(realOrbitRatio) * 0.7 + parentR * 1.2, parentR + MIN_MOON_ORBIT);
  // Amplify inclination for visibility (real values are tiny — Moon's 5.15° is the largest)
  const inclRad = (inclination * Math.PI) / 180 * 3; // 3x amplification

  // Always load moon.jpg (TextureLoader caches it); only apply to Earth's Moon
  const moonTex = useLoader(THREE.TextureLoader, `${BASE}textures/moon.jpg`);

  useFrame(({ clock }) => {
    if (ref.current) {
      const periodFactor = Math.pow(orbitR / 400000, 1.5);
      const speed = 1.5 / Math.max(periodFactor, 0.01);
      const t = clock.getElapsedTime() * speed;
      ref.current.position.x = Math.cos(t) * orbitSceneR;
      ref.current.position.z = Math.sin(t) * orbitSceneR;
      ref.current.position.y = Math.sin(t) * Math.sin(inclRad) * orbitSceneR;
    }
  });

  return (
    <group>
      {/* Moon orbit ring — tilted by inclination */}
      <group rotation={[inclRad, 0, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[orbitSceneR - 0.005, orbitSceneR + 0.005, 64]} />
          <meshBasicMaterial color="#334155" transparent opacity={0.15} side={THREE.DoubleSide} />
        </mesh>
      </group>
      {/* Moon body — clickable */}
      <group ref={ref}>
        <mesh onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(); }}>
          <sphereGeometry args={[moonR, 16, 16]} />
          {name === "Moon" ? (
            <meshBasicMaterial map={moonTex} />
          ) : (
            <meshBasicMaterial color={color} />
          )}
        </mesh>
        <Html position={[0, moonR + 0.12, 0]} center style={{ pointerEvents: "none" }}>
          <div style={{ color: "#e2e8f0", fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap", background: "rgba(1,1,8,0.7)", padding: "1px 4px", borderRadius: "2px" }}>{name}</div>
        </Html>
      </group>
    </group>
  );
}

// ─── Orbit Ring with inclination ───────────────────────────────────────────

function OrbitRing({ r, incl, active, hovered }: { r: number; incl: number; active: boolean; hovered?: boolean }) {
  const inclRad = (incl * Math.PI) / 180;
  const pts = useMemo(() => {
    const p: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = Math.sin(a) * Math.sin(inclRad) * r * 0.4;
      p.push(new THREE.Vector3(x, y, z));
    }
    return p;
  }, [r, inclRad]);

  const isHighlighted = active || hovered;
  return <Line points={pts} color={isHighlighted ? "#60a5fa" : "#1e293b"} lineWidth={hovered ? 1.8 : (active ? 1.2 : 0.4)} transparent opacity={hovered ? 0.7 : (active ? 0.5 : 0.15)} />;
}

// ─── Asteroid Belt ─────────────────────────────────────────────────────────

function AsteroidBelt() {
  const { positions, sizes } = useMemo(() => {
    const N = 600;
    const pos = new Float32Array(N * 3);
    const sz = new Float32Array(N);
    const innerAU = 2.1 * AU; // ~2.1 AU
    const outerAU = 3.3 * AU; // ~3.3 AU
    for (let i = 0; i < N; i++) {
      const r = innerAU + Math.random() * (outerAU - innerAU);
      const angle = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 1.2; // slight vertical spread
      pos[i * 3] = Math.cos(angle) * r;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(angle) * r;
      sz[i] = 0.02 + Math.random() * 0.04;
    }
    return { positions: pos, sizes: sz };
  }, []);

  const ref = useRef<THREE.Points>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.getElapsedTime() * 0.002;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#8a7d6b" size={0.06} transparent opacity={0.5} sizeAttenuation />
    </points>
  );
}

// ─── Saturn Rings with texture ─────────────────────────────────────────────

function SaturnRings({ size }: { size: number }) {
  const ringTex = useLoader(THREE.TextureLoader, `${BASE}textures/saturn_ring.png`);

  // Custom ring geometry with proper UV mapping for the ring texture
  const ringGeom = useMemo(() => {
    const inner = size * 1.3;
    const outer = size * 2.4;
    const segments = 128;
    const geom = new THREE.RingGeometry(inner, outer, segments, 1);
    // Remap UVs so texture maps radially (inner edge → outer edge)
    const uvs = geom.attributes.uv;
    const pos = geom.attributes.position;
    for (let i = 0; i < uvs.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const r = Math.sqrt(x * x + y * y);
      const u = (r - inner) / (outer - inner);
      uvs.setXY(i, u, 0.5);
    }
    return geom;
  }, [size]);

  return (
    <group rotation={[Math.PI * 0.45, 0, 0]}>
      <mesh geometry={ringGeom}>
        <meshBasicMaterial
          map={ringTex}
          transparent
          opacity={0.7}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Cassini Division gap — dark ring */}
      <mesh>
        <ringGeometry args={[size * 1.78, size * 1.85, 128]} />
        <meshBasicMaterial color="#020208" transparent opacity={0.4} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

// Rotation rate relative to Earth (Earth=1, Jupiter=2.4, Venus=0.004)
function getRotationRate(name: string): number {
  switch (name) {
    case "Mercury": return 0.017;   // 58.6 day period
    case "Venus": return 0.004;     // 243 day period (retrograde)
    case "Earth": return 1.0;       // 24 hr
    case "Mars": return 0.97;       // 24.6 hr
    case "Jupiter": return 2.4;     // 9.9 hr
    case "Saturn": return 2.2;      // 10.7 hr
    case "Uranus": return 1.4;      // 17.2 hr
    case "Neptune": return 1.5;     // 16.1 hr
    case "Pluto": return 0.15;      // 6.4 day period
    default: return 1.0;
  }
}

// ─── Round 6 — Kuiper Belt ────────────────────────────────────────────────

function KuiperBelt() {
  const { positions, sizes } = useMemo(() => {
    const N = 300;
    const pos = new Float32Array(N * 3);
    const sz = new Float32Array(N);
    const innerAU = 30 * AU;
    const outerAU = 50 * AU;
    for (let i = 0; i < N; i++) {
      const r = innerAU + Math.random() * (outerAU - innerAU);
      const angle = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 2.5;
      pos[i * 3] = Math.cos(angle) * r;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(angle) * r;
      sz[i] = 0.03 + Math.random() * 0.06;
    }
    return { positions: pos, sizes: sz };
  }, []);

  const ref = useRef<THREE.Points>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.getElapsedTime() * 0.0005;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#4a6080" size={0.08} transparent opacity={0.45} sizeAttenuation />
    </points>
  );
}

// ─── Round 8 — Orbit trail ────────────────────────────────────────────────

function OrbitTrail({ planet, timeSpeed, planetPositions, trailOpacity = 1.0 }: {
  planet: PData;
  timeSpeed: number;
  planetPositions: React.MutableRefObject<Record<string, THREE.Vector3>>;
  trailOpacity?: number;
}) {
  const trailRef = useRef<THREE.Group>(null);
  const TRAIL_COUNT = 20;
  const TRAIL_ARC = (30 * Math.PI) / 180; // 30 degrees

  const orbR = planet.au * AU;
  const inclRad = (planet.incl * Math.PI) / 180;

  useFrame(({ clock }) => {
    if (!trailRef.current) return;
    const currentAngle = (clock.getElapsedTime() * timeSpeed) / planet.period + planet.au * 1.5;
    trailRef.current.children.forEach((child, i) => {
      const frac = (i + 1) / TRAIL_COUNT;
      const angle = currentAngle - frac * TRAIL_ARC;
      (child as THREE.Mesh).position.x = Math.cos(angle) * orbR;
      (child as THREE.Mesh).position.y = Math.sin(angle) * Math.sin(inclRad) * orbR * 0.4;
      (child as THREE.Mesh).position.z = Math.sin(angle) * orbR;
    });
  });

  const periodLabel = planet.period >= 1 ? `${planet.period.toFixed(1)} yr orbit` : `${(planet.period * 365.25).toFixed(0)} day orbit`;

  return (
    <group ref={trailRef}>
      {Array.from({ length: TRAIL_COUNT }, (_, i) => {
        const opacity = 0.6 * (1 - (i + 1) / TRAIL_COUNT) * trailOpacity;
        return (
          <mesh key={i}>
            <sphereGeometry args={[0.04, 6, 6]} />
            <meshBasicMaterial color={planet.color} transparent opacity={opacity} depthWrite={false} />
          </mesh>
        );
      })}
      {/* Orbital period label near trail */}
      <Html position={[0, 0.3, 0]} center style={{ pointerEvents: "none" }}>
        <div style={{ color: planet.color, fontSize: "9px", fontFamily: "'JetBrains Mono', monospace", background: "rgba(2,2,8,0.7)", padding: "1px 4px", borderRadius: "2px", whiteSpace: "nowrap", opacity: 0.8 }}>
          {periodLabel}
        </div>
      </Html>
    </group>
  );
}

// ─── Round 10 — Habitable Zone ────────────────────────────────────────────

function HabitableZone() {
  const innerR = 0.95 * AU;
  const outerR = 1.37 * AU;

  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <ringGeometry args={[innerR, outerR, 128]} />
        <meshBasicMaterial color="#22c55e" transparent opacity={0.06} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* Habitable zone label */}
      <Html position={[outerR + 0.5, 0, 0]} center style={{ pointerEvents: "none" }}>
        <div style={{
          color: "#22c55e",
          fontSize: "9px",
          fontFamily: "'JetBrains Mono', monospace",
          background: "rgba(2,2,8,0.85)",
          padding: "2px 6px",
          borderRadius: "3px",
          whiteSpace: "nowrap",
          border: "1px solid #22c55e30",
        }}>
          Habitable Zone
        </div>
      </Html>
    </group>
  );
}

function getMoonFact(name: string): string | null {
  switch (name) {
    case "Moon": return "Tidally locked. Earth's gravity dominates \u2014 clocks on Moon tick ~56 \u03BCs/day faster than Earth surface.";
    case "Phobos": return "Largest moon of Mars. Orbiting closer every century \u2014 will crash or break apart in ~50 million years. Deep in Mars's gravity well.";
    case "Deimos": return "Smallest moon of Mars. Only 12 km across. Slowly spiraling outward \u2014 weaker gravitational influence than Phobos.";
    case "Io": return "Most volcanically active body in the solar system. Tidal heating from Jupiter's immense gravity creates extreme tidal dilation gradients.";
    case "Europa": return "Deep in Jupiter's gravity well \u2014 measurable time dilation from tidal forces. Subsurface ocean beneath ice crust.";
    case "Ganymede": return "Largest moon in the solar system \u2014 bigger than Mercury. Has its own magnetic field and gravity well.";
    case "Callisto": return "Most heavily cratered body in the solar system. Farthest of Jupiter's Galilean moons \u2014 weakest Jovian tidal dilation.";
    case "Titan": return "Saturn's gravity + Titan's own mass create compound dilation effect. Only moon with a dense atmosphere. Methane lakes and rain.";
    case "Enceladus": return "Geysers of water ice erupt from south pole. Deep in Saturn's gravity well \u2014 tidal forces drive subsurface ocean heating.";
    case "Rhea": return "Second-largest moon of Saturn. May have a faint ring system of its own. Moderate dilation from Saturn's gravity.";
    case "Miranda": return "Extreme geological features \u2014 huge canyons, cliffs up to 20 km high. Close orbit means stronger Uranian tidal dilation.";
    case "Ariel": return "Brightest and youngest surface of Uranus's moons. Extensive fault canyons shaped by tidal gravitational stresses.";
    case "Triton": return "Only large moon with retrograde orbit \u2014 likely a captured Kuiper belt object. Active nitrogen geysers. Neptune's gravity dominates.";
    case "Charon": return "So large relative to Pluto they orbit a common center. Considered a binary system \u2014 shared gravitational dilation field.";
    default: return null;
  }
}

function getRelativityNote(name: string): string {
  switch (name) {
    case "Mercury": return "Closest to Sun \u2014 strongest solar gravity dilation among planets";
    case "Venus": return "Deep in Sun's gravity well \u2014 second strongest planetary dilation";
    case "Earth": return "Our reference frame \u2014 GPS must correct +38.6 \u03BCs/day for orbiting clocks";
    case "Mars": return "Weaker solar gravity \u2014 clocks tick slightly faster than on Earth";
    case "Jupiter": return "Most massive planet \u2014 deepest gravity well after Sun";
    case "Saturn": return "Significant mass creates measurable gravity dilation at its surface";
    case "Uranus": return "Distant from Sun \u2014 weak solar dilation, moderate self-gravity";
    case "Neptune": return "Farthest giant planet \u2014 minimal solar dilation contribution";
    case "Pluto": return "So far from Sun that solar gravity dilation is negligible";
    default: return "";
  }
}

function getTimeZoneCount(name: string): number {
  switch (name) {
    case "Mercury": return 6;
    case "Venus": return 1;         // barely rotates
    case "Earth": return 24;
    case "Mars": return 24;
    case "Jupiter": return 12;
    case "Saturn": return 12;
    case "Uranus": return 12;
    case "Neptune": return 12;
    case "Pluto": return 4;
    default: return 12;
  }
}

function Row({ l, v }: { l: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#94a3b8", padding: "1px 0" }}>
      <span style={{ color: "#64748b" }}>{l}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", textAlign: "right", maxWidth: "160px", overflowWrap: "break-word" }}>{v}</span>
    </div>
  );
}

function fmt(s: number): string {
  if (s < 0.001) return `${(s * 1e6).toFixed(1)} \xB5s`;
  if (s < 1) return `${(s * 1e3).toFixed(3)} ms`;
  return `${s.toFixed(3)} s`;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  container: { display: "flex", height: "calc(100vh - 130px)", gap: 0 },
  canvas: { flex: 1, borderRadius: "8px", overflow: "hidden", border: "1px solid #1e293b" },
  panel: { width: "280px", background: "rgba(17,24,39,0.85)", backdropFilter: "blur(12px)", border: "1px solid #1e293b", borderRadius: "8px", padding: "14px", marginLeft: "10px", overflow: "auto", display: "flex", flexDirection: "column", gap: "12px" },
  panelHdr: { fontSize: "12px", fontWeight: 600, color: "#f59e0b", letterSpacing: "1.5px", textTransform: "uppercase" },
  btns: { display: "flex", flexWrap: "wrap", gap: "4px" },
  btn: { padding: "4px 8px", border: "1px solid #1e293b", borderRadius: "4px", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: "11px", fontFamily: "inherit", transition: "all 0.15s" },
  btnA: { background: "#1e293b", color: "#e2e8f0", borderColor: "#3b82f6" },
  info: { background: "#0a0f18", borderRadius: "6px", padding: "10px", border: "1px solid #1e293b30", boxShadow: "0 0 15px rgba(0,0,0,0.3)" },
  infoName: { fontSize: "16px", fontWeight: 700, color: "#f1f5f9", marginBottom: "6px" },
  infoD: { display: "flex", flexDirection: "column", gap: "2px" },
  toggles: { display: "flex", flexDirection: "column", gap: "6px" },
  toggle: { display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#94a3b8", cursor: "pointer" },
  comp: { display: "flex", flexDirection: "column", gap: "4px" },
  compHdr: { fontSize: "11px", color: "#64748b", letterSpacing: "0.5px", marginBottom: "2px" },
  compRow: { display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "2px 0", borderBottom: "1px solid #0a0f18" },
  note: { fontSize: "10px", color: "#94a3b8", fontStyle: "italic", padding: "4px 0" },
  subNav: { display: "flex", flexWrap: "wrap", gap: "2px", marginBottom: "8px", borderBottom: "1px solid #1e293b", paddingBottom: "8px" },
  subTab: { padding: "3px 6px", border: "none", borderRadius: "3px", background: "transparent", color: "#64748b", cursor: "pointer", fontSize: "10px", fontFamily: "inherit", fontWeight: 600, transition: "all 0.15s" },
  subTabActive: { background: "#1e293b", color: "#e2e8f0 !important" },
  moonSection: { background: "#0a0f18", borderRadius: "6px", padding: "8px", border: "1px solid #1e293b30", boxShadow: "0 0 15px rgba(0,0,0,0.3)" },
  speedControl: { background: "#0a0f18", borderRadius: "6px", padding: "8px", display: "flex", flexDirection: "column", gap: "4px", boxShadow: "0 0 15px rgba(0,0,0,0.3)" },
  pauseBtn: { padding: "2px 8px", border: "1px solid #1e293b", borderRadius: "4px", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: "12px", fontFamily: "inherit" },
  backBtn: {
    padding: "6px 12px", border: "1px solid #3b82f6", borderRadius: "6px",
    background: "#1e293b", color: "#60a5fa", cursor: "pointer",
    fontSize: "11px", fontFamily: "inherit", fontWeight: 600,
    width: "100%", textAlign: "center" as const,
  },
};
