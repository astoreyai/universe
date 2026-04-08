//! IAU standard time scale conversions and Mars time computation.
//!
//! Wraps hifitime for standard scales (TAI, UTC, TT, TDB) and adds
//! custom conversions (TCG, TCB, MTC).

use crate::constants::*;

/// Mars Sol Date computed from a Unix timestamp (UTC seconds since 1970-01-01).
///
/// MSD = (unix_secs + (TAI−UTC)) / 88775.244147 + 34127.2954262
///
/// Note: TAI-UTC (leap seconds) should be provided. As of 2024, TAI-UTC = 37s.
pub fn mars_sol_date(unix_secs: f64, tai_utc_offset: f64) -> f64 {
    (unix_secs + tai_utc_offset) / MARS_SOL_SECONDS + MSD_UNIX_OFFSET
}

/// Mars Sol Date from Julian Date (Terrestrial Time).
///
/// MSD = (JD_TT − 2405522.0028779) / 1.0274912517
pub fn mars_sol_date_from_jd_tt(jd_tt: f64) -> f64 {
    (jd_tt - MSD_EPOCH_JD_TT) / EARTH_DAYS_PER_SOL
}

/// Coordinated Mars Time (MTC) from Mars Sol Date.
///
/// Returns fractional hours (0.0 to 24.0) in a 24-hour Mars clock.
pub fn mtc_from_msd(msd: f64) -> f64 {
    (msd.fract() + 1.0).fract() * 24.0 // handle negative fractions
}

/// MTC as hours, minutes, seconds.
pub fn mtc_hms(msd: f64) -> (u32, u32, u32) {
    let hours_frac = mtc_from_msd(msd);
    let h = hours_frac as u32;
    let m = ((hours_frac - h as f64) * 60.0) as u32;
    let s = ((hours_frac - h as f64 - m as f64 / 60.0) * 3600.0) as u32;
    (h, m, s)
}

/// Convert Terrestrial Time (TT) to Geocentric Coordinate Time (TCG).
///
/// TCG = TT + L_G × (JD_TT - T₀) × 86400 / (1 - L_G)
///
/// More precisely: TT = TCG × (1 - L_G), so TCG = TT / (1 - L_G)
/// but since we work with offsets from epoch:
/// TCG - TT = L_G × (JD_TT - T₀) × 86400 (to first order)
///
/// Returns the offset TCG - TT in seconds.
pub fn tcg_minus_tt(jd_tt: f64) -> f64 {
    L_G * (jd_tt - T0_JD) * SECONDS_PER_DAY
}

/// Convert Terrestrial Time (TT) to Barycentric Coordinate Time (TCB).
///
/// TCB - TCG involves the full GR metric integration (position-dependent).
/// For a rough approximation, we use:
/// TCB ≈ TCG + L_C × (JD_TCG - T₀) × 86400
/// where L_C ≈ L_B - L_G + L_B × L_G ≈ 1.480_826_855e-8
///
/// Returns the offset TCB - TT in seconds.
pub fn tcb_minus_tt(jd_tt: f64) -> f64 {
    // L_C is the rate difference between TCB and TCG
    let _l_c = L_B - L_G + L_B * L_G;
    // TCB - TT = (TCB - TCG) + (TCG - TT)
    //          = L_C × Δt + L_G × Δt
    //          ≈ L_B × Δt (since L_B = L_C + L_G - L_C×L_G)
    L_B * (jd_tt - T0_JD) * SECONDS_PER_DAY
}

/// Convert TDB to/from TCB.
///
/// TDB = TCB - L_B × (JD_TCB - T₀) × 86400 + TDB₀
///
/// Returns the offset TDB - TCB in seconds (always negative for dates after T₀).
pub fn tdb_minus_tcb(jd_tcb: f64) -> f64 {
    -L_B * (jd_tcb - T0_JD) * SECONDS_PER_DAY + TDB0
}

/// TT offset from TAI (constant = +32.184 s).
pub fn tt_minus_tai() -> f64 {
    TT_TAI_OFFSET
}

/// Julian Date from Unix timestamp (UTC).
pub fn jd_from_unix(unix_secs: f64) -> f64 {
    JD_UNIX_EPOCH + unix_secs / SECONDS_PER_DAY
}

/// Unix timestamp from Julian Date.
pub fn unix_from_jd(jd: f64) -> f64 {
    (jd - JD_UNIX_EPOCH) * SECONDS_PER_DAY
}

/// Julian Date of TT from Unix timestamp + leap seconds.
///
/// JD_TT = JD_UTC + (TAI-UTC)/86400 + 32.184/86400
pub fn jd_tt_from_unix(unix_secs: f64, tai_utc_offset: f64) -> f64 {
    JD_UNIX_EPOCH + (unix_secs + tai_utc_offset + TT_TAI_OFFSET) / SECONDS_PER_DAY
}

