//! Spacetime metric implementations for time dilation calculations.
//!
//! Supports Schwarzschild (non-rotating), Kerr (rotating), weak-field,
//! and FLRW (cosmological) metrics.

use crate::constants::C2;

/// Result of a time dilation calculation.
/// The factor represents dτ/dt: the ratio of proper time to coordinate time.
/// - factor = 1.0 means no dilation (flat spacetime at rest)
/// - factor < 1.0 means time runs slower (deeper in gravity well or faster motion)
/// - factor → 0.0 at event horizon
#[derive(Debug, Clone, Copy)]
pub struct DilationFactor {
    /// dτ/dt — proper time rate relative to coordinate time
    pub factor: f64,
}

impl DilationFactor {
    pub fn new(factor: f64) -> Self {
        Self { factor: factor.max(0.0) }
    }

    /// Seconds lost per year relative to a distant observer at rest
    pub fn seconds_lost_per_year(&self) -> f64 {
        (1.0 - self.factor) * crate::constants::SECONDS_PER_YEAR
    }

    /// Fractional frequency shift (positive = blueshift toward observer at infinity)
    pub fn fractional_shift(&self) -> f64 {
        1.0 - self.factor
    }

    /// Time elapsed for this observer when coordinate time dt passes
    pub fn proper_time(&self, dt: f64) -> f64 {
        self.factor * dt
    }

    /// Differential aging: how much MORE time passes for observer A vs observer B
    /// over a coordinate time interval dt. Positive means A ages more.
    pub fn differential_aging(a: DilationFactor, b: DilationFactor, dt: f64) -> f64 {
        (a.factor - b.factor) * dt
    }
}

// ─── Schwarzschild Metric ───────────────────────────────────────────────────
// For non-rotating, spherically symmetric mass.
// ds² = -(1 - rₛ/r)c²dt² + dr²/(1 - rₛ/r) + r²dΩ²

/// Schwarzschild time dilation for a stationary observer at radial coordinate r.
///
/// dτ/dt = √(1 - rₛ/r) = √(1 - 2GM/rc²)
///
/// # Arguments
/// * `gm` - Gravitational parameter GM (m³/s²)
/// * `r` - Radial coordinate from center of mass (m). Must be > rₛ.
///
/// # Returns
/// `DilationFactor` where factor ∈ (0, 1]. Returns 0 if r ≤ rₛ.
pub fn schwarzschild_stationary(gm: f64, r: f64) -> DilationFactor {
    let rs = 2.0 * gm / C2;
    if r <= rs {
        return DilationFactor::new(0.0);
    }
    DilationFactor::new((1.0 - rs / r).sqrt())
}

/// Schwarzschild time dilation for an observer in circular orbit at radius r.
///
/// dτ/dt = √(1 - 3rₛ/2r)
///
/// Valid for r > 3rₛ/2 (innermost stable circular orbit for massive particles is 3rₛ).
pub fn schwarzschild_circular_orbit(gm: f64, r: f64) -> DilationFactor {
    let rs = 2.0 * gm / C2;
    let arg = 1.0 - 1.5 * rs / r;
    if arg <= 0.0 {
        return DilationFactor::new(0.0);
    }
    DilationFactor::new(arg.sqrt())
}

/// Schwarzschild time dilation for a radially moving observer.
///
/// dτ/dt = √(1 - rₛ/r - (dr/dt)²/((1 - rₛ/r)c²))
///
/// This accounts for both gravitational dilation and radial velocity.
pub fn schwarzschild_radial(gm: f64, r: f64, dr_dt: f64) -> DilationFactor {
    let rs = 2.0 * gm / C2;
    if r <= rs {
        return DilationFactor::new(0.0);
    }
    let g = 1.0 - rs / r;
    let arg = g - (dr_dt * dr_dt) / (g * C2);
    if arg <= 0.0 {
        return DilationFactor::new(0.0);
    }
    DilationFactor::new(arg.sqrt())
}

// ─── Weak-Field Approximation ───────────────────────────────────────────────
// For v << c and GM/rc² << 1 (e.g., solar system).
// dτ ≈ dt(1 - v²/2c² - GM/rc²)

