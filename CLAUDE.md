# Universe Clock

Relativistic multi-frame temporal system spanning planetary to cosmological scales.

## Architecture

- **engine/** — Rust crate: physics engine with Schwarzschild/Kerr/FLRW metrics, IAU time scales, Mars time
- **web/** — React + Vite + R3F frontend with WASM integration
  - 6 tabs: Time Scales, Dilation Map, Solar System (3D), Black Hole (3D), Twin Paradox, Cosmology (3D light cone)
- **py/** — Python validation scripts (astropy cross-check)

## Build

```bash
# Rust tests (35 tests)
cargo test

# WASM build (outputs to web/src/wasm-pkg/)
cd engine && wasm-pack build --target web --out-dir ../web/src/wasm-pkg

# Web dev
cd web && npm run dev

# Web production build
cd web && ./node_modules/.bin/vite build

# Playwright E2E tests (171 tests, requires dev server running on :3000)
cd web && npx playwright test
```

## Key Physics

- IAU time scales: UTC, TAI, TT, TCG, TCB, TDB with exact defining constants (L_G, L_B)
- Schwarzschild metric: stationary, circular orbit, radial motion
- Kerr metric: rotating black holes in Boyer-Lindquist coordinates
- FLRW metric: cosmological scale factor, Hubble parameter, lookback time, conformal time, age at redshift
- GPS validation: +38.6 μs/day net relativistic correction
- Mars: MSD/MTC computation from Unix time
- Planck 2018 ΛCDM: H₀=67.4, Ωₘ=0.315, ΩΛ=0.685

## Validation

35 Rust unit tests + 171 Playwright E2E tests covering:
- GPS relativistic corrections (38.6 μs/day ±tolerance)
- Mars Sol Date / MTC
- Schwarzschild dilation at Earth, Sun, neutron star surfaces
- Kerr→Schwarzschild reduction (a*=0)
- Cosmological dilation z=1→2×, z=10→11×
- Lookback time, comoving distance, observable universe radius (~46 Gly)
- Age of universe (~13.8 Gyr)
- IAU time scale offsets (TCG-TT, TCB-TT)
- Conformal time η(z) = d_C(z)/c relation
- New WASM exports: ageAtRedshiftGyr, scaleFactorFromRedshift, observableUniverseRadiusGly, conformalTimeGyr
- All 6 UI tabs render correctly with interactive elements
- 3D cosmic timeline: light cone, milestones, epoch slider, particle field, Hubble sphere toggle
- Live clocks tick, sliders respond, body selection works
