//! Observer state and reference frame definitions.

use serde::{Deserialize, Serialize};

use crate::body::CelestialBody;
use crate::metric::{self, DilationFactor};

/// An observer's state: where they are, how fast they're moving, and what
/// gravitational field they're in.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Observer {
    /// Human-readable name
    pub name: String,
    /// Position in coordinate frame [x, y, z] (m)
    pub position: [f64; 3],
    /// Velocity in coordinate frame [vx, vy, vz] (m/s)
    pub velocity: [f64; 3],
    /// The celestial body this observer is on or orbiting
    pub body_name: String,
    /// Distance from center of the body (m)
    pub radial_distance: f64,
    /// GM of the body (m³/s²)
    pub body_gm: f64,
}

impl Observer {
    /// Create an observer on the surface of a celestial body.
    pub fn on_surface(body: &CelestialBody) -> Self {
        Self {
            name: format!("Surface of {}", body.name),
            position: body.position,
            velocity: body.velocity,
            body_name: body.name.clone(),
            radial_distance: body.radius,
            body_gm: body.gm,
        }
    }

    /// Create an observer in circular orbit at a given altitude above the body surface.
    pub fn in_orbit(body: &CelestialBody, altitude: f64) -> Self {
        let r = body.radius + altitude;
        let v_orbit = body.circular_velocity(r);
        Self {
            name: format!("Orbit around {} at {:.0} km", body.name, altitude / 1000.0),
            position: body.position,
            velocity: [body.velocity[0], body.velocity[1] + v_orbit, body.velocity[2]],
            body_name: body.name.clone(),
            radial_distance: r,
            body_gm: body.gm,
        }
    }

    /// Create an observer at a specific radial distance from a body (e.g., near a black hole).
    pub fn at_distance(body: &CelestialBody, r: f64) -> Self {
        Self {
            name: format!("At {:.0} m from {}", r, body.name),
            position: body.position,
            velocity: [0.0, 0.0, 0.0],
            body_name: body.name.clone(),
            radial_distance: r,
            body_gm: body.gm,
        }
    }

    /// Speed magnitude (m/s).
    pub fn speed(&self) -> f64 {
        let [vx, vy, vz] = self.velocity;
        (vx * vx + vy * vy + vz * vz).sqrt()
    }

    /// Compute the time dilation factor for this observer using weak-field approximation.
    /// This is appropriate for solar system bodies (v << c, GM/rc² << 1).
    pub fn dilation_weak_field(&self) -> DilationFactor {
        metric::weak_field(self.body_gm, self.radial_distance, self.speed())
    }

    /// Compute dilation using Schwarzschild metric (stationary observer only — ignores velocity).
    pub fn dilation_schwarzschild(&self) -> DilationFactor {
        metric::schwarzschild_stationary(self.body_gm, self.radial_distance)
    }

    /// Compute dilation accounting for multiple gravitating bodies.
    ///
    /// Each entry in `additional_bodies` is (GM, distance_from_this_observer).
    /// The observer's primary body is always included.
    pub fn dilation_multi_body(&self, additional_bodies: &[(f64, f64)]) -> DilationFactor {
        let mut contributions = vec![(self.body_gm, self.radial_distance)];
        contributions.extend_from_slice(additional_bodies);
        metric::weak_field_multi(&contributions, self.speed())
    }
}

/// Compare two observers: compute differential aging over a given coordinate time interval.
pub fn differential_aging(a: &Observer, b: &Observer, coord_time_seconds: f64) -> f64 {
    let da = a.dilation_weak_field();
    let db = b.dilation_weak_field();
    DilationFactor::differential_aging(da, db, coord_time_seconds)
}

/// Describe the time relationship between two observers in human-readable form.
pub fn describe_comparison(a: &Observer, b: &Observer) -> String {
    let da = a.dilation_weak_field();
    let db = b.dilation_weak_field();
    let diff_per_day = DilationFactor::differential_aging(da, db, 86_400.0);

    if diff_per_day.abs() < 1e-15 {
        format!("{} and {} experience effectively identical time flow", a.name, b.name)
    } else if diff_per_day > 0.0 {
        format!(
            "{} ages {:.3e} seconds MORE per day than {}",
            a.name, diff_per_day, b.name
        )
    } else {
        format!(
            "{} ages {:.3e} seconds LESS per day than {}",
            a.name, -diff_per_day, b.name
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::body;

    #[test]
    fn test_earth_surface_observer() {
        let earth = body::earth();
        let obs = Observer::on_surface(&earth);
        assert_eq!(obs.radial_distance, earth.radius);
        assert_eq!(obs.body_gm, earth.gm);
    }

    #[test]
    fn test_gps_orbit_observer() {
        let earth = body::earth();
        let altitude = crate::constants::GPS_SEMI_MAJOR - earth.radius;
        let obs = Observer::in_orbit(&earth, altitude);
        assert!((obs.radial_distance - crate::constants::GPS_SEMI_MAJOR).abs() < 1.0);
    }

    #[test]
    fn test_gps_vs_earth_differential_aging() {
        // For Earth-centered comparison, use Earth's GM with geocentric velocities.
        // Surface observer: v≈0 (or rotation speed, but small), at r=R_Earth
        // GPS satellite: v≈3874 m/s, at r=26561 km
        use crate::constants::*;

        let surface = Observer {
            name: "Earth Surface".into(),
            position: [0.0, 0.0, 0.0],
            velocity: [0.0, 0.0, 0.0], // geocentric: effectively stationary
            body_name: "Earth".into(),
            radial_distance: R_EARTH,
            body_gm: GM_EARTH,
        };
        let gps = Observer {
            name: "GPS Satellite".into(),
            position: [0.0, 0.0, 0.0],
            velocity: [0.0, GPS_VELOCITY, 0.0],
            body_name: "Earth".into(),
            radial_distance: GPS_SEMI_MAJOR,
            body_gm: GM_EARTH,
        };

        let diff = differential_aging(&gps, &surface, 86_400.0);
        let us = diff * 1e6;
        // GPS clock runs FASTER than surface clock by ~38.6 μs/day
        assert!(us > 35.0 && us < 42.0,
            "GPS-Earth differential: got {:.1} μs/day, expected ~38.6", us);
    }

    #[test]
    fn test_describe_comparison() {
        let earth = body::earth();
        let surface = Observer::on_surface(&earth);
        let mars = body::mars();
        let mars_surface = Observer::on_surface(&mars);
        let desc = describe_comparison(&surface, &mars_surface);
        assert!(!desc.is_empty());
    }
}
