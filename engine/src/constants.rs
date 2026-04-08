//! Physical constants and IAU defining constants for relativistic time transformations.
//!
//! All values use SI units (meters, kilograms, seconds) unless noted.
//! Sources: CODATA 2018, IAU 2000/2006 Resolutions, NASA Planetary Fact Sheets.

// ─── Fundamental Constants ──────────────────────────────────────────────────

/// Speed of light in vacuum (m/s) — exact, SI definition
pub const C: f64 = 299_792_458.0;

/// Speed of light squared (m²/s²)
pub const C2: f64 = C * C;

/// Newtonian gravitational constant (m³ kg⁻¹ s⁻²) — CODATA 2018
pub const G: f64 = 6.674_30e-11;

// ─── IAU Defining Constants ─────────────────────────────────────────────────

/// L_G: Rate difference TT↔TCG — IAU 2000 Resolution B1.9
/// dTT/dTCG = 1 - L_G
pub const L_G: f64 = 6.969_290_134e-10;

/// L_B: Rate difference TDB↔TCB — IAU 2006 Resolution B3
/// TDB = TCB - L_B × (JD_TCB - T0) × 86400 + TDB0
pub const L_B: f64 = 1.550_519_768e-8;

/// TDB₀: Offset constant for TDB-TCB transformation (seconds)
pub const TDB0: f64 = -6.55e-5;

/// T₀: Reference epoch for TDB-TCB (Julian Date of 1977 Jan 1 00:00:00 TAI)
pub const T0_JD: f64 = 2_443_144.500_372_5;

/// TT - TAI offset (seconds) — exact by definition
pub const TT_TAI_OFFSET: f64 = 32.184;

// ─── Gravitational Parameters (GM, m³/s²) ──────────────────────────────────
// Using GM products directly avoids propagating G uncertainty.

/// GM of the Sun (m³/s²) — IAU 2015 nominal
pub const GM_SUN: f64 = 1.327_124_400_41e20;

/// GM of Earth (m³/s²) — WGS84 / EGM2008
pub const GM_EARTH: f64 = 3.986_004_418e14;

/// GM of Moon (m³/s²)
pub const GM_MOON: f64 = 4.902_800_066e12;

/// GM of Mars (m³/s²)
pub const GM_MARS: f64 = 4.282_837_14e13;

/// GM of Jupiter (m³/s²)
pub const GM_JUPITER: f64 = 1.266_865_349e17;

/// GM of Saturn (m³/s²)
pub const GM_SATURN: f64 = 3.793_120_749e16;

/// GM of Venus (m³/s²)
pub const GM_VENUS: f64 = 3.248_585_92e14;

/// GM of Mercury (m³/s²)
pub const GM_MERCURY: f64 = 2.203_209e13;

/// GM of Uranus (m³/s²)
pub const GM_URANUS: f64 = 5.793_939_e15;

/// GM of Neptune (m³/s²)
pub const GM_NEPTUNE: f64 = 6.836_527_e15;

// ─── Planetary Radii (meters) ───────────────────────────────────────────────

/// Earth equatorial radius (m) — WGS84
pub const R_EARTH: f64 = 6.378_137_0e6;

/// Mars equatorial radius (m)
pub const R_MARS: f64 = 3.396_2e6;

/// Moon mean radius (m)
pub const R_MOON: f64 = 1.737_4e6;

/// Sun radius (m) — IAU 2015 nominal
pub const R_SUN: f64 = 6.957_e8;

/// Jupiter equatorial radius (m)
pub const R_JUPITER: f64 = 7.149_2e7;

/// Saturn equatorial radius (m)
pub const R_SATURN: f64 = 6.026_8e7;

// ─── Earth-Specific Constants ───────────────────────────────────────────────

/// Earth rotation rate (rad/s)
pub const OMEGA_EARTH: f64 = 7.292_115_146_7e-5;

/// Earth J₂ zonal harmonic (dimensionless)
pub const J2_EARTH: f64 = 1.082_630_0e-3;

/// Effective gravitational potential on the geoid / c² (dimensionless)
/// Φ₀/c² = GM_Earth/(R_Earth × c²) (monopole approximation)
pub const PHI0_OVER_C2: f64 = 6.969_290_134e-10; // equals L_G by definition

