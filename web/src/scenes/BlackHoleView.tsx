import React, { useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Line, Stars as DreiStars } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { Effect, BlendFunction } from "postprocessing";
import * as THREE from "three";
import { engine } from "../engine/wasm-bridge";

const C2 = 299792458 * 299792458;

// ─── Gravitational Lensing Post-Processing Effect ──────────────────────────

const lensingFragmentShader = `
  uniform vec2 uCenter;
  uniform float uStrength;
  uniform float uRadius;

  void mainUv(inout vec2 uv) {
    vec2 dir = uv - uCenter;
    float dist = length(dir);
    if (dist < 0.001) return;

    // Einstein ring deflection: angle ~ 4GM/(c²b)
    // Simplified screen-space: deflect inversely with distance
    float innerFade = smoothstep(uRadius * 0.15, uRadius * 0.5, dist);
    float outerFade = 1.0 - smoothstep(0.0, uRadius, dist);
    float deflection = uStrength / (dist * 8.0) * innerFade * outerFade;

    // Tangential stretching (Einstein ring / caustic pattern)
    vec2 tangent = vec2(-dir.y, dir.x) / dist;
    float ringPhase = sin(dist * 20.0 - 1.0) * 0.5;

    // Radial magnification — compress background near photon sphere
    float magnification = 1.0 + uStrength * 0.3 / (dist * 10.0 + 0.1) * outerFade;

    uv += normalize(dir) * deflection * magnification + tangent * deflection * ringPhase * 0.4;
  }
`;

class GravitationalLensEffect extends Effect {
  constructor({ center = [0.5, 0.5], strength = 1.0, radius = 0.4 } = {}) {
    super("GravitationalLensEffect", lensingFragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ["uCenter", new THREE.Uniform(new THREE.Vector2(center[0], center[1]))],
        ["uStrength", new THREE.Uniform(strength)],
        ["uRadius", new THREE.Uniform(radius)],
      ]),
    });
  }
}

// Tracks black hole screen position and updates lensing uniforms directly
function LensingTracker({ mass }: { mass: number }) {
  const { camera } = useThree();
  const bhPos = useMemo(() => new THREE.Vector3(0, 0, 0), []);
  const projected = useMemo(() => new THREE.Vector3(), []);

  const effect = useMemo(() => new GravitationalLensEffect({
    strength: Math.min(mass * 0.5, 8.0),
    radius: 0.5,
  }), []);

  // Update strength when mass changes
  useEffect(() => {
    effect.uniforms.get("uStrength")!.value = Math.min(mass * 0.5, 8.0);
  }, [effect, mass]);

  // Track black hole screen position every frame
  useFrame(() => {
    projected.copy(bhPos).project(camera);
    const cx = (projected.x + 1) / 2;
    const cy = 1 - (projected.y + 1) / 2;
    effect.uniforms.get("uCenter")!.value.set(cx, cy);
  });

  return <primitive object={effect} dispose={null} />;
}

