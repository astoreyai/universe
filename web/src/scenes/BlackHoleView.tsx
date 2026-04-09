import React, { useRef, useMemo, useState, forwardRef } from "react";
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

const GravLens = forwardRef<GravitationalLensEffect, { center?: [number, number]; strength?: number; radius?: number }>(
  function GravLens({ center = [0.5, 0.5], strength = 1.0, radius = 0.4 }, ref) {
    const effect = useMemo(() => new GravitationalLensEffect({ center, strength, radius }), []);

    // Update uniforms when props change
    useMemo(() => {
      effect.uniforms.get("uCenter")!.value.set(center[0], center[1]);
      effect.uniforms.get("uStrength")!.value = strength;
      effect.uniforms.get("uRadius")!.value = radius;
    }, [effect, center, strength, radius]);

    return <primitive ref={ref} object={effect} dispose={null} />;
  }
);

// Component that tracks the black hole position and updates lensing
function LensingTracker({ mass }: { mass: number }) {
  const { camera, size } = useThree();
  const effectRef = useRef<GravitationalLensEffect>(null);
  const bhPos = useMemo(() => new THREE.Vector3(0, 0, 0), []);
  const projected = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    if (!effectRef.current) return;
    projected.copy(bhPos).project(camera);
    const cx = (projected.x + 1) / 2;
    const cy = 1 - (projected.y + 1) / 2; // flip Y for UV space
    effectRef.current.uniforms.get("uCenter")!.value.set(cx, cy);
  });

  const strength = Math.min(mass * 0.5, 8.0);

  return <GravLens ref={effectRef} strength={strength} radius={0.5} />;
}

