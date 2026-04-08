//! Universe Clock Engine
//!
//! A physically-grounded, multi-scale temporal framework for relativistic time
//! transformations spanning planetary to cosmological scales.
//!
//! # Modules
//!
//! - [`constants`] — Physical constants and IAU defining constants
//! - [`body`] — Celestial body definitions
//! - [`metric`] — Spacetime metrics (Schwarzschild, Kerr, FLRW)
//! - [`observer`] — Observer state and reference frames
//! - [`timescale`] — IAU time scale conversions and Mars time
//! - [`transform`] — Frame-to-frame time transformations
//! - [`cosmo`] — Cosmological computations
//! - [`wasm`] — WebAssembly bindings

pub mod body;
pub mod constants;
pub mod cosmo;
pub mod metric;
pub mod observer;
pub mod timescale;
pub mod transform;
pub mod wasm;
