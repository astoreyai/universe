//! WebAssembly bindings for the Universe Clock engine.
//!
//! Exposes key functions to JavaScript via wasm-bindgen.

use wasm_bindgen::prelude::*;

use crate::body;
use crate::constants;
use crate::cosmo;
use crate::metric;
use crate::observer::Observer;
use crate::timescale;
use crate::transform;

// ─── Time Scale Functions ───────────────────────────────────────────────────

/// Get all time representations for a Unix timestamp (UTC seconds).
/// Returns a JSON object with UTC, TAI, TT, TCG offset, TCB offset, MSD, MTC.
#[wasm_bindgen(js_name = "getTimeRepresentations")]
pub fn get_time_representations(unix_secs: f64) -> JsValue {
    let rep = timescale::TimeRepresentations::from_unix(unix_secs);
    serde_wasm_bindgen::to_value(&TimeReprJs {
        unix_utc: rep.unix_utc,
        jd_utc: rep.jd_utc,
        jd_tai: rep.jd_tai,
        jd_tt: rep.jd_tt,
        tcg_minus_tt_s: rep.tcg_minus_tt_s,
        tcb_minus_tt_s: rep.tcb_minus_tt_s,
        mars_sol_date: rep.mars_sol_date,
        mtc_hours: rep.mtc_hours,
    })
    .unwrap()
}

#[derive(serde::Serialize)]
struct TimeReprJs {
    unix_utc: f64,
    jd_utc: f64,
    jd_tai: f64,
    jd_tt: f64,
    tcg_minus_tt_s: f64,
    tcb_minus_tt_s: f64,
    mars_sol_date: f64,
    mtc_hours: f64,
}

/// Get Mars Coordinated Time (MTC) as "HH:MM:SS" from a Unix timestamp.
#[wasm_bindgen(js_name = "getMTC")]
pub fn get_mtc(unix_secs: f64) -> String {
    let msd = timescale::mars_sol_date(unix_secs, timescale::CURRENT_TAI_UTC);
    let (h, m, s) = timescale::mtc_hms(msd);
    format!("{:02}:{:02}:{:02}", h, m, s)
}

/// Get the Mars Sol Date for a Unix timestamp.
#[wasm_bindgen(js_name = "getMarsSolDate")]
pub fn get_mars_sol_date(unix_secs: f64) -> f64 {
    timescale::mars_sol_date(unix_secs, timescale::CURRENT_TAI_UTC)
}

// ─── Dilation Functions ─────────────────────────────────────────────────────

/// Schwarzschild time dilation factor (dτ/dt) for a stationary observer.
#[wasm_bindgen(js_name = "schwarzschildDilation")]
pub fn schwarzschild_dilation(gm: f64, r: f64) -> f64 {
    metric::schwarzschild_stationary(gm, r).factor
}

/// Weak-field combined (GR+SR) time dilation factor.
#[wasm_bindgen(js_name = "weakFieldDilation")]
pub fn weak_field_dilation(gm: f64, r: f64, v: f64) -> f64 {
    metric::weak_field(gm, r, v).factor
}

/// Kerr metric time dilation for stationary observer near rotating mass.
#[wasm_bindgen(js_name = "kerrDilation")]
pub fn kerr_dilation(gm: f64, a_star: f64, r: f64, theta: f64) -> f64 {
    metric::kerr_stationary(gm, a_star, r, theta).factor
}

/// Cosmological time dilation factor at redshift z.
#[wasm_bindgen(js_name = "cosmologicalDilation")]
pub fn cosmological_dilation(z: f64) -> f64 {
    metric::cosmological_dilation(z)
}

/// Seconds lost per year relative to a distant observer, given dilation factor.
#[wasm_bindgen(js_name = "secondsLostPerYear")]
pub fn seconds_lost_per_year(dilation_factor: f64) -> f64 {
    metric::DilationFactor::new(dilation_factor).seconds_lost_per_year()
}

// ─── Solar System Body Data ─────────────────────────────────────────────────

/// Get dilation factors for all solar system bodies at their surfaces.
/// Returns JSON array of {name, dilation_factor, seconds_lost_per_year}.
#[wasm_bindgen(js_name = "getSolarSystemDilation")]
pub fn get_solar_system_dilation() -> JsValue {
    let bodies = body::solar_system();
    let results: Vec<BodyDilationJs> = bodies
        .iter()
        .map(|b| {
            let df = metric::schwarzschild_stationary(b.gm, b.radius);
            BodyDilationJs {
                name: b.name.clone(),
                dilation_factor: df.factor,
                seconds_lost_per_year: df.seconds_lost_per_year(),
                schwarzschild_radius: b.schwarzschild_radius(),
                surface_gravity: b.surface_gravity(),
            }
        })
        .collect();
    serde_wasm_bindgen::to_value(&results).unwrap()
}