export function BlackHoleView() {
  const [mass, setMass] = useState(10); // solar masses
  const [spin, setSpin] = useState(0.0); // dimensionless spin a*
  const [observerR, setObserverR] = useState(6); // in units of rs

  const gmSun = engine.constants.gmSun();
  const gm = mass * gmSun;
  const rs = (2 * gm) / C2;

  const dilation = useMemo(() => {
    const r = observerR * rs;
    if (spin === 0) {
      return engine.schwarzschildDilation(gm, r);
    } else {
      return engine.kerrDilation(gm, spin, r, Math.PI / 2);
    }
  }, [mass, spin, observerR, gm, rs]);

  const secondsLost = engine.secondsLostPerYear(dilation);

  // Dilation profile: dilation vs radius from 1.1rs to 20rs
  const profile = useMemo(() => {
    const points: { r: number; d: number }[] = [];
    for (let i = 0; i <= 100; i++) {
      const rRs = 1.05 + (i / 100) * 19;
      const r = rRs * rs;
      const d =
        spin === 0
          ? engine.schwarzschildDilation(gm, r)
          : engine.kerrDilation(gm, spin, r, Math.PI / 2);
      points.push({ r: rRs, d });
    }
    return points;
  }, [mass, spin, gm, rs]);

  return (
    <div style={styles.container} className="scene-layout">
      <div style={styles.canvasWrapper} className="scene-canvas">
        <Canvas
          camera={{ position: [0, 8, 12], fov: 50 }}
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
          />
          <DreiStars radius={60} depth={50} count={3000} factor={2.5} saturation={0} fade speed={0.3} />
          <EffectComposer>
            <LensingTracker mass={mass} />
            <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} intensity={1.2} mipmapBlur />
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

        <div style={styles.results}>
          <div style={styles.resultRow}>
            <span>Schwarzschild radius</span>
            <span>{(rs / 1000).toFixed(1)} km</span>
          </div>
          <div style={styles.resultRow}>
            <span>Observer distance</span>
            <span>{((observerR * rs) / 1000).toFixed(1)} km</span>
          </div>
          <div style={styles.resultRow}>
            <span>d{"\u03C4"}/dt</span>
            <span
              style={{ color: dilation < 0.5 ? "#ef4444" : "#34d399" }}
            >
              {dilation.toFixed(6)}
            </span>
          </div>
          <div style={styles.resultRow}>
            <span>Lost/year vs {"\u221E"}</span>
            <span>{formatLarge(secondsLost)}</span>
          </div>
          <div style={styles.resultRow}>
            <span>Time factor</span>
            <span>
              {dilation > 0.001
                ? `${(1 / dilation).toFixed(2)}\u00D7 slower`
                : "\u221E (frozen)"}
            </span>
          </div>
          {spin > 0 && (
            <div style={styles.resultRow}>
              <span>Ergosphere (eq.)</span>
              <span>{((2 * gm) / C2 / 1000).toFixed(1)} km</span>
            </div>
          )}
        </div>

        <div style={styles.profileSection}>
          <div style={styles.profileTitle}>Dilation Profile</div>
          <svg viewBox="0 0 260 120" style={styles.svg}>
            {/* Grid */}
            {[0.25, 0.5, 0.75, 1.0].map((v) => (
              <g key={v}>
                <line
                  x1={30}
                  y1={110 - v * 100}
                  x2={255}
                  y2={110 - v * 100}
                  stroke="#1e293b"
                  strokeWidth={0.5}
                />
                <text
                  x={2}
                  y={113 - v * 100}
                  fill="#475569"
                  fontSize={7}
                  fontFamily="monospace"
                >
                  {v.toFixed(2)}
                </text>
              </g>
            ))}
            {/* Curve */}
            <polyline
              fill="none"
              stroke="#60a5fa"
              strokeWidth={1.5}
              points={profile
                .map(
                  (p) =>
                    `${30 + ((p.r - 1.05) / 19) * 225},${110 - p.d * 100}`
                )
                .join(" ")}
            />
            {/* Observer marker */}
            <circle
              cx={30 + ((observerR - 1.05) / 19) * 225}
              cy={110 - dilation * 100}
              r={3}
              fill="#f59e0b"
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
            <text x={32} y={20} fill="#ef4444" fontSize={7} fontFamily="monospace">
              r{"\u209b"}
            </text>
            {/* X axis labels */}
            {[1, 5, 10, 15, 20].map((r) => (
              <text
                key={r}
                x={30 + ((r - 1.05) / 19) * 225}
                y={119}
                fill="#475569"
                fontSize={6}
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
}: {
  rs: number;
  spin: number;
  gm: number;
  observerRs: number;
}) {
  const accretionRef = useRef<THREE.Group>(null);
  const observerRef = useRef<THREE.Group>(null);

  // Scale: 1 unit = 1 rs
  const SCALE = 1;

  useFrame(({ clock }) => {
    if (accretionRef.current) {
      accretionRef.current.rotation.y = clock.getElapsedTime() * 0.3;
    }
  });

  // Dilation rings: show color-coded dilation at different radii
  const dilationRings = useMemo(() => {
    const rings: { radius: number; dilation: number }[] = [];
    for (let r = 1.5; r <= 10; r += 0.5) {
      const d = engine.schwarzschildDilation(gm, r * rs);
      rings.push({ radius: r, dilation: d });
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

      {/* Photon sphere glow (1.5 rₛ) — bright ring where light orbits */}
      <mesh>
        <sphereGeometry args={[1.5 * SCALE, 48, 48]} />
        <meshBasicMaterial color="#ff8f00" transparent opacity={0.06} />
      </mesh>
      {/* Photon ring — thin bright ring at 1.5rₛ */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.48 * SCALE, 1.52 * SCALE, 64]} />
        <meshBasicMaterial color="#ffd54f" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>

      {/* Accretion disk — temperature gradient (hot blue-white inner, cooler red outer) */}
      <group ref={accretionRef} rotation={[Math.PI * 0.08, 0, 0]}>
        {dilationRings.map((ring, i) => {
          const t = (ring.radius - 1.5) / 8.5; // 0=inner, 1=outer
          // Temperature color: white-blue (inner) → orange → dark red (outer)
          const tempColor = t < 0.2 ? "#c0d8ff" : t < 0.4 ? "#ffd54f" : t < 0.7 ? "#ff8f00" : "#cc3300";
          return (
            <mesh key={i} rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[ring.radius * SCALE, (ring.radius + 0.35) * SCALE, 96]} />
              <meshBasicMaterial color={tempColor} transparent opacity={0.15 + (1 - t) * 0.35} side={THREE.DoubleSide} />
            </mesh>
          );
        })}
        {/* Hot ISCO inner edge — brightest emission */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.5 * SCALE, 2.5 * SCALE, 96]} />
          <meshBasicMaterial color="#aaccff" transparent opacity={0.3} side={THREE.DoubleSide} />
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

      {/* Observer marker — pulsing golden sphere */}
      <group ref={observerRef} position={[observerRs * SCALE, 0, 0]}>
        <mesh>
          <sphereGeometry args={[0.12, 16, 16]} />
          <meshBasicMaterial color="#ffd54f" />
        </mesh>
        {/* Glow around observer */}
        <mesh>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshBasicMaterial color="#ffd54f" transparent opacity={0.15} />
        </mesh>
        <Html position={[0, 0.35, 0]} center style={{ pointerEvents: "none" }}>
          <div style={{ color: "#ffd54f", fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", background: "rgba(10,15,24,0.85)", padding: "2px 8px", borderRadius: "4px", whiteSpace: "nowrap", border: "1px solid #ffd54f30", backdropFilter: "blur(4px)" }}>
            Observer ({observerRs.toFixed(1)}r{"\u209b"})
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
};