/// Current TAI-UTC offset (leap seconds) as of 2024.
/// This should ideally be loaded from IERS data, but we hardcode the current value.
pub const CURRENT_TAI_UTC: f64 = 37.0;

/// All-in-one: compute multiple time representations from a Unix timestamp.
#[derive(Debug, Clone)]
pub struct TimeRepresentations {
    pub unix_utc: f64,
    pub jd_utc: f64,
    pub jd_tai: f64,
    pub jd_tt: f64,
    pub tcg_minus_tt_s: f64,
    pub tcb_minus_tt_s: f64,
    pub mars_sol_date: f64,
    pub mtc_hours: f64,
}

impl TimeRepresentations {
    /// Compute all time representations from a Unix timestamp (UTC seconds).
    pub fn from_unix(unix_secs: f64) -> Self {
        let tai_utc = CURRENT_TAI_UTC;
        let jd_utc = jd_from_unix(unix_secs);
        let jd_tai = jd_utc + tai_utc / SECONDS_PER_DAY;
        let jd_tt = jd_tai + TT_TAI_OFFSET / SECONDS_PER_DAY;
        let tcg_tt = tcg_minus_tt(jd_tt);
        let tcb_tt = tcb_minus_tt(jd_tt);
        let msd = mars_sol_date(unix_secs, tai_utc);
        let mtc = mtc_from_msd(msd);

        Self {
            unix_utc: unix_secs,
            jd_utc,
            jd_tai,
            jd_tt,
            tcg_minus_tt_s: tcg_tt,
            tcb_minus_tt_s: tcb_tt,
            mars_sol_date: msd,
            mtc_hours: mtc,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tt_tai_offset() {
        assert_eq!(tt_minus_tai(), 32.184);
    }

    #[test]
    fn test_jd_unix_epoch() {
        let jd = jd_from_unix(0.0);
        assert!((jd - 2_440_587.5).abs() < 1e-10);
    }

    #[test]
    fn test_jd_roundtrip() {
        let t = 1_700_000_000.0; // some Unix time
        let jd = jd_from_unix(t);
        let t2 = unix_from_jd(jd);
        // f64 JD has limited precision at this magnitude (~2.46M days),
        // roundtrip accuracy is ~millisecond level
        assert!((t - t2).abs() < 0.01,
            "Roundtrip error: {} seconds", (t - t2).abs());
    }

    #[test]
    fn test_tcg_minus_tt_positive_after_epoch() {
        // After 1977, TCG runs ahead of TT
        let jd_2020 = 2_458_849.5; // ~2020-01-01
        let offset = tcg_minus_tt(jd_2020);
        assert!(offset > 0.0, "TCG should be ahead of TT after 1977: got {}", offset);
        // ~43 years × L_G × 86400 × 365.25 ≈ 0.95 s
        let years = (jd_2020 - T0_JD) / 365.25;
        assert!(years > 40.0 && years < 50.0);
        let expected_approx = L_G * years * SECONDS_PER_YEAR;
        assert!((offset - expected_approx).abs() / expected_approx < 0.01,
            "TCG-TT offset: got {:.6}, expected ~{:.6}", offset, expected_approx);
    }

    #[test]
    fn test_mars_sol_length() {
        // Verify sol length constant
        let hours = MARS_SOL_SECONDS / 3600.0;
        assert!(hours > 24.65 && hours < 24.67,
            "Mars sol should be ~24.66 hours: got {:.4}", hours);
    }

    #[test]
    fn test_mtc_range() {
        // MTC should always be in [0, 24)
        for msd in [0.0, 0.5, 1.0, 100.5, -0.3, 52345.7] {
            let mtc = mtc_from_msd(msd);
            assert!(mtc >= 0.0 && mtc < 24.0,
                "MTC out of range for MSD {}: got {}", msd, mtc);
        }
    }

    #[test]
    fn test_msd_from_known_date() {
        // 2024-01-01 00:00:00 UTC = Unix 1704067200
        // Cross-check: MSD should be a reasonable number (~53000+)
        let unix = 1_704_067_200.0;
        let msd = mars_sol_date(unix, 37.0);
        assert!(msd > 53_000.0 && msd < 54_000.0,
            "MSD for 2024-01-01 should be ~53xxx: got {:.2}", msd);
    }

    #[test]
    fn test_time_representations() {
        let t = 1_704_067_200.0; // 2024-01-01 00:00:00 UTC
        let rep = TimeRepresentations::from_unix(t);
        // JD_UTC for 2024-01-01 should be ~2460310.5
        assert!((rep.jd_utc - 2_460_310.5).abs() < 1.0,
            "JD_UTC: got {:.2}, expected ~2460310.5", rep.jd_utc);
        // TAI ahead of UTC
        assert!(rep.jd_tai > rep.jd_utc);
        // TT ahead of TAI
        assert!(rep.jd_tt > rep.jd_tai);
    }
}