#[derive(serde::Serialize)]
struct BodyDilationJs {
    name: String,
    dilation_factor: f64,
    seconds_lost_per_year: f64,
    schwarzschild_radius: f64,
    surface_gravity: f64,
}

// ─── Comparison Functions ───────────────────────────────────────────────────

/// Compare two points in the solar system: differential aging per day.
/// body_a/body_b: "Sun", "Earth", "Mars", "Moon", "Jupiter", etc.
/// Returns microseconds per day (positive = A ages more).
#[wasm_bindgen(js_name = "compareBodies")]
pub fn compare_bodies(body_a: &str, body_b: &str) -> f64 {
    let get_body = |name: &str| -> Option<body::CelestialBody> {
        match name {
            "Sun" => Some(body::sun()),
            "Earth" => Some(body::earth()),
            "Mars" => Some(body::mars()),
            "Moon" => Some(body::moon()),
            "Jupiter" => Some(body::jupiter()),
            "Mercury" => Some(body::mercury()),
            "Venus" => Some(body::venus()),
            "Saturn" => Some(body::saturn()),
            _ => None,
        }
    };

    let a = match get_body(body_a) {
        Some(b) => b,
        None => return f64::NAN,
    };
    let b = match get_body(body_b) {
        Some(b) => b,
        None => return f64::NAN,
    };

    let obs_a = Observer::on_surface(&a);
    let obs_b = Observer::on_surface(&b);
    let diff = transform::accumulated_difference(86_400.0, &obs_a, &obs_b);
    diff.2 * 1e6 // convert to microseconds
}

// ─── Cosmological Functions ─────────────────────────────────────────────────

/// Age of the universe in gigayears.
#[wasm_bindgen(js_name = "ageOfUniverseGyr")]
pub fn age_of_universe_gyr() -> f64 {
    cosmo::age_now_gyr()
}

/// Age of the universe at a given redshift z in gigayears.
#[wasm_bindgen(js_name = "ageAtRedshiftGyr")]
pub fn age_at_redshift_gyr(z: f64) -> f64 {
    cosmo::age_at_redshift(z) / (constants::SECONDS_PER_YEAR * 1e9)
}

/// Scale factor a = 1/(1+z) at redshift z.
#[wasm_bindgen(js_name = "scaleFactorFromRedshift")]
pub fn scale_factor_from_redshift(z: f64) -> f64 {
    metric::scale_factor_from_redshift(z)
}

/// Observable universe comoving radius in gigalight-years.
#[wasm_bindgen(js_name = "observableUniverseRadiusGly")]
pub fn observable_universe_radius_gly() -> f64 {
    cosmo::observable_universe_radius() / (constants::C * constants::SECONDS_PER_YEAR * 1e9)
}

/// Conformal time from redshift z to present in gigayears.
#[wasm_bindgen(js_name = "conformalTimeGyr")]
pub fn conformal_time_gyr(z: f64) -> f64 {
    cosmo::conformal_time_from_redshift(z) / (constants::SECONDS_PER_YEAR * 1e9)
}

/// Lookback time to redshift z in gigayears.
#[wasm_bindgen(js_name = "lookbackTimeGyr")]
pub fn lookback_time_gyr(z: f64) -> f64 {
    metric::lookback_time(z) / (constants::SECONDS_PER_YEAR * 1e9)
}

/// Comoving distance to redshift z in gigalight-years.
#[wasm_bindgen(js_name = "comovingDistanceGly")]
pub fn comoving_distance_gly(z: f64) -> f64 {
    cosmo::comoving_distance(z) / (constants::C * constants::SECONDS_PER_YEAR * 1e9)
}

/// Hubble parameter at redshift z (km/s/Mpc).
#[wasm_bindgen(js_name = "hubbleParameterKmSMpc")]
pub fn hubble_parameter_km_s_mpc(z: f64) -> f64 {
    metric::hubble_parameter(z) * constants::MPC_METERS / 1000.0
}

// ─── Constants Exposed to JS ────────────────────────────────────────────────

#[wasm_bindgen(js_name = "SPEED_OF_LIGHT")]
pub fn speed_of_light() -> f64 {
    constants::C
}

#[wasm_bindgen(js_name = "GM_EARTH")]
pub fn gm_earth() -> f64 {
    constants::GM_EARTH
}

#[wasm_bindgen(js_name = "GM_SUN")]
pub fn gm_sun() -> f64 {
    constants::GM_SUN
}

#[wasm_bindgen(js_name = "R_EARTH")]
pub fn r_earth() -> f64 {
    constants::R_EARTH
}

#[wasm_bindgen(js_name = "R_SUN")]
pub fn r_sun() -> f64 {
    constants::R_SUN
}
