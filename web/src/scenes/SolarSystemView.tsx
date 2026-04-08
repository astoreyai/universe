import React, { useRef, useMemo, useState } from "react";
import { Canvas, useFrame, ThreeEvent, extend } from "@react-three/fiber";
import { OrbitControls, Line, Html, Stars as DreiStars } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { engine } from "../engine/wasm-bridge";

// ─── Data ───────────────────────────────────────────────────────────────────

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
  name: string; au: number; period: number; rKm: number;
  color: string; rings: boolean; df: number; lost: number;
}

// ─── Procedural planet GLSL ────────────────────────────────────────────────

const NOISE_GLSL = `
  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 perm(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  float noise(vec3 p){
    vec3 a=floor(p);vec3 d=p-a;d=d*d*(3.0-2.0*d);
    vec4 b=a.xxyy+vec4(0.0,1.0,0.0,1.0);
    vec4 k1=perm(b.xyxy);vec4 k2=perm(k1.xyxy+b.zzww);
    vec4 c=k2+a.zzzz;vec4 k3=perm(c);vec4 k4=perm(c+1.0);
    vec4 o1=fract(k3*(1.0/41.0));vec4 o2=fract(k4*(1.0/41.0));
    vec4 o3=o2*d.z+o1*(1.0-d.z);vec2 o4=o3.yw*d.x+o3.xz*(1.0-d.x);
    return o4.y*d.y+o4.x*(1.0-d.y);
  }
  float fbm(vec3 p){float v=0.0;float a=0.5;for(int i=0;i<5;i++){v+=a*noise(p);p*=2.0;a*=0.5;}return v;}
`;

function planetVertexShader() {
  return `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    void main(){
      vUv=uv; vNormal=normalize(normalMatrix*normal);
      vWorldPos=(modelMatrix*vec4(position,1.0)).xyz;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
    }
  `;
}

function planetFragmentShader(planetType: string) {
  return `
    ${NOISE_GLSL}
    uniform float uTime;
    uniform vec3 uSunDir;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPos;

    void main(){
      float lat=(vUv.y-0.5)*3.14159;
      float lon=vUv.x*6.28318;
      vec3 samplePos=vec3(cos(lat)*cos(lon),sin(lat),cos(lat)*sin(lon));
      float n=fbm(samplePos*${planetType === "Jupiter" || planetType === "Saturn" ? "3.0" : "6.0"});
      float n2=fbm(samplePos*12.0+vec3(42.0));

      vec3 col;
      ${getPlanetColorGLSL(planetType)}

      // Day/night terminator
      float sunDot=dot(vNormal, uSunDir);
      float dayFactor=smoothstep(-0.15,0.2,sunDot);

      // Night side darkening
      vec3 nightCol=col*0.08;
      ${planetType === "Earth" ? `
        // City lights on night side
        float cities=step(0.72,fbm(samplePos*30.0))*step(0.3,fbm(samplePos*15.0));
        nightCol+=vec3(1.0,0.85,0.4)*cities*0.6;
      ` : ""}

      col=mix(nightCol,col,dayFactor);

      // Subtle rim light
      float rim=1.0-max(dot(vNormal,normalize(cameraPosition-vWorldPos)),0.0);
      col+=vec3(0.2,0.3,0.5)*pow(rim,3.0)*0.15;

      gl_FragColor=vec4(col,1.0);
    }
  `;
}

