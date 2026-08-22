/**
 * Engine models (FLT-206). Jet first; prop follows the same interface.
 * Deterministic: thrust depends only on throttle, AB state, altitude, fuel.
 */
import { airDensity } from "../physics/atmosphere.js";

const RHO0 = airDensity(0);
/** Thrust lapse exponent on density ratio (tunable, jet-like). */
const LAPSE_EXP = 0.85;
/** Minimum throttle fraction for lighting the afterburner. */
export const AB_MIN_THROTTLE = 0.95;

export interface JetEngineConfig {
  militaryThrustN: number;
  afterburnerThrustN?: number;
  fuelCapacityKg: number;
  fuelBurnMilitaryKgS: number;
  /** Required if afterburnerThrustN is set. */
  fuelBurnAfterburnerKgS?: number;
  /** Prop-like falloff: thrust *= max(0, 1 - v/falloff). Optional. */
  thrustFalloffVPerS?: number;
}

export interface JetEngine {
  config: JetEngineConfig;
  fuelKg: number;
}

export interface EngineCommand {
  /** 0..1. */
  throttle: number;
  afterburner: boolean;
}

export interface EngineOutput {
  thrustN: number;
  afterburnerLit: boolean;
  fuelKg: number;
}

export function createJetEngine(config: JetEngineConfig): JetEngine {
  return { config, fuelKg: config.fuelCapacityKg };
}

/**
 * Advance engine state one tick and produce thrust.
 * Fuel burn happens before thrust evaluation: a dry tank yields zero thrust
 * on the same tick it empties.
 */
export function stepEngine(
  e: JetEngine,
  cmd: EngineCommand,
  altM: number,
  dt: number,
  /** Airspeed in m/s for prop-style falloff (previous tick's value is fine). */
  airspeed = 0,
): EngineOutput {
  const c = e.config;
  const throttle = Math.min(1, Math.max(0, cmd.throttle));

  const abWanted =
    cmd.afterburner && throttle >= AB_MIN_THROTTLE && c.afterburnerThrustN !== undefined;
  const abThrustN = c.afterburnerThrustN ?? 0;
  const burnRate = abWanted ? (c.fuelBurnAfterburnerKgS ?? 0) : c.fuelBurnMilitaryKgS * throttle;

  e.fuelKg = Math.max(0, e.fuelKg - burnRate * dt);

  if (e.fuelKg <= 0 || throttle === 0) {
    return { thrustN: 0, afterburnerLit: false, fuelKg: e.fuelKg };
  }

  const sigma = airDensity(altM) / RHO0;
  const lapse = Math.pow(sigma, LAPSE_EXP);
  const speedFactor =
    c.thrustFalloffVPerS !== undefined
      ? Math.max(0, Math.min(1, 1 - airspeed / c.thrustFalloffVPerS))
      : 1;
  let thrustN = c.militaryThrustN * throttle * lapse * speedFactor;

  let abLit = false;
  if (abWanted && e.fuelKg > 0) {
    // Afterburner ignores prop-style falloff (jet-only feature).
    thrustN = abThrustN * lapse;
    abLit = true;
  }

  return { thrustN, afterburnerLit: abLit, fuelKg: e.fuelKg };
}
