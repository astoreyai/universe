# Universe Clock

Relativistic multi-frame temporal system spanning planetary to cosmological scales.

## Architecture

- **engine/** — Rust crate: physics engine with Schwarzschild/Kerr/FLRW metrics, IAU time scales, Mars time
  - 11 solar system bodies (Sun through Pluto), neutron star, Sgr A*
  - 35 unit tests
- **web/** — React 19 + Vite + R3F frontend with WASM integration
  - 6 tabs: Time Scales (SVG), Dilation Map (3D spacetime), Solar System (3D), Black Hole (3D), Twin Paradox (3D), Cosmology (3D)
  - NASA texture maps for all 11 planets + Sun + Moon (13 textures)
  - 14 moons with real orbital inclinations (NASA/Wikipedia sources)
  - Curved spacetime embedding diagram (Dilation Map)
  - Minkowski worldline diagram (Twin Paradox)
  - Mobile responsive (breakpoints at 768px, 480px)
  - Keyboard nav: 1-6 switches tabs
  - ARIA accessibility: tablist/tab roles, aria-selected, prefers-reduced-motion
  - Per-tab accent colors, glassmorphism panels, custom scrollbars
- **py/** — Python validation scripts (astropy cross-check) [placeholder]

## Build

```bash
# Rust tests (35 tests)
cargo test

# WASM build (outputs to web/src/wasm-pkg/)
cd engine && wasm-pack build --target web --out-dir ../web/src/wasm-pkg

# Web dev server (port 3000)
cd web && npm run dev

# Web production build
cd web && npm run build

# Playwright E2E tests (requires dev server on :3000)
cd web && npx playwright test
```

## Deploy

GitHub Pages auto-deploys on push to `main` via `.github/workflows/deploy.yml`.
Live at: https://astoreyai.github.io/universe/

## Key Physics

- IAU time scales: UTC, TAI, TT, TCG, TCB, TDB with exact defining constants (L_G, L_B)
- Schwarzschild metric: stationary, circular orbit, radial motion
- Kerr metric: rotating black holes in Boyer-Lindquist coordinates
- FLRW metric: scale factor, Hubble parameter, lookback time, conformal time, age at redshift
- GPS validation: +38.6 μs/day net relativistic correction
- Mars: MSD/MTC computation from Unix time
- Planck 2018 ΛCDM: H₀=67.4, Ωₘ=0.315, ΩΛ=0.685

## Tab Features

| Tab | Visualization | Key Features |
|-----|--------------|--------------|
| Time Scales | SVG animated clocks | 3 tiers, glowing hands, rate bars, drift calculator, 1-min takeaway |
| Dilation Map | 3D curved spacetime | Deformable grid, gravity wells, body spheres, bloom, "Why It Matters" |
| Solar System | 3D R3F scene | NASA textures, 9+Pluto, 14 moons (clickable), asteroid/Kuiper belts, habitable zone, dilation glow, speed control |
| Black Hole | 3D R3F scene | Gravitational lensing shader, Keplerian accretion disk, jets, ergosphere, ISCO, photon orbit, log-scale profile, danger zone |
| Twin Paradox | 3D R3F scene | Minkowski worldline diagram, differential clocks, Lorentz contraction cubes, Doppler stars, relativistic callout |
| Cosmology | 3D R3F scene | Light cone with redshift gradient, milestone light rings, cosmic web particles, Hubble sphere, epoch slider, scale factor bar |

## Engine WASM Exports

Time: `getTimeRepresentations`, `getMTC`, `getMarsSolDate`
Dilation: `schwarzschildDilation`, `weakFieldDilation`, `kerrDilation`, `cosmologicalDilation`, `secondsLostPerYear`
Bodies: `getSolarSystemDilation`, `compareBodies`
Cosmology: `ageOfUniverseGyr`, `ageAtRedshiftGyr`, `lookbackTimeGyr`, `comovingDistanceGly`, `hubbleParameterKmSMpc`, `scaleFactorFromRedshift`, `observableUniverseRadiusGly`, `conformalTimeGyr`
Constants: `SPEED_OF_LIGHT`, `GM_EARTH`, `GM_SUN`, `R_EARTH`, `R_SUN`