/// Combined gravitational + velocity time dilation in the weak-field limit.
///
/// dτ/dt ≈ 1 - Φ/c² - v²/(2c²)
///
/// where Φ = -GM/r is the Newtonian gravitational potential.
///
/// This is the standard formula used for GPS relativistic corrections.
///
/// # Arguments
/// * `gm` - Gravitational parameter GM (m³/s²)
/// * `r` - Distance from center of mass (m)
/// * `v` - Speed of observer (m/s)
pub fn weak_field(gm: f64, r: f64, v: f64) -> DilationFactor {
    let gravitational = gm / (r * C2);
    let kinematic = (v * v) / (2.0 * C2);
    DilationFactor::new(1.0 - gravitational - kinematic)
}

/// Weak-field dilation relative to Earth's geoid (the GPS convention).
///
/// Uses Φ₀/c² = L_G as the reference potential.
/// Δf/f = -Φ/c² + Φ₀/c² - v²/(2c²)
///
/// # Arguments
/// * `gm` - GM of the central body (m³/s²)
/// * `r` - Distance from center (m)
/// * `v` - Speed (m/s)
pub fn weak_field_vs_geoid(gm: f64, r: f64, v: f64) -> DilationFactor {
    let phi_over_c2 = gm / (r * C2);
    let phi0_over_c2 = crate::constants::PHI0_OVER_C2;
    let kinematic = (v * v) / (2.0 * C2);
    // Factor relative to geoid clock
    DilationFactor::new(1.0 - phi_over_c2 + phi0_over_c2 - kinematic)
}

// ─── Multi-Body Weak-Field ──────────────────────────────────────────────────

/// Weak-field dilation accounting for multiple gravitating bodies.
///
/// Φ_total = Σᵢ -GMᵢ/rᵢ
///
/// # Arguments
/// * `contributions` - Slice of (GM, distance_from_body) pairs
/// * `v` - Total speed of observer in coordinate frame (m/s)
pub fn weak_field_multi(contributions: &[(f64, f64)], v: f64) -> DilationFactor {
    let gravitational: f64 = contributions
        .iter()
        .map(|&(gm, r)| gm / (r * C2))
        .sum();
    let kinematic = (v * v) / (2.0 * C2);
    DilationFactor::new(1.0 - gravitational - kinematic)
}

// ─── Kerr Metric ────────────────────────────────────────────────────────────
// For rotating mass in Boyer-Lindquist coordinates.
// ds² = -(1 - rₛr/Σ)c²dt² + (Σ/Δ)dr² + Σdθ²
//       + (r² + a² + rₛra²sin²θ/Σ)sin²θ dφ²
//       - 2rₛra sin²θ/Σ · c dt dφ

/// Kerr metric time dilation for a stationary observer (dr=dθ=dφ=0).
///
/// g_tt = -(1 - rₛr/Σ)
/// dτ/dt = √(1 - rₛr/Σ)
///
/// # Arguments
/// * `gm` - Gravitational parameter GM (m³/s²)
/// * `a_star` - Dimensionless spin parameter a* = Jc/(GM²), range [0, 1]
/// * `r` - Boyer-Lindquist radial coordinate (m)
/// * `theta` - Polar angle from spin axis (radians)
pub fn kerr_stationary(gm: f64, a_star: f64, r: f64, theta: f64) -> DilationFactor {
    let rs = 2.0 * gm / C2;
    // Physical spin parameter a = a* × GM/c²  (has dimensions of length)
    let a = a_star * gm / C2;
    let sigma = r * r + a * a * theta.cos().powi(2);

    if sigma == 0.0 {
        return DilationFactor::new(0.0); // ring singularity
    }

    let arg = 1.0 - rs * r / sigma;
    if arg <= 0.0 {
        return DilationFactor::new(0.0); // inside ergosphere
    }

    DilationFactor::new(arg.sqrt())
}

/// Kerr metric event horizon radii.
///
/// r± = rₛ/2 ± √(rₛ²/4 - a²)
///
/// Returns (r_outer, r_inner) or None if a > rₛ/2 (naked singularity).
pub fn kerr_horizons(gm: f64, a_star: f64) -> Option<(f64, f64)> {
    let rs = 2.0 * gm / C2;
    let a = a_star * gm / C2;
    let discriminant = rs * rs / 4.0 - a * a;
    if discriminant < 0.0 {
        return None;
    }
    let sqrt_d = discriminant.sqrt();
    Some((rs / 2.0 + sqrt_d, rs / 2.0 - sqrt_d))
}