// ─── GPS Constants ──────────────────────────────────────────────────────────

/// GPS satellite semi-major axis (m) — nominal
pub const GPS_SEMI_MAJOR: f64 = 2.656_175e7;

/// GPS satellite orbital velocity (m/s) — approximate circular
pub const GPS_VELOCITY: f64 = 3_874.0;

/// GPS nominal L1 frequency (Hz)
pub const GPS_F_NOMINAL: f64 = 10.23e6;

/// GPS transmitted frequency with relativistic offset (Hz)
pub const GPS_F_TRANSMITTED: f64 = 10.229_999_995_43e6;

/// Net relativistic frequency shift for GPS (dimensionless)
/// = gravitational blueshift + velocity redshift = +4.4649e-10
pub const GPS_NET_FRACTIONAL_SHIFT: f64 = 4.464_9e-10;

// ─── Mars Time Constants ────────────────────────────────────────────────────

/// Mars solar day (sol) in SI seconds
pub const MARS_SOL_SECONDS: f64 = 88_775.244;

/// Mars sidereal day in SI seconds
pub const MARS_SIDEREAL_DAY: f64 = 88_642.663;

/// Conversion factor: Earth days per Mars sol
pub const EARTH_DAYS_PER_SOL: f64 = 1.027_491_251_7;

/// MSD epoch (Julian Date in TT)
pub const MSD_EPOCH_JD_TT: f64 = 2_405_522.002_877_9;

/// MSD epoch for UTC-referred computation
pub const MSD_EPOCH_JD_UTC: f64 = 2_405_522.002_505_4;

/// MSD offset for Unix timestamp computation
pub const MSD_UNIX_OFFSET: f64 = 34_127.295_426_2;

// ─── Cosmological Parameters (Planck 2018 ΛCDM) ────────────────────────────

/// Hubble constant (km/s/Mpc) — Planck 2018
pub const H0_KM_S_MPC: f64 = 67.4;

/// Hubble constant in SI (s⁻¹)
/// H₀ = 67.4 km/s/Mpc × (1 Mpc = 3.0857e22 m)
pub const H0_SI: f64 = 2.184e-18;

/// Matter density parameter Ωₘ
pub const OMEGA_MATTER: f64 = 0.315;

/// Dark energy density parameter ΩΛ
pub const OMEGA_LAMBDA: f64 = 0.685;

/// Radiation density parameter Ωᵣ
pub const OMEGA_RADIATION: f64 = 9.1e-5;

/// Dark energy equation of state w₀
pub const W0_DARK_ENERGY: f64 = -1.03;

/// Age of the universe (seconds) — ~13.8 Gyr
pub const AGE_UNIVERSE_SECONDS: f64 = 4.354e17;

/// Megaparsec in meters
pub const MPC_METERS: f64 = 3.085_677_581_e22;

// ─── Schwarzschild Radii (meters) ───────────────────────────────────────────

/// Schwarzschild radius: rₛ = 2GM/c²
pub fn schwarzschild_radius(gm: f64) -> f64 {
    2.0 * gm / C2
}

// Precomputed for common bodies
/// Schwarzschild radius of the Sun (m) ≈ 2953 m
pub const RS_SUN: f64 = 2.0 * GM_SUN / C2;

/// Schwarzschild radius of Earth (m) ≈ 0.00887 m
pub const RS_EARTH: f64 = 2.0 * GM_EARTH / C2;

// ─── Unit Conversions ───────────────────────────────────────────────────────

/// Seconds per Julian day
pub const SECONDS_PER_DAY: f64 = 86_400.0;

/// Seconds per Julian year (365.25 days)
pub const SECONDS_PER_YEAR: f64 = 365.25 * SECONDS_PER_DAY;

/// Julian Date of Unix epoch (1970-01-01 12:00 TT)
pub const JD_UNIX_EPOCH: f64 = 2_440_587.5;

/// Julian Date of J2000.0 epoch (2000-01-01 12:00 TT)
pub const JD_J2000: f64 = 2_451_545.0;
