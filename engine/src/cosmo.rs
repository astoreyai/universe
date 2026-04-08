//! Cosmological computations: scale factor, Hubble parameter, redshift, and
//! Universal Cosmic Time (UCT).

use crate::constants::*;

/// Compute the age of the universe at a given redshift z (seconds).
///
/// Uses numerical integration of the Friedmann equation for flat ΛCDM:
/// t(z) = ∫_z^∞ dz' / ((1+z') H(z'))
///
/// Approximated by integrating from z to z_max=1100 (CMB) with 10000 steps.
pub fn age_at_redshift(z: f64) -> f64 {
    let z_max = 1100.0; // CMB last scattering
    if z >= z_max {
        return 0.0;
    }
    let n = 10_000;
    let dz = (z_max - z) / n as f64;
    let mut sum = 0.0;
    for i in 0..n {
        let z0 = z + i as f64 * dz;
        let z1 = z + (i + 1) as f64 * dz;
        let f0 = integrand(z0);
        let f1 = integrand(z1);
        sum += 0.5 * (f0 + f1) * dz;
    }
    sum
}

fn integrand(z: f64) -> f64 {
    let zp1 = 1.0 + z;
    let h = H0_SI * (OMEGA_MATTER * zp1.powi(3) + OMEGA_RADIATION * zp1.powi(4) + OMEGA_LAMBDA).sqrt();
    1.0 / (zp1 * h)
}

/// Current age of the universe (z=0) in seconds.
pub fn age_now() -> f64 {
    age_at_redshift(0.0)
}

/// Current age of the universe in gigayears.
pub fn age_now_gyr() -> f64 {
    age_now() / (SECONDS_PER_YEAR * 1e9)
}

/// Universal Cosmic Time (UCT): proper time since the Big Bang for a
/// comoving observer, at the current epoch.
///
/// This is our project-defined "universal" time reference — the clock
/// of a fundamental observer in the CMB rest frame.
pub fn uct_now() -> f64 {
    age_now()
}

/// UCT at a given cosmological redshift z.
pub fn uct_at_redshift(z: f64) -> f64 {
    age_at_redshift(z)
}

/// Comoving distance to redshift z (meters).
///
/// d_C = c ∫₀ᶻ dz' / H(z')
pub fn comoving_distance(z: f64) -> f64 {
    let n = 1000;
    let dz = z / n as f64;
    let mut sum = 0.0;
    for i in 0..n {
        let z0 = i as f64 * dz;
        let z1 = (i + 1) as f64 * dz;
        let h0 = H0_SI * (OMEGA_MATTER * (1.0 + z0).powi(3) + OMEGA_RADIATION * (1.0 + z0).powi(4) + OMEGA_LAMBDA).sqrt();
        let h1 = H0_SI * (OMEGA_MATTER * (1.0 + z1).powi(3) + OMEGA_RADIATION * (1.0 + z1).powi(4) + OMEGA_LAMBDA).sqrt();
        let f0 = C / h0;
        let f1 = C / h1;
        sum += 0.5 * (f0 + f1) * dz;
    }
    sum
}

/// Proper (physical) distance to redshift z at the current epoch (meters).
///
/// d_proper = a(t_now) × d_comoving = d_comoving (since a(now) = 1)
pub fn proper_distance(z: f64) -> f64 {
    comoving_distance(z)
}

/// Luminosity distance (meters).
///
/// d_L = (1 + z) × d_C
pub fn luminosity_distance(z: f64) -> f64 {
    (1.0 + z) * comoving_distance(z)
}

/// Angular diameter distance (meters).
///
/// d_A = d_C / (1 + z)
pub fn angular_diameter_distance(z: f64) -> f64 {
    comoving_distance(z) / (1.0 + z)
}

/// Observable universe radius (comoving distance to z≈1100, the CMB).
pub fn observable_universe_radius() -> f64 {
    comoving_distance(1100.0)
}

/// Conformal time from redshift z to the present epoch (seconds).
///
/// η(z) = ∫₀ᶻ dz' / H(z')
///
/// In conformal coordinates, null geodesics are 45° lines: Δη = Δχ/c.
/// This is the key quantity for light cone geometry in spacetime diagrams.
/// Note: η(z) = comoving_distance(z) / c by construction (same integrand).
pub fn conformal_time_from_redshift(z: f64) -> f64 {
    comoving_distance(z) / C
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_age_now() {
        let age_gyr = age_now_gyr();
        // Should be ~13.8 Gyr
        assert!(age_gyr > 13.0 && age_gyr < 14.5,
            "Age of universe: got {:.2} Gyr, expected ~13.8", age_gyr);
    }

    #[test]
    fn test_age_at_z1() {
        let age = age_at_redshift(1.0);
        let gyr = age / (SECONDS_PER_YEAR * 1e9);
        // At z=1, universe was ~5.9 Gyr old
        assert!(gyr > 5.0 && gyr < 7.0,
            "Age at z=1: got {:.2} Gyr, expected ~5.9", gyr);
    }

    #[test]
    fn test_comoving_distance_z1() {
        let d = comoving_distance(1.0);
        let gly = d / (C * SECONDS_PER_YEAR * 1e9);
        // Comoving distance to z=1 ≈ 10.8 Gly
        assert!(gly > 9.0 && gly < 12.0,
            "Comoving distance to z=1: got {:.1} Gly, expected ~10.8", gly);
    }

    #[test]
    fn test_conformal_time_relation() {
        // Conformal time η(z) = comoving_distance(z) / c by definition
        let z = 1.0;
        let eta = conformal_time_from_redshift(z);
        let d_c = comoving_distance(z);
        let eta_from_dc = d_c / C;
        assert!((eta - eta_from_dc).abs() < 1.0,
            "Conformal time should equal d_C/c: got {:.3e} vs {:.3e}", eta, eta_from_dc);
        // η(z=1) should be ~10.8 Gly / c ≈ 1.02e18 seconds
        let eta_gyr = eta / (SECONDS_PER_YEAR * 1e9);
        assert!(eta_gyr > 9.0 && eta_gyr < 12.0,
            "Conformal time to z=1: got {:.1} Gyr, expected ~10.8", eta_gyr);
    }

    #[test]
    fn test_observable_universe() {
        let r = observable_universe_radius();
        let gly = r / (C * SECONDS_PER_YEAR * 1e9);
        // Observable universe radius ≈ 46.5 Gly
        assert!(gly > 40.0 && gly < 50.0,
            "Observable radius: got {:.1} Gly, expected ~46.5", gly);
    }
}
