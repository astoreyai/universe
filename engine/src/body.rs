//! Celestial body definitions with physical parameters.

use serde::{Deserialize, Serialize};

use crate::constants::*;

/// A celestial body with physical parameters needed for time dilation calculations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CelestialBody {
    /// Human-readable name
    pub name: String,
    /// Gravitational parameter GM (m³/s²) — used instead of mass to avoid G uncertainty
    pub gm: f64,
    /// Mean equatorial radius (m)
    pub radius: f64,
    /// Dimensionless spin parameter a* = Jc/(GM²) for Kerr metric (0 for Schwarzschild)
    pub spin: f64,
    /// Current position in reference frame [x, y, z] (m)
    pub position: [f64; 3],
    /// Current velocity in reference frame [vx, vy, vz] (m/s)
    pub velocity: [f64; 3],
    /// Orbital semi-major axis around parent (m), 0 if root
    pub semi_major_axis: f64,
    /// Orbital eccentricity
    pub eccentricity: f64,
}

impl CelestialBody {
    /// Schwarzschild radius rₛ = 2GM/c² (m)
    pub fn schwarzschild_radius(&self) -> f64 {
        schwarzschild_radius(self.gm)
    }

    /// Surface gravitational acceleration g = GM/r² (m/s²)
    pub fn surface_gravity(&self) -> f64 {
        self.gm / (self.radius * self.radius)
    }

    /// Orbital velocity for circular orbit at given radius (m/s)
    pub fn circular_velocity(&self, r: f64) -> f64 {
        (self.gm / r).sqrt()
    }

    /// Escape velocity at given radius (m/s)
    pub fn escape_velocity(&self, r: f64) -> f64 {
        (2.0 * self.gm / r).sqrt()
    }

    /// Speed magnitude from velocity vector (m/s)
    pub fn speed(&self) -> f64 {
        let [vx, vy, vz] = self.velocity;
        (vx * vx + vy * vy + vz * vz).sqrt()
    }

    /// Distance from origin (m)
    pub fn distance(&self) -> f64 {
        let [x, y, z] = self.position;
        (x * x + y * y + z * z).sqrt()
    }
}

// ─── Predefined Solar System Bodies ─────────────────────────────────────────

/// The Sun — center of the solar system
pub fn sun() -> CelestialBody {
    CelestialBody {
        name: "Sun".into(),
        gm: GM_SUN,
        radius: R_SUN,
        spin: 0.0, // negligible for time dilation
        position: [0.0, 0.0, 0.0],
        velocity: [0.0, 0.0, 0.0],
        semi_major_axis: 0.0,
        eccentricity: 0.0,
    }
}

/// Earth
pub fn earth() -> CelestialBody {
    CelestialBody {
        name: "Earth".into(),
        gm: GM_EARTH,
        radius: R_EARTH,
        spin: 0.0,
        position: [1.496e11, 0.0, 0.0], // ~1 AU
        velocity: [0.0, 29_783.0, 0.0],  // ~29.78 km/s orbital
        semi_major_axis: 1.496e11,
        eccentricity: 0.0167,
    }
}

/// Mars
pub fn mars() -> CelestialBody {
    CelestialBody {
        name: "Mars".into(),
        gm: GM_MARS,
        radius: R_MARS,
        spin: 0.0,
        position: [2.279e11, 0.0, 0.0], // ~1.524 AU
        velocity: [0.0, 24_077.0, 0.0],  // ~24.08 km/s orbital
        semi_major_axis: 2.279e11,
        eccentricity: 0.0934,
    }
}

/// Moon
pub fn moon() -> CelestialBody {
    CelestialBody {
        name: "Moon".into(),
        gm: GM_MOON,
        radius: R_MOON,
        spin: 0.0,
        position: [1.496e11 + 3.844e8, 0.0, 0.0], // Earth + lunar distance
        velocity: [0.0, 29_783.0 + 1_022.0, 0.0],  // Earth orbital + lunar orbital
        semi_major_axis: 3.844e8,
        eccentricity: 0.0549,
    }
}

/// Jupiter
pub fn jupiter() -> CelestialBody {
    CelestialBody {
        name: "Jupiter".into(),
        gm: GM_JUPITER,
        radius: R_JUPITER,
        spin: 0.0,
        position: [7.785e11, 0.0, 0.0], // ~5.203 AU
        velocity: [0.0, 13_070.0, 0.0],  // ~13.07 km/s
        semi_major_axis: 7.785e11,
        eccentricity: 0.0489,
    }
}

/// Mercury
pub fn mercury() -> CelestialBody {
    CelestialBody {
        name: "Mercury".into(),
        gm: GM_MERCURY,
        radius: 2.4397e6,
        spin: 0.0,
        position: [5.791e10, 0.0, 0.0],
        velocity: [0.0, 47_362.0, 0.0],
        semi_major_axis: 5.791e10,
        eccentricity: 0.2056,
    }
}

/// Venus
pub fn venus() -> CelestialBody {
    CelestialBody {
        name: "Venus".into(),
        gm: GM_VENUS,
        radius: 6.0518e6,
        spin: 0.0,
        position: [1.082e11, 0.0, 0.0],
        velocity: [0.0, 35_020.0, 0.0],
        semi_major_axis: 1.082e11,
        eccentricity: 0.0067,
    }
}

/// Saturn
pub fn saturn() -> CelestialBody {
    CelestialBody {
        name: "Saturn".into(),
        gm: GM_SATURN,
        radius: R_SATURN,
        spin: 0.0,
        position: [1.4335e12, 0.0, 0.0],
        velocity: [0.0, 9_680.0, 0.0],
        semi_major_axis: 1.4335e12,
        eccentricity: 0.0565,
    }
}

/// Returns all predefined solar system bodies.
pub fn solar_system() -> Vec<CelestialBody> {
    vec![
        sun(),
        mercury(),
        venus(),
        earth(),
        moon(),
        mars(),
        jupiter(),
        saturn(),
    ]
}

/// A typical neutron star (for extreme dilation demonstrations)
pub fn neutron_star() -> CelestialBody {
    CelestialBody {
        name: "Neutron Star (typical)".into(),
        gm: 1.4 * GM_SUN, // 1.4 solar masses
        radius: 10_000.0,  // 10 km
        spin: 0.0,
        position: [0.0, 0.0, 0.0],
        velocity: [0.0, 0.0, 0.0],
        semi_major_axis: 0.0,
        eccentricity: 0.0,
    }
}

/// Sagittarius A* — supermassive black hole at galactic center
pub fn sgr_a_star() -> CelestialBody {
    CelestialBody {
        name: "Sgr A*".into(),
        gm: 4.0e6 * GM_SUN, // ~4 million solar masses
        radius: 0.0,         // singularity (use Schwarzschild radius for visualization)
        spin: 0.5,           // estimated spin parameter
        position: [0.0, 0.0, 0.0],
        velocity: [0.0, 0.0, 0.0],
        semi_major_axis: 0.0,
        eccentricity: 0.0,
    }
}