export function BlackHoleView() {
  const [mass, setMass] = useState(10); // solar masses
  const [spin, setSpin] = useState(0.0); // dimensionless spin a*
  const [observerR, setObserverR] = useState(6); // in units of rs

  const gmSun = engine.constants.gmSun();
  const gm = mass * gmSun;
  const rs = (2 * gm) / C2;

  const dilation = useMemo(() => {
    try {
      const r = observerR * rs;
      const d = spin === 0
        ? engine.schwarzschildDilation(gm, r)
        : engine.kerrDilation(gm, spin, r, Math.PI / 2);
      return isNaN(d) ? 0 : d;
    } catch (e) {
      return 0;
    }
  }, [mass, spin, observerR, gm, rs]);

  const secondsLost = (() => {
    try {
      const v = engine.secondsLostPerYear(dilation);
      return isNaN(v) ? 0 : v;
    } catch (e) {
      return 0;
    }
  })();

  // Dilation profile: dilation vs radius from 1.1rs to 20rs
  const profile = useMemo(() => {
    const points: { r: number; d: number }[] = [];
    try {
      for (let i = 0; i <= 100; i++) {
        const rRs = 1.05 + (i / 100) * 19;
        const r = rRs * rs;
        const d =
          spin === 0
            ? engine.schwarzschildDilation(gm, r)
            : engine.kerrDilation(gm, spin, r, Math.PI / 2);
        points.push({ r: rRs, d: isNaN(d) ? 0 : d });
      }
    } catch (e) {
      // Return empty profile on engine error
    }
    return points;
  }, [mass, spin, gm, rs]);

  return (
    <div style={styles.container} className="scene-layout">
      <div style={styles.canvasWrapper} className="scene-canvas">
        <Canvas
          camera={{ position: [0, 6, 10], fov: 50 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
          style={{ background: "#010108" }}
        >
          <color attach="background" args={["#010108"]} />
          <ambientLight intensity={0.03} />
          <BlackHoleScene
            rs={rs}
            spin={spin}
            gm={gm}
            observerRs={observerR}
            dilation={dilation}
          />
          <DreiStars radius={60} depth={50} count={6000} factor={4} saturation={0} fade speed={0.3} />
          <EffectComposer>
            <LensingTracker mass={mass} />
            <Bloom luminanceThreshold={0.1} luminanceSmoothing={0.9} intensity={2.0} mipmapBlur />
            <Vignette eskil={false} offset={0.15} darkness={0.8} />
          </EffectComposer>
          <OrbitControls enablePan maxDistance={40} minDistance={2} enableDamping dampingFactor={0.05} />
        </Canvas>
      </div>

      <div style={styles.panel} className="scene-panel" data-testid="blackhole-panel">
        <div style={styles.panelTitle}>Black Hole Parameters</div>

        <SliderControl
          label={`Mass: ${mass} M\u2609`}
          min={1}
          max={100}
          step={1}
          value={mass}
          onChange={setMass}
        />
        <SliderControl
          label={`Spin: a* = ${spin.toFixed(2)}`}
          min={0}
          max={0.998}
          step={0.01}
          value={spin}
          onChange={setSpin}
        />
        <SliderControl
          label={`Observer: ${observerR.toFixed(1)} r\u209b`}
          min={1.1}
          max={20}
          step={0.1}
          value={observerR}
          onChange={setObserverR}
        />

        <div style={{ ...styles.results, borderLeft: `3px solid ${dilation > 0.8 ? "#34d399" : dilation > 0.5 ? "#fbbf24" : "#ef4444"}` }}>
          <div style={styles.resultRow}>
            <span>d{"\u03C4"}/dt</span>
            <span
              style={{ color: dilation < 0.5 ? "#ef4444" : "#34d399" }}
            >
              {dilation.toFixed(6)}
            </span>
          </div>
          <div style={styles.resultRow}>
            <span>Time factor</span>
            <span>
              {dilation > 0.001
                ? `${(1 / dilation).toFixed(2)}\u00D7 slower`
                : "\u221E (frozen)"}
            </span>
          </div>
          <div style={styles.resultRow}>
            <span>Escape velocity</span>
            <span style={{ color: "#a78bfa" }}>
              {observerR > 1 ? `${Math.sqrt(1 / observerR).toFixed(4)} c` : "> c"}
            </span>
          </div>
          {spin > 0 && (
            <div style={styles.resultRow}>
              <span>Ergosphere (eq.)</span>
              <span>{((2 * gm) / C2 / 1000).toFixed(1)} km</span>
            </div>
          )}
          <details style={{ fontSize: "11px", color: "#94a3b8", cursor: "pointer" }}>
            <summary>Schwarzschild Details</summary>
            <div style={{ ...styles.resultRow, marginTop: "4px" }}>
              <span>Schwarzschild radius</span>
              <span>{(rs / 1000).toFixed(1)} km</span>
            </div>
            <div style={styles.resultRow}>
              <span>Observer distance</span>
              <span>{((observerR * rs) / 1000).toFixed(1)} km</span>
            </div>
            <div style={styles.resultRow}>
              <span>Lost/year vs {"\u221E"}</span>
              <span>{formatLarge(secondsLost)}</span>
            </div>
          </details>
        </div>

        {/* Formula card */}
        <div style={styles.formulaCard}>
          <div style={styles.formulaTitle}>Formulas</div>
          <div style={styles.formulaText}>
            d{"\u03C4"}/dt = {"\u221A"}(1 - r{"\u209b"}/r)
          </div>
          <div style={{ ...styles.formulaText, marginTop: "4px", fontSize: "10px", color: "#64748b" }}>
            r{"\u209b"} = 2GM/c{"\u00B2"}
          </div>
        </div>

        {/* Why This Matters */}
        <div style={styles.infoCard}>
          The closer to the event horizon, the slower time moves. At dilation = 0.1 (extreme zone), 1 second for you = 10 seconds for a distant observer. Accretion disks shine because matter spirals inward through this extreme dilation, converting gravitational energy to radiation — powering quasars visible across billions of light-years.
        </div>

        <div style={styles.profileSection}>
          <div style={styles.profileTitle}>Dilation Profile</div>
          <svg viewBox="0 0 260 120" style={styles.svg}>
            {/* Grid — log scale: map dilation [0..1] with log spacing */}
            {([0.01, 0.1, 0.25, 0.5, 1.0] as const).map((v) => {
              const yPos = 110 - (Math.log10(v + 0.001) + 3) / (Math.log10(1.001) + 3) * 100;
              const word = v === 0.01 ? "frozen" : v === 0.1 ? "extreme" : v === 0.25 ? "severe" : v === 0.5 ? "half" : "normal";
              return (
                <g key={v}>
                  <line
                    x1={30}
                    y1={yPos}
                    x2={255}
                    y2={yPos}
                    stroke="#1e293b"
                    strokeWidth={0.5}
                  />
                  <text
                    x={2}
                    y={yPos + 3}
                    fill="#94a3b8"
                    fontSize={9}
                    fontFamily="monospace"
                  >
                    {v < 0.1 ? v.toFixed(2) : v.toFixed(1)} {word}
                  </text>
                </g>
              );
            })}
            {/* Danger zone: dilation < 0.1 — red band */}
            {(() => {
              const dangerY = 110 - (Math.log10(0.1 + 0.001) + 3) / (Math.log10(1.001) + 3) * 100;
              return (
                <rect x={30} y={dangerY} width={225} height={110 - dangerY} fill="#ef4444" opacity={0.08} />
              );
            })()}
            {/* Curve — log scale Y */}
            <polyline
              fill="none"
              stroke="#60a5fa"
              strokeWidth={1.5}
              points={profile
                .map(
                  (p) => {
                    const yPos = 110 - (Math.log10(p.d + 0.001) + 3) / (Math.log10(1.001) + 3) * 100;
                    return `${30 + ((p.r - 1.05) / 19) * 225},${yPos}`;
                  }
                )
                .join(" ")}
            />
            {/* Observer marker */}
            <circle
              cx={30 + ((observerR - 1.05) / 19) * 225}
              cy={110 - (Math.log10(dilation + 0.001) + 3) / (Math.log10(1.001) + 3) * 100}
              r={3}
              fill="#f59e0b"
              style={{ transition: "cx 0.3s ease, cy 0.3s ease" }}
            />
            {/* Event horizon marker */}
            <line
              x1={30}
              y1={10}
              x2={30}
              y2={110}
              stroke="#ef4444"
              strokeWidth={1}
              strokeDasharray="3,3"
            />
            <text x={32} y={20} fill="#ef4444" fontSize={10} fontFamily="monospace">
              r{"\u209b"}
            </text>
            {/* ISCO radius marker — r_ISCO = 3rs at spin=0 (Schwarzschild), varies with spin */}
            {(() => {
              const iscoRs = 3 * (1 - spin * 0.5);
              const iscoX = 30 + ((iscoRs - 1.05) / 19) * 225;
              return iscoX >= 30 && iscoX <= 255 ? (
                <g>
                  <title>ISCO = Innermost Stable Circular Orbit. Below this radius, matter cannot orbit stably — it spirals into the black hole.</title>
                  <line
                    x1={iscoX}
                    y1={10}
                    x2={iscoX}
                    y2={110}
                    stroke="#a78bfa"
                    strokeWidth={1}
                    strokeDasharray="4,2"
                  />
                  <text x={iscoX + 2} y={20} fill="#a78bfa" fontSize={10} fontFamily="monospace">
                    ISCO
                  </text>
                </g>
              ) : null;
            })()}
            {/* X axis labels */}
            {[1, 5, 10, 15, 20].map((r) => (
              <text
                key={r}
                x={30 + ((r - 1.05) / 19) * 225}
                y={119}
                fill="#94a3b8"
                fontSize={10}
                fontFamily="monospace"
                textAnchor="middle"
              >
                {r}r{"\u209b"}
              </text>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}

function BlackHoleScene({
  rs,
  spin,
  gm,
  observerRs,
  dilation,
}: {
  rs: number;
  spin: number;
  gm: number;
  observerRs: number;
  dilation: number;
}) {
  const accretionRef = useRef<THREE.Group>(null);
  const observerRef = useRef<THREE.Group>(null);

  // Scale: 1 unit = 1 rs
  const SCALE = 1;

  const ringRefs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    // Each ring rotates at Keplerian speed: v ∝ r^(-1/2), so ω ∝ r^(-3/2)
    ringRefs.current.forEach((mesh, i) => {
      if (mesh) {
        const r = 1.5 + i * 0.5;
        const omega = 0.8 / Math.pow(r, 1.5); // Kepler
        mesh.rotation.z = t * omega;
      }
    });
  });

  // Dilation rings: show color-coded dilation at different radii
  const dilationRings = useMemo(() => {
    const rings: { radius: number; dilation: number }[] = [];
    try {
      for (let r = 1.5; r <= 10; r += 0.5) {
        const d = engine.schwarzschildDilation(gm, r * rs);
        rings.push({ radius: r, dilation: isNaN(d) ? 0 : d });
      }
    } catch (e) {
      // Engine error — return empty rings
    }
    return rings;
  }, [gm, rs]);

  return (
    <group>
      {/* Event horizon — pure black sphere */}
      <mesh>
        <sphereGeometry args={[SCALE, 64, 64]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      {/* Inner depth sphere for visual depth */}
      <mesh>
        <sphereGeometry args={[0.95, 64, 64]} />
        <meshBasicMaterial color="#000008" />
      </mesh>

      {/* Round 6 — Schwarzschild radius label at event horizon */}
      <Html position={[1, 0.5, 0]} center style={{ pointerEvents: "none" }}>
        <div style={{ color: "#ef4444", fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", background: "rgba(10,15,24,0.85)", padding: "2px 6px", borderRadius: "3px", whiteSpace: "nowrap", border: "1px solid #ef444430" }}>
          r = {(rs / 1000).toFixed(1)} km
        </div>
      </Html>

      {/* Photon sphere glow (1.5 rₛ) — bright ring where light orbits */}
      <mesh>
        <sphereGeometry args={[1.5 * SCALE, 48, 48]} />
        <meshBasicMaterial color="#ff8f00" transparent opacity={0.06} />
      </mesh>
      {/* Photon ring — thin bright ring at 1.5rₛ */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.48 * SCALE, 1.52 * SCALE, 64]} />
        <meshBasicMaterial color="#ffe082" transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>

      {/* Accretion disk — temperature gradient (hot blue-white inner, cooler red outer) */}
      <group rotation={[Math.PI * 0.08, 0, 0]}>
        {dilationRings.map((ring, i) => {
          const t = (ring.radius - 1.5) / 8.5; // 0=inner, 1=outer
          // Temperature color: white-blue (inner) → orange → dark red (outer)
          const tempColor = t < 0.2 ? "#c0d8ff" : t < 0.4 ? "#ffd54f" : t < 0.7 ? "#ff8f00" : "#cc3300";
          return (
            <mesh key={ring.radius} ref={(el) => { ringRefs.current[i] = el; }} rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[ring.radius * SCALE, (ring.radius + 0.35) * SCALE, 96]} />
              <meshBasicMaterial color={tempColor} transparent opacity={0.15 + (1 - t) * 0.35} side={THREE.DoubleSide} />
            </mesh>
          );
        })}
        {/* Hot ISCO inner edge — brightest emission */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.5 * SCALE, 2.5 * SCALE, 96]} />
          <meshBasicMaterial color="#d4e4ff" transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
      </group>
      {/* Relativistic jet hints along spin axis */}
      {spin > 0.1 && (
        <group>
          <mesh position={[0, 4, 0]}>
            <coneGeometry args={[0.3 + spin * 0.3, 6, 16, 1, true]} />
            <meshBasicMaterial color="#60a5fa" transparent opacity={0.06 + spin * 0.04} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, -4, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.3 + spin * 0.3, 6, 16, 1, true]} />
            <meshBasicMaterial color="#60a5fa" transparent opacity={0.06 + spin * 0.04} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}

      {/* Ergosphere ring (Kerr metric: r_ergo = 2GM/c² at equator = rs at equator) */}
      {spin > 0.01 && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[SCALE * 0.98, (1 + spin * 0.5) * SCALE * 1.02, 64]} />
          <meshBasicMaterial color="#a78bfa" transparent opacity={0.12} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Round 7 — Frame dragging indicator ring at 1.2rs */}
      {spin > 0.1 && (
        <FrameDraggingRing spin={spin} scale={SCALE} />
      )}

      {/* Round 8 — Photon sphere orbit with orbiting photon dot at 1.5rs */}
      <PhotonSphereOrbit scale={SCALE} />

      {/* Lensing explanation label */}
      <Html position={[0, -2, 0]} center style={{ pointerEvents: "none" }}>
        <div style={{ color: "#64748b", fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", background: "rgba(10,15,24,0.85)", padding: "3px 8px", borderRadius: "4px", whiteSpace: "nowrap", maxWidth: "320px", textAlign: "center" }}>
          Light bends near the event horizon — the distorted background is gravitational lensing (Einstein ring effect)
        </div>
      </Html>

      {/* Round 9 — Warning label when observer approaches event horizon */}
      {observerRs < 2 && (
        <Html position={[observerRs * SCALE, 1.2, 0]} center style={{ pointerEvents: "none" }}>
          <div style={{
            color: "#ef4444",
            fontSize: "11px",
            fontWeight: 700,
            fontFamily: "'JetBrains Mono', monospace",
            background: "rgba(239,68,68,0.15)",
            padding: "4px 10px",
            borderRadius: "4px",
            whiteSpace: "nowrap",
            border: "1px solid #ef4444",
            animation: "pulse 1s ease-in-out infinite alternate",
          }}>
            APPROACHING EVENT HORIZON
          </div>
          <style>{`@keyframes pulse { from { opacity: 0.5; } to { opacity: 1; } }`}</style>
        </Html>
      )}

      {/* Observer marker — color-coded by dilation severity */}
      <group ref={observerRef} position={[observerRs * SCALE, 0, 0]}>
        <mesh>
          <sphereGeometry args={[0.12, 16, 16]} />
          <meshBasicMaterial color={dilation > 0.8 ? "#34d399" : dilation > 0.5 ? "#fbbf24" : "#ef4444"} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshBasicMaterial color={dilation > 0.8 ? "#34d399" : dilation > 0.5 ? "#fbbf24" : "#ef4444"} transparent opacity={0.15} />
        </mesh>
        <Html position={[0, 0.4, 0]} center style={{ pointerEvents: "none" }}>
          <div style={{ color: dilation > 0.8 ? "#34d399" : dilation > 0.5 ? "#fbbf24" : "#ef4444", fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", background: "rgba(10,15,24,0.85)", padding: "2px 8px", borderRadius: "4px", whiteSpace: "nowrap", border: `1px solid ${dilation > 0.8 ? "#34d39930" : "#ef444430"}`, backdropFilter: "blur(4px)" }}>
            Observer ({observerRs.toFixed(1)}r{"\u209b"}) | d{"\u03C4"}/dt = {dilation.toFixed(4)}
          </div>
        </Html>
      </group>

      {/* Distance markers */}
      {[2, 3, 5, 10].map((r) => {
        const points: THREE.Vector3[] = [];
        for (let i = 0; i <= 64; i++) {
          const angle = (i / 64) * Math.PI * 2;
          points.push(
            new THREE.Vector3(
              Math.cos(angle) * r * SCALE,
              0,
              Math.sin(angle) * r * SCALE
            )
          );
        }
        return (
          <Line
            key={r}
            points={points}
            color="#1e293b"
            lineWidth={0.3}
            transparent
            opacity={0.3}
          />
        );
      })}
    </group>
  );
}

// Round 7 — Frame dragging ring that spins faster than accretion disk
function FrameDraggingRing({ spin, scale }: { spin: number; scale: number }) {
  const ringRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ringRef.current) {
      ringRef.current.rotation.z = clock.getElapsedTime() * spin * 2;
    }
  });
  return (
    <group>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.2 * scale, 0.015, 8, 64]} />
        <meshBasicMaterial color="#c084fc" transparent opacity={0.6} />
      </mesh>
      <Html position={[1.2 * scale, 0.3, 0]} center style={{ pointerEvents: "none" }}>
        <div style={{ color: "#c084fc", fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", background: "rgba(10,15,24,0.8)", padding: "1px 5px", borderRadius: "3px", whiteSpace: "nowrap" }}>
          Frame Dragging
        </div>
      </Html>
    </group>
  );
}

// Round 8 — Photon sphere orbit visualization at 1.5rs with orbiting photon dot
function PhotonSphereOrbit({ scale }: { scale: number }) {
  const dotRef = useRef<THREE.Mesh>(null);
  const radius = 1.5 * scale;

  // Generate dashed orbit ring points
  const dashPoints = useMemo(() => {
    const segments: THREE.Vector3[][] = [];
    const totalSegments = 24;
    for (let s = 0; s < totalSegments; s++) {
      if (s % 2 !== 0) continue; // skip every other segment for dashing
      const seg: THREE.Vector3[] = [];
      const startAngle = (s / totalSegments) * Math.PI * 2;
      const endAngle = ((s + 1) / totalSegments) * Math.PI * 2;
      for (let i = 0; i <= 8; i++) {
        const a = startAngle + (i / 8) * (endAngle - startAngle);
        seg.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
      }
      segments.push(seg);
    }
    return segments;
  }, [radius]);

  useFrame(({ clock }) => {
    if (dotRef.current) {
      const t = clock.getElapsedTime() * 3; // high speed for photon
      dotRef.current.position.x = Math.cos(t) * radius;
      dotRef.current.position.z = Math.sin(t) * radius;
    }
  });

  return (
    <group>
      {dashPoints.map((seg, i) => (
        <Line key={i} points={seg} color="#ffd54f" lineWidth={0.8} transparent opacity={0.4} />
      ))}
      <mesh ref={dotRef} position={[radius, 0, 0]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshBasicMaterial color="#fffde7" />
      </mesh>
    </group>
  );
}

function SliderControl({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={styles.slider}>
      <div style={styles.sliderLabel}>{label}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={styles.sliderInput}
      />
    </div>
  );
}

function dilationToColor(d: number): string {
  if (d > 0.9) return "#60a5fa";
  if (d > 0.7) return "#34d399";
  if (d > 0.5) return "#fbbf24";
  if (d > 0.3) return "#f97316";
  return "#ef4444";
}

function formatLarge(s: number): string {
  if (s < 1) return `${(s * 1e3).toFixed(2)} ms`;
  if (s < 3600) return `${s.toFixed(1)} s`;
  if (s < 86400) return `${(s / 3600).toFixed(1)} hr`;
  if (s < 86400 * 365.25) return `${(s / 86400).toFixed(1)} days`;
  return `${(s / (86400 * 365.25)).toFixed(1)} yr`;
}

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
  slider: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  sliderLabel: {
    fontSize: "11px",
    color: "#94a3b8",
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
  profileSection: {
    background: "#0f172a",
    borderRadius: "6px",
    padding: "8px",
  },
  profileTitle: {
    fontSize: "11px",
    color: "#64748b",
    letterSpacing: "0.5px",
    marginBottom: "4px",
  },
  svg: {
    width: "100%",
    height: "auto",
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