function getPlanetColorGLSL(type: string): string {
  switch (type) {
    case "Earth": return `
      float ocean=smoothstep(0.42,0.48,n);
      vec3 land=mix(vec3(0.15,0.35,0.08),vec3(0.5,0.42,0.25),n2);
      vec3 oceanCol=mix(vec3(0.05,0.15,0.4),vec3(0.1,0.25,0.55),n2*0.5);
      col=mix(oceanCol,land,ocean);
      // Polar ice
      float polar=smoothstep(0.85,0.95,abs(lat)/1.57);
      col=mix(col,vec3(0.9,0.92,0.95),polar);
      // Clouds
      float cloud=smoothstep(0.5,0.65,fbm(samplePos*8.0+uTime*0.02));
      col=mix(col,vec3(0.95),cloud*0.6);
    `;
    case "Mars": return `
      vec3 base=mix(vec3(0.6,0.2,0.05),vec3(0.75,0.35,0.15),n);
      vec3 dark=vec3(0.3,0.12,0.05);
      col=mix(base,dark,smoothstep(0.4,0.55,n2));
      // Polar ice caps
      float polar=smoothstep(0.8,0.95,abs(lat)/1.57);
      col=mix(col,vec3(0.85,0.88,0.9),polar*0.8);
      // Olympus Mons region (dark spot)
      float feature=smoothstep(0.65,0.7,fbm(samplePos*4.0+vec3(10.0)));
      col=mix(col,vec3(0.4,0.15,0.05),feature*0.3);
    `;
    case "Jupiter": return `
      // Horizontal bands
      float band=sin(lat*12.0+n*2.0)*0.5+0.5;
      vec3 light=vec3(0.85,0.75,0.55);
      vec3 dark=vec3(0.6,0.35,0.15);
      col=mix(dark,light,band);
      // Great red spot region
      float spot=1.0-smoothstep(0.0,0.15,length(vec2(lon-2.5,lat+0.4)));
      col=mix(col,vec3(0.75,0.25,0.1),spot*0.7);
      // Turbulence in bands
      col+=vec3(n2*0.1-0.05);
    `;
    case "Saturn": return `
      float band=sin(lat*10.0+n*1.5)*0.5+0.5;
      vec3 light=vec3(0.9,0.82,0.6);
      vec3 dark=vec3(0.7,0.6,0.4);
      col=mix(dark,light,band);
      col+=vec3(n2*0.08-0.04);
    `;
    case "Venus": return `
      // Thick atmosphere with subtle cloud bands
      float cloud=fbm(samplePos*4.0+uTime*0.01);
      col=mix(vec3(0.8,0.65,0.3),vec3(0.9,0.8,0.5),cloud);
      col+=vec3(0.05,0.02,0.0)*fbm(samplePos*8.0);
    `;
    case "Mercury": return `
      // Cratered gray surface
      float crater=fbm(samplePos*15.0);
      col=mix(vec3(0.35,0.33,0.3),vec3(0.55,0.52,0.48),n);
      // Dark crater floors
      col*=0.8+crater*0.4;
      col-=vec3(0.1)*smoothstep(0.6,0.65,fbm(samplePos*25.0));
    `;
    default: return `col=vec3(0.5);`;
  }
}

// ─── Time zone / grid overlay shader ───────────────────────────────────────

const gridVertexShader = `
  varying vec2 vUv;
  void main(){
    vUv=uv;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
  }
`;

const gridFragmentShader = `
  uniform float uTimeZones;
  uniform vec3 uGridColor;
  varying vec2 vUv;
  void main(){
    float lon=vUv.x*6.28318;
    float lat=(vUv.y-0.5)*3.14159;

    // Longitude lines (time zones)
    float tzInterval=6.28318/uTimeZones;
    float lonLine=1.0-smoothstep(0.008,0.012,abs(mod(lon+tzInterval*0.5,tzInterval)-tzInterval*0.5));

    // Latitude lines (every 30 degrees)
    float latInterval=3.14159/6.0;
    float latLine=1.0-smoothstep(0.008,0.012,abs(mod(lat+latInterval*0.5,latInterval)-latInterval*0.5));

    // Equator (thicker)
    float equator=1.0-smoothstep(0.01,0.018,abs(lat));

    float grid=max(max(lonLine,latLine),equator)*0.5;
    gl_FragColor=vec4(uGridColor,grid);
  }
`;

// ─── Root ───────────────────────────────────────────────────────────────────

export function SolarSystemView() {
  const [selected, setSelected] = useState("Earth");
  const [hovered, setHovered] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);

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
            <Planet key={p.name} d={p} selected={selected === p.name} hovered={hovered === p.name} refDf={refDf} showGrid={showGrid} onClick={() => setSelected(p.name)} onHover={setHovered} />
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
              <Row l="Time zones" v={getTimeZoneCount(selP.name).toString()} />
            </div>
          ) : null}
        </div>

        <label style={S.toggle}>
          <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
          <span>Time Zone Grid</span>
        </label>

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
      <mesh ref={ref} onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(); }} onPointerEnter={() => onHover("Sun")} onPointerLeave={() => onHover(null)}>
        <sphereGeometry args={[SUN_R, 48, 48]} />
        <meshBasicMaterial color="#ffd54f" />
      </mesh>
      <mesh ref={glowRef}>
        <sphereGeometry args={[SUN_R * 1.3, 32, 32]} />
        <meshBasicMaterial color="#ffab00" transparent opacity={0.12} />
      </mesh>
      <mesh>
        <sphereGeometry args={[SUN_R * 1.8, 32, 32]} />
        <meshBasicMaterial color="#ff6f00" transparent opacity={0.04} />
      </mesh>
      <pointLight position={[0, 0, 0]} intensity={3} color="#fff3e0" distance={100} decay={1.5} />
      {selected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[SUN_R * 1.5, SUN_R * 1.6, 48]} />
          <meshBasicMaterial color="#ffd54f" transparent opacity={0.3} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

// ─── Planet with procedural shader + grid ──────────────────────────────────

