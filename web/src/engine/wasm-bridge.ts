/**
 * WASM bridge: loads and exposes the Universe Clock engine to the frontend.
 */

import init, {
  getTimeRepresentations,
  getMTC,
  getMarsSolDate,
  schwarzschildDilation,
  weakFieldDilation,
  kerrDilation,
  cosmologicalDilation,
  secondsLostPerYear,
  getSolarSystemDilation,
  compareBodies,
  ageOfUniverseGyr,
  lookbackTimeGyr,
  comovingDistanceGly,
  hubbleParameterKmSMpc,
  ageAtRedshiftGyr,
  scaleFactorFromRedshift,
  observableUniverseRadiusGly,
  conformalTimeGyr,
  SPEED_OF_LIGHT,
  GM_EARTH,
  GM_SUN,
  R_EARTH,
  R_SUN,
} from "../wasm-pkg/universe_clock.js";

let initialized = false;

export async function initEngine(): Promise<void> {
  if (initialized) return;
  await init();
  initialized = true;
}

export interface TimeRepresentations {
  unix_utc: number;
  jd_utc: number;
  jd_tai: number;
  jd_tt: number;
  tcg_minus_tt_s: number;
  tcb_minus_tt_s: number;
  mars_sol_date: number;
  mtc_hours: number;
}

export interface BodyDilation {
  name: string;
  dilation_factor: number;
  seconds_lost_per_year: number;
  schwarzschild_radius: number;
  surface_gravity: number;
}

export const engine = {
  getTimeRepresentations: (unixSecs: number): TimeRepresentations =>
    getTimeRepresentations(unixSecs) as TimeRepresentations,

  getMTC: (unixSecs: number): string => getMTC(unixSecs),

  getMarsSolDate: (unixSecs: number): number => getMarsSolDate(unixSecs),

  schwarzschildDilation: (gm: number, r: number): number =>
    schwarzschildDilation(gm, r),

  weakFieldDilation: (gm: number, r: number, v: number): number =>
    weakFieldDilation(gm, r, v),

  kerrDilation: (gm: number, aStar: number, r: number, theta: number): number =>
    kerrDilation(gm, aStar, r, theta),

  cosmologicalDilation: (z: number): number => cosmologicalDilation(z),

  secondsLostPerYear: (factor: number): number => secondsLostPerYear(factor),

  getSolarSystemDilation: (): BodyDilation[] =>
    getSolarSystemDilation() as BodyDilation[],

  compareBodies: (a: string, b: string): number => compareBodies(a, b),

  ageOfUniverseGyr: (): number => ageOfUniverseGyr(),

  lookbackTimeGyr: (z: number): number => lookbackTimeGyr(z),

  comovingDistanceGly: (z: number): number => comovingDistanceGly(z),

  hubbleParameterKmSMpc: (z: number): number => hubbleParameterKmSMpc(z),

  ageAtRedshiftGyr: (z: number): number => ageAtRedshiftGyr(z),

  scaleFactorFromRedshift: (z: number): number => scaleFactorFromRedshift(z),

  observableUniverseRadiusGly: (): number => observableUniverseRadiusGly(),

  conformalTimeGyr: (z: number): number => conformalTimeGyr(z),

  constants: {
    c: () => SPEED_OF_LIGHT(),
    gmEarth: () => GM_EARTH(),
    gmSun: () => GM_SUN(),
    rEarth: () => R_EARTH(),
    rSun: () => R_SUN(),
  },
};
