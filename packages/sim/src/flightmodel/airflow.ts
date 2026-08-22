/**
 * Relative airflow computation (FLT-203).
 *
 * Produces the AirflowState consumed by the flight model, HUD, AI and
 * telemetry. Sign conventions:
 *  - AoA > 0  : nose above the velocity vector (velocity below body X-Z plane)
 *  - Slip > 0 : relative wind from the RIGHT (velocity left of the nose)
 */
import { quatRotate, type Quat, type Vec3 } from "../physics/frames.js";
import { speedOfSound } from "../physics/atmosphere.js";

export interface AirflowState {
  /** Magnitude of velocity relative to air, m/s. */
  airspeed: number;
  /** Angle of attack in degrees (+ = nose above velocity). */
  aoaDeg: number;
  /** Sideslip angle in degrees (+ = wind from the right). */
  slipDeg: number;
  /** Mach number at current altitude. */
  mach: number;
  /** Velocity in the body frame (m/s): x right, y up, z forward(-). */
  velBody: { x: number; y: number; z: number };
}

export interface AirflowInput {
  pos: Vec3;
  att: Quat;
  /** World-frame velocity, m/s. */
  vel: Vec3;
  /** Altitude MSL in meters (for Mach). */
  altM: number;
  /** World-frame wind velocity, m/s (0 for still air). */
  wind: Vec3;
}

const RAD2DEG = 180 / Math.PI;

/** World->body rotation is the conjugate quaternion. */
function quatConjugate(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

export function computeAirflow(input: AirflowInput): AirflowState {
  const rel = {
    x: input.vel.x - input.wind.x,
    y: input.vel.y - input.wind.y,
    z: input.vel.z - input.wind.z,
  };
  // Velocity expressed in the body frame.
  const vb = quatRotate(quatConjugate(input.att), rel);

  const airspeed = Math.hypot(vb.x, vb.y, vb.z);
  const forwardComp = -vb.z; // + when moving toward the nose

  let aoaDeg: number;
  let slipDeg: number;
  if (airspeed < 1e-6 || forwardComp <= 1e-6) {
    // Undefined/hovering: clamp to zero rather than blow up downstream.
    aoaDeg = 0;
    slipDeg = 0;
  } else {
    aoaDeg = Math.atan2(-vb.y, forwardComp) * RAD2DEG;
    slipDeg = Math.atan2(-vb.x, forwardComp) * RAD2DEG;
  }

  const mach = airspeed / speedOfSound(input.altM);
  return { airspeed, aoaDeg, slipDeg, mach, velBody: vb };
}