/// Kerr metric ergosphere radius at given polar angle.
///
/// rE = rₛ/2 + √(rₛ²/4 - a²cos²θ)
pub fn kerr_ergosphere(gm: f64, a_star: f64, theta: f64) -> f64 {
    let rs = 2.0 * gm / C2;
    let a = a_star * gm / C2;
    let discriminant = rs * rs / 4.0 - a * a * theta.cos().powi(2);
    if discriminant < 0.0 {
        return 0.0;
    }
    rs / 2.0 + discriminant.sqrt()
}

// ─── FLRW / Cosmological ───────────────────────────────────────────────────

/// Cosmological time dilation between emitter and observer.
///
/// Δt_obs = (1 + z) × Δt_emit
///
/// # Arguments
/// * `z` - Cosmological redshift (0 = here/now, 1 = light from when universe was half current size)
pub fn cosmological_dilation(z: f64) -> f64 {
    1.0 + z
}

/// Scale factor a(t) at redshift z.
///
/// a = 1/(1+z), normalized so a(now) = 1.
pub fn scale_factor_from_redshift(z: f64) -> f64 {
    1.0 / (1.0 + z)
}

/// Hubble parameter H(z) for flat ΛCDM.
///
/// H(z) = H₀ √(Ωₘ(1+z)³ + Ωᵣ(1+z)⁴ + ΩΛ)
pub fn hubble_parameter(z: f64) -> f64 {
    use crate::constants::{H0_SI, OMEGA_LAMBDA, OMEGA_MATTER, OMEGA_RADIATION};
    let zp1 = 1.0 + z;
    let matter = OMEGA_MATTER * zp1.powi(3);
    let radiation = OMEGA_RADIATION * zp1.powi(4);
    let dark_energy = OMEGA_LAMBDA;
    H0_SI * (matter + radiation + dark_energy).sqrt()
}