function Planet({ d, selected, hovered, refDf, showGrid, onClick, onHover }: {
  d: PData; selected: boolean; hovered: boolean; refDf: number; showGrid: boolean;
  onClick: () => void; onHover: (n: string | null) => void;
}) {
  const gRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const orbR = d.au * AU;
  const sz = Math.max(d.rKm * PLANET_SCALE, MIN_R);
  const ddiff = d.df - refDf;
  const dColor = ddiff > 0 ? "#34d399" : "#f87171";
  const tzCount = getTimeZoneCount(d.name);

  const planetMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: planetVertexShader(),
    fragmentShader: planetFragmentShader(d.name),
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    },
  }), [d.name]);

  const gridMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: gridVertexShader,
    fragmentShader: gridFragmentShader,
    uniforms: {
      uTimeZones: { value: tzCount },
      uGridColor: { value: new THREE.Color(d.name === "Earth" ? "#60a5fa" : d.name === "Mars" ? "#ff6b35" : "#ffffff") },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [d.name, tzCount]);

  useFrame(({ clock }) => {
    if (gRef.current) {
      const a = (clock.getElapsedTime() * TIME_SPEED) / d.period + d.au * 1.5;
      gRef.current.position.x = Math.cos(a) * orbR;
      gRef.current.position.z = Math.sin(a) * orbR;

      // Update sun direction for day/night
      const worldPos = new THREE.Vector3();
      gRef.current.getWorldPosition(worldPos);
      const sunDir = worldPos.negate().normalize();
      planetMat.uniforms.uSunDir.value.copy(sunDir);
    }
    planetMat.uniforms.uTime.value = clock.getElapsedTime();
  });

  return (
    <group ref={gRef}>
      {/* Planet body with procedural shader */}
      <mesh
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(); }}
        onPointerEnter={() => onHover(d.name)}
        onPointerLeave={() => onHover(null)}
      >
        <sphereGeometry args={[sz, 64, 64]} />
        <primitive object={planetMat} attach="material" />
      </mesh>

      {/* Time zone grid overlay */}
      {showGrid && (
        <mesh>
          <sphereGeometry args={[sz * 1.002, 64, 64]} />
          <primitive object={gridMat} attach="material" />
        </mesh>
      )}

      {/* Atmosphere glow */}
      <mesh>
        <sphereGeometry args={[sz * (d.name === "Venus" ? 1.12 : 1.06), 32, 32]} />
        <meshBasicMaterial
          color={d.name === "Earth" ? "#4a90d9" : d.name === "Venus" ? "#e8c87a" : d.name === "Mars" ? "#c1440e" : d.color}
          transparent
          opacity={d.name === "Venus" ? 0.15 : d.name === "Earth" ? 0.08 : 0.04}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Saturn rings with bands */}
      {d.rings && (
        <group rotation={[Math.PI * 0.45, 0, 0]}>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i}>
              <ringGeometry args={[sz * (1.3 + i * 0.22), sz * (1.5 + i * 0.22), 128]} />
              <meshBasicMaterial
                color={i % 2 === 0 ? "#d4b87a" : "#c8a87a"}
                transparent
                opacity={0.35 - i * 0.05}
                side={THREE.DoubleSide}
              />
            </mesh>
          ))}
        </group>
      )}

      {/* Selection ring */}
      {selected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[sz * 1.5, sz * 1.65, 48]} />
          <meshBasicMaterial color={d.color} transparent opacity={0.4} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Hover/selection highlight */}
      {(selected || hovered) && (
        <mesh>
          <sphereGeometry args={[sz * 1.01, 32, 32]} />
          <meshBasicMaterial color={d.color} transparent opacity={selected ? 0.08 : 0.04} />
        </mesh>
      )}

      {/* Label */}
      {(selected || hovered) && (
        <Html position={[0, sz + 0.35, 0]} center style={{ pointerEvents: "none" }}>
          <div style={{ color: "#f1f5f9", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", background: "rgba(15,23,42,0.85)", padding: "3px 8px", borderRadius: "4px", border: `1px solid ${d.color}50`, backdropFilter: "blur(4px)", whiteSpace: "nowrap" }}>
            <div style={{ fontWeight: 700, marginBottom: "1px" }}>{d.name}</div>
            <div style={{ color: dColor, fontSize: "10px" }}>
              {ddiff >= 0 ? "+" : ""}{(ddiff * 86400 * 1e6).toFixed(2)} {"\u03BCs/day"}
            </div>
            {showGrid && <div style={{ color: "#64748b", fontSize: "9px" }}>{tzCount} time zones</div>}
          </div>
        </Html>
      )}
    </group>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function getTimeZoneCount(name: string): number {
  switch (name) {
    case "Earth": return 24;
    case "Mars": return 24; // MTC uses 24 Martian hours
    case "Jupiter": return 12;
    case "Saturn": return 12;
    case "Venus": return 1; // extremely slow rotation
    case "Mercury": return 6;
    default: return 12;
  }
}

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
  toggle: { display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#94a3b8", cursor: "pointer" },
  comp: { display: "flex", flexDirection: "column", gap: "4px" },
  compHdr: { fontSize: "11px", color: "#64748b", letterSpacing: "0.5px", marginBottom: "2px" },
  compRow: { display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "2px 0", borderBottom: "1px solid #0a0f18" },
};
