//! Frame-to-frame time transformations.
//!
//! Given a time reading in one observer's frame, compute the corresponding
//! time in another observer's frame.

use crate::metric::DilationFactor;
use crate::observer::Observer;

/// Transform a duration measured by observer A into the equivalent duration
/// experienced by observer B.
///
/// If A is deeper in a gravity well (slower clock), a 1-second interval
/// for A corresponds to MORE than 1 second for B.
///
/// # Arguments
/// * `dt_a` - Duration in seconds as measured by observer A
/// * `a` - Observer A (source frame)
/// * `b` - Observer B (target frame)
///
/// # Returns
/// Duration in seconds as experienced by observer B
pub fn transform_duration(dt_a: f64, a: &Observer, b: &Observer) -> f64 {
    let da = a.dilation_weak_field();
    let db = b.dilation_weak_field();

    if db.factor == 0.0 {
        return f64::INFINITY; // B is at a horizon
    }

    // Both dilation factors are relative to coordinate time:
    //   dτ_A = da.factor × dt_coord
    //   dτ_B = db.factor × dt_coord
    // So: dt_coord = dτ_A / da.factor
    // And: dτ_B = db.factor × dτ_A / da.factor
    dt_a * db.factor / da.factor
}

/// Compute how much coordinate time passes for a given proper time interval
/// of an observer.
///
/// dt_coord = dτ / (dilation_factor)
pub fn proper_to_coordinate(d_tau: f64, observer: &Observer) -> f64 {
    let df = observer.dilation_weak_field();
    if df.factor == 0.0 {
        return f64::INFINITY;
    }
    d_tau / df.factor
}

/// Compute how much proper time an observer experiences for a given
/// coordinate time interval.
///
/// dτ = dt_coord × dilation_factor
pub fn coordinate_to_proper(dt_coord: f64, observer: &Observer) -> f64 {
    let df = observer.dilation_weak_field();
    dt_coord * df.factor
}

/// Accumulated time difference between two observers over a coordinate time interval.
///
/// Returns (proper_time_a, proper_time_b, difference).
/// Positive difference means A aged more.
pub fn accumulated_difference(
    coord_time: f64,
    a: &Observer,
    b: &Observer,
) -> (f64, f64, f64) {
    let da = a.dilation_weak_field();
    let db = b.dilation_weak_field();
    let tau_a = da.factor * coord_time;
    let tau_b = db.factor * coord_time;
    (tau_a, tau_b, tau_a - tau_b)
}

/// The "twin paradox" calculator: compute differential aging for a round trip.
///
/// One twin stays on the surface of `body`, the other travels at `travel_speed`
/// for `coord_travel_time` seconds of coordinate time.
///
/// Returns (stay_home_aging, traveler_aging, difference).
pub fn twin_paradox(
    home: &Observer,
    travel_speed: f64,
    coord_travel_time: f64,
) -> (f64, f64, f64) {
    let home_factor = home.dilation_weak_field();

    // Traveler: SR dilation only (ignoring gravitational contribution for simplicity)
    let v2_c2 = (travel_speed * travel_speed) / crate::constants::C2;
    let travel_factor = DilationFactor::new((1.0 - v2_c2).sqrt());

    let tau_home = home_factor.factor * coord_travel_time;
    let tau_travel = travel_factor.factor * coord_travel_time;

    (tau_home, tau_travel, tau_home - tau_travel)
}

/// Cosmological frame transform: time at redshift z mapped to local time.
///
/// A process taking Δt seconds at redshift z appears to take (1+z)×Δt seconds
/// to a local observer at z=0.
pub fn cosmological_time_transform(dt_emitted: f64, z: f64) -> f64 {
    dt_emitted * (1.0 + z)
}

/// Inverse cosmological transform: from observed duration to emitted duration.
pub fn cosmological_time_inverse(dt_observed: f64, z: f64) -> f64 {
    dt_observed / (1.0 + z)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::body;

    #[test]
    fn test_transform_duration_same_observer() {
        let earth = body::earth();
        let obs = Observer::on_surface(&earth);
        let dt = transform_duration(1.0, &obs, &obs);
        assert!((dt - 1.0).abs() < 1e-15, "Same observer: {}", dt);
    }

    #[test]
    fn test_transform_duration_gps() {
        use crate::constants::*;

        // Earth-centered frame: surface vs GPS orbit
        let surface = Observer {
            name: "Earth Surface".into(),
            position: [0.0, 0.0, 0.0],
            velocity: [0.0, 0.0, 0.0],
            body_name: "Earth".into(),
            radial_distance: R_EARTH,
            body_gm: GM_EARTH,
        };
        let gps = Observer {
            name: "GPS".into(),
            position: [0.0, 0.0, 0.0],
            velocity: [0.0, GPS_VELOCITY, 0.0],
            body_name: "Earth".into(),
            radial_distance: GPS_SEMI_MAJOR,
            body_gm: GM_EARTH,
        };

        // 1 day on Earth surface → GPS clock reads more (it runs faster)
        let dt_gps = transform_duration(86_400.0, &surface, &gps);
        let diff_us = (dt_gps - 86_400.0) * 1e6;
        // GPS clock accumulates ~38.6 μs more per day
        assert!(diff_us > 35.0 && diff_us < 42.0,
            "GPS transform: got {:.1} μs difference, expected ~38.6", diff_us);
    }

    #[test]
    fn test_cosmological_transform_z1() {
        let dt = cosmological_time_transform(1.0, 1.0);
        assert_eq!(dt, 2.0);
    }

    #[test]
    fn test_cosmological_roundtrip() {
        let dt_emit = 5.0;
        let z = 2.5;
        let dt_obs = cosmological_time_transform(dt_emit, z);
        let dt_back = cosmological_time_inverse(dt_obs, z);
        assert!((dt_back - dt_emit).abs() < 1e-12);
    }

    #[test]
    fn test_twin_paradox_at_half_c() {
        let earth = body::earth();
        let home = Observer::on_surface(&earth);
        let v = 0.5 * crate::constants::C; // 50% speed of light
        let coord_time = 86_400.0 * 365.25; // 1 year of coordinate time

        let (_stay, travel, diff) = twin_paradox(&home, v, coord_time);
        // Traveler at 0.5c: γ = 1/√(1-0.25) = 1/√0.75 ≈ 1.1547
        // So traveler ages ≈ 0.866 × coord_time
        let gamma_inv = (1.0 - 0.25_f64).sqrt(); // ≈ 0.866
        let expected_travel = gamma_inv * coord_time;
        assert!((travel - expected_travel).abs() / expected_travel < 0.01,
            "Traveler aging: got {:.2}, expected {:.2}", travel, expected_travel);
        assert!(diff > 0.0, "Stay-home twin should age more");
    }
}
