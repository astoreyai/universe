# Universe Clock

A relativistic multi-frame temporal system spanning planetary to cosmological scales. Built with a Rust physics engine compiled to WebAssembly and a React/Three.js frontend.

**[Live Demo](https://astoreyai.github.io/universe/)**

![License](https://img.shields.io/badge/license-MIT-blue)
![Rust](https://img.shields.io/badge/rust-1.75+-orange)
![Node](https://img.shields.io/badge/node-20+-green)

## What It Does

Universe Clock visualizes how time flows differently across the universe — from GPS satellite corrections to black hole event horizons to the expansion of the observable universe.

### Six Interactive Tabs

| Tab | What It Shows |
|-----|--------------|
| **Time Scales** | Six IAU time standards (UTC, TAI, TT, TCG, TCB, MTC) ticking at their actual differential rates with animated clock faces |
| **Dilation Map** | Gravitational time dilation across the solar system as a radial gravity-well chart with severity ranking |
| **Solar System** | 3D interactive solar system with NASA texture maps, 14 selectable moons, asteroid/Kuiper belts, habitable zone, time zone grids |
| **Black Hole** | Schwarzschild/Kerr black hole with gravitational lensing shader, temperature-gradient accretion disk, relativistic jets, photon orbits |
| **Twin Paradox** | Special relativity calculator with 3D visualization: differential clocks, Lorentz contraction, Doppler-shifted star field |
| **Cosmology** | Observable universe as a 3D spacetime light cone with redshift color gradient, epoch slider, cosmic web particle clustering |

### Key Physics

- **Schwarzschild metric** — stationary, circular orbit, and radial motion time dilation
- **Kerr metric** — rotating black holes with spin-dependent ISCO and ergosphere
- **FLRW metric** — cosmological scale factor, Hubble parameter, lookback time, conformal time
- **IAU time scales** — exact defining constants L_G and L_B for TCG/TCB
- **GPS validation** — reproduces the +38.6 μs/day net relativistic correction
- **Mars time** — Mars Sol Date and Mars Coordinated Time from Unix timestamps

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (stable toolchain)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/)
- [Node.js](https://nodejs.org/) 20+

### Build & Run

```bash
# Clone
git clone https://github.com/astoreyai/universe.git
cd universe

# Build the WASM physics engine
cd engine && wasm-pack build --target web --out-dir ../web/src/wasm-pkg && cd ..

# Install web dependencies
cd web && npm install

# Start dev server (http://localhost:3000)
npm run dev
```

### Run Tests

```bash
# Rust unit tests (35 tests)
cargo test

# Playwright E2E tests (requires dev server running)
cd web && npx playwright test
```

## Architecture

```
universe/
├── engine/                 # Rust physics engine
│   └── src/
│       ├── lib.rs          # Module root
│       ├── constants.rs    # Physical constants (CODATA 2018, IAU)
│       ├── body.rs         # 11 solar system bodies + extreme objects
│       ├── metric.rs       # Schwarzschild, Kerr, FLRW metrics
│       ├── observer.rs     # Observer state and reference frames
│       ├── timescale.rs    # IAU time scale conversions
│       ├── transform.rs    # Frame-to-frame transformations
│       ├── cosmo.rs        # Cosmological computations
│       └── wasm.rs         # WebAssembly bindings (20+ exports)
├── web/                    # React + Three.js frontend
│   ├── src/
│   │   ├── App.tsx         # Tab navigation, keyboard shortcuts
│   │   ├── engine/
│   │   │   └── wasm-bridge.ts  # Typed WASM interface
│   │   ├── components/
│   │   │   ├── ClockDashboard.tsx   # Time Scales (SVG)
│   │   │   ├── DilationTable.tsx    # Dilation Map (SVG)
│   │   │   └── CosmologyPanel.tsx   # Legacy (unused)
│   │   └── scenes/
│   │       ├── SolarSystemView.tsx   # Solar System (R3F)
│   │       ├── BlackHoleView.tsx     # Black Hole (R3F)
│   │       ├── TwinParadoxView.tsx   # Twin Paradox (R3F)
│   │       └── CosmicTimelineView.tsx # Cosmology (R3F)
│   ├── public/textures/    # NASA planet texture maps
│   └── tests/              # Playwright E2E tests
└── .github/workflows/
    └── deploy.yml          # GitHub Pages deployment
```

## Data Sources

- **Physical constants**: CODATA 2018, IAU 2000/2006 Resolutions
- **Planetary parameters**: NASA Planetary Fact Sheets, WGS84
- **Cosmological parameters**: Planck 2018 ΛCDM (H₀=67.4, Ωₘ=0.315, ΩΛ=0.685)
- **Moon orbital data**: NASA NSSDCA, Wikipedia (verified against primary sources)
- **Planet textures**: NASA Blue Marble, Solar System Scope (public domain / CC)
- **GPS corrections**: Ashby 2003 reference values
- **Mars timekeeping**: Allison & McEwen 2000

## License

MIT