/// Lookback time to redshift z (seconds), using numerical integration.
///
/// t_lookback = ∫₀ᶻ dz' / ((1+z') H(z'))
///
/// Uses simple trapezoidal integration with 1000 steps.
pub fn lookback_time(z: f64) -> f64 {
    let n = 1000;
    let dz = z / n as f64;
    let mut sum = 0.0;
    for i in 0..n {
        let z0 = i as f64 * dz;
        let z1 = (i + 1) as f64 * dz;
        let f0 = 1.0 / ((1.0 + z0) * hubble_parameter(z0));
        let f1 = 1.0 / ((1.0 + z1) * hubble_parameter(z1));
        sum += 0.5 * (f0 + f1) * dz;
    }
    sum
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::*;

    #[test]
    fn test_schwarzschild_earth_surface() {
        let df = schwarzschild_stationary(GM_EARTH, R_EARTH);
        // dτ/dt at Earth surface ≈ 1 - GM/(Rc²) ≈ 1 - 6.95e-10
        // (Schwarzschild gives 1 - rₛ/(2R) to first order = 1 - GM/(Rc²))
        let shift = 1.0 - df.factor;
        assert!(shift > 6.9e-10 && shift < 7.0e-10,
            "Earth surface dilation shift: got {:.4e}, expected ~6.95e-10", shift);
    }

    #[test]
    fn test_schwarzschild_sun_surface() {
        let df = schwarzschild_stationary(GM_SUN, R_SUN);
        // dτ/dt at Sun surface ≈ 1 - 2.12e-6
        let shift = 1.0 - df.factor;
        assert!((shift - 2.12e-6).abs() < 0.1e-6,
            "Sun surface dilation shift: got {:.3e}, expected ~2.12e-6", shift);
    }

    #[test]
    fn test_schwarzschild_at_horizon() {
        let gm = GM_SUN;
        let rs = schwarzschild_radius(gm);
        let df = schwarzschild_stationary(gm, rs);
        assert_eq!(df.factor, 0.0, "Dilation at horizon should be 0");
    }

    #[test]
    fn test_schwarzschild_inside_horizon() {
        let gm = GM_SUN;
        let rs = schwarzschild_radius(gm);
        let df = schwarzschild_stationary(gm, rs * 0.5);
        assert_eq!(df.factor, 0.0, "Dilation inside horizon should clamp to 0");
    }

    #[test]
    fn test_weak_field_matches_schwarzschild() {
        // For Earth surface (weak field), both should agree closely
        let schwarz = schwarzschild_stationary(GM_EARTH, R_EARTH);
        let weak = weak_field(GM_EARTH, R_EARTH, 0.0);
        assert!((schwarz.factor - weak.factor).abs() < 1e-18,
            "Weak field should match Schwarzschild for Earth: {} vs {}",
            schwarz.factor, weak.factor);
    }

    #[test]
    fn test_gps_net_dilation() {
        // GPS relativistic correction is computed relative to the geoid.
        // Gravitational: GM/R_earth/c² - GM/a_gps/c² = GM(1/R - 1/a)/c²
        // Velocity (SR): -v²/(2c²) for satellite orbital speed
        //
        // The geoid clock already accounts for Earth's gravitational potential,
        // so we compute the RELATIVE rate difference.
        let grav_shift = GM_EARTH / C2 * (1.0 / R_EARTH - 1.0 / GPS_SEMI_MAJOR);
        let vel_shift = -(GPS_VELOCITY * GPS_VELOCITY) / (2.0 * C2);
        let net_shift = grav_shift + vel_shift;
        let us_per_day = net_shift * SECONDS_PER_DAY * 1e6;

        // Should be ~+38.6 μs/day (satellite clock faster)
        assert!(us_per_day > 35.0 && us_per_day < 42.0,
            "GPS net dilation: got {:.1} μs/day, expected ~38.6", us_per_day);
    }

    #[test]
    fn test_kerr_reduces_to_schwarzschild() {
        // Kerr with a*=0 should equal Schwarzschild
        let gm = GM_SUN;
        let r = 10.0 * schwarzschild_radius(gm);
        let theta = std::f64::consts::FRAC_PI_2;

        let kerr = kerr_stationary(gm, 0.0, r, theta);
        let schwarz = schwarzschild_stationary(gm, r);

        assert!((kerr.factor - schwarz.factor).abs() < 1e-14,
            "Kerr(a=0) should match Schwarzschild: {} vs {}", kerr.factor, schwarz.factor);
    }

    #[test]
    fn test_cosmological_dilation_z1() {
        let factor = cosmological_dilation(1.0);
        assert_eq!(factor, 2.0, "z=1 should give 2x time dilation");
    }

    #[test]
    fn test_cosmological_dilation_z10() {
        let factor = cosmological_dilation(10.0);
        assert_eq!(factor, 11.0, "z=10 should give 11x time dilation");
    }

    #[test]
    fn test_hubble_parameter_z0() {
        let h = hubble_parameter(0.0);
        // H₀ ≈ 2.184e-18 s⁻¹
        assert!((h - H0_SI).abs() / H0_SI < 0.01,
            "H(z=0) should equal H₀: got {:.3e}, expected {:.3e}", h, H0_SI);
    }

    #[test]
    fn test_lookback_time_z0() {
        let t = lookback_time(0.0);
        assert!(t.abs() < 1.0, "Lookback time at z=0 should be ~0");
    }

    #[test]
    fn test_lookback_time_z1() {
        // Lookback time to z=1 should be ~7.9 Gyr ≈ 2.5e17 s
        let t = lookback_time(1.0);
        let gyr = t / (SECONDS_PER_YEAR * 1e9);
        assert!(gyr > 7.0 && gyr < 9.0,
            "Lookback time to z=1: got {:.1} Gyr, expected ~7.9", gyr);
    }

    #[test]
    fn test_neutron_star_dilation() {
        // 1.4 solar mass, 10 km radius
        let gm = 1.4 * GM_SUN;
        let r = 10_000.0;
        let df = schwarzschild_stationary(gm, r);
        // Should be significantly dilated, roughly 0.7-0.8
        assert!(df.factor > 0.5 && df.factor < 0.9,
            "Neutron star surface dilation: got {:.4}, expected ~0.76", df.factor);
    }
}
