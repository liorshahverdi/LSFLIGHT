/**
 * Stability-coefficient aerodynamic model (FLT-204).
 *
 * YSFlight-style: lift from a piecewise-linear CL curve with critical-AoA
 * break; drag = cd0 + k*CL^2; restoring torques scale stability constants by
 * angle-off-velocity; control torques scale maneuverability constants by
 * dynamic pressure, capped at qBarCapPa.
 *
 * All quantities deterministic and pure — forces/torques are returned for the
 * caller to accumulate onto a RigidBody.
 */
import { airDensity } from "../physics/atmosphere.js";
import type { AirflowState } from "./airflow.js";

export interface AeroCoeffs {
  wingAreaM2: number;
  /** AoA at which CL would be zero (camber), degrees. */
  clZeroAoADeg: number;
  clSlopePerDeg: number;
  criticalAoAPositiveDeg: number;
  criticalAoANegativeDeg: number;
  /** Fraction of peak CL retained deep in the stall. */
  postStallClFraction: number;
  /** Degrees past critical over which CL falls to the stalled fraction. */
  stallFalloffDeg: number;
  cd0: number;
  inducedDragK: number;
  /** Restoring-torque stability coefficients (YSFlight CPITSTAB/CYAWSTAB style). */
  pitchStab: number;
  yawStab: number;
  /** AoA the airframe is trimmed to hold; stability restores THIS, not zero. */
  trimAoADeg: number;
  /** Control-torque maneuverability coefficients (CPITMANE/CYAWMANE/CROLLMAN style). */
  pitchManeuver: number;
  yawManeuver: number;
  rollManeuver: number;
  /** Pitch damping torque / (Pa * rad/s) at PITCH_DAMP_REFERENCE_SPEED_M_S.
   * Uses normalized pitch rate (reference speed / airspeed), hence scales with V.
   */
  pitchDamp: number;
  /** Yaw/roll damping torque / (Pa * rad/s), retaining the existing V² model. */
  yawDamp: number;
  rollDamp: number;
  /** Dynamic-pressure cap for control authority, Pa. */
  qBarCapPa: number;
}

export interface ControlSurfaces {
  elevator?: number; // -1..1 (+ = nose up)
  aileron?: number; // -1..1
  rudder?: number; // -1..1
}

export interface AeroResult {
  /** Body-frame aero force minus drag component ordering: x right, y up, z back. */
  forceBody: { x: number; y: number; z: number };
  dragN: number;
  liftN: number;
  /** Body-frame torque: x pitch, y yaw, z roll. */
  torqueBody: { x: number; y: number; z: number };
  qBar: number;
  cl: number;
  cd: number;
}

const DEG2RAD = Math.PI / 180;
/** Calibration speed for pitchDamp, not a low-speed authority floor. */
export const PITCH_DAMP_REFERENCE_SPEED_M_S = 60;

/** Piecewise-linear CL with post-stall falloff. */
export function liftCoefficient(aoaDeg: number, c: AeroCoeffs): number {
  const clLinear = c.clSlopePerDeg * (aoaDeg - c.clZeroAoADeg);

  if (aoaDeg > c.criticalAoAPositiveDeg) {
    const clAtCrit = c.clSlopePerDeg * (c.criticalAoAPositiveDeg - c.clZeroAoADeg);
    const t = Math.min(1, (aoaDeg - c.criticalAoAPositiveDeg) / c.stallFalloffDeg);
    return clAtCrit * (1 - (1 - c.postStallClFraction) * t);
  }
  if (aoaDeg < c.criticalAoANegativeDeg) {
    const clAtCrit = c.clSlopePerDeg * (c.criticalAoANegativeDeg - c.clZeroAoADeg);
    const t = Math.min(1, (c.criticalAoANegativeDeg - aoaDeg) / c.stallFalloffDeg);
    return clAtCrit * (1 - (1 - c.postStallClFraction) * t);
  }
  return clLinear;
}

export interface AngularRates {
  pitchRateRadS?: number;
  yawRateRadS?: number;
  rollRateRadS?: number;
}

export function computeAeroForces(
  airflow: AirflowState,
  altM: number,
  c: AeroCoeffs,
  controls: ControlSurfaces = {},
  rates: AngularRates = {},
): AeroResult {
  const rho = airDensity(altM);
  const v = airflow.airspeed;
  const qBarRaw = 0.5 * rho * v * v;
  const qBar = Math.min(qBarRaw, c.qBarCapPa);
  const S = c.wingAreaM2;

  if (v < 1e-6 || qBarRaw < 1e-9) {
    return {
      forceBody: { x: 0, y: 0, z: 0 },
      dragN: 0,
      liftN: 0,
      torqueBody: { x: 0, y: 0, z: 0 },
      qBar: 0,
      cl: 0,
      cd: c.cd0,
    };
  }

  // --- Forces -------------------------------------------------------------
  const aoaRad = airflow.aoaDeg * DEG2RAD;
  const cl = liftCoefficient(airflow.aoaDeg, c);
  const cd = c.cd0 + c.inducedDragK * cl * cl;

  // Lift/drag/stability use the UNCAPPED dynamic pressure; only control and
  // damping torques are capped (authority limit), otherwise high-speed flight
  // loses lift and dives away.
  const liftN = qBarRaw * S * cl;
  const dragN = qBarRaw * S * cd;

  // Wind-axes force assembly: drag exactly opposes the relative wind,
  // lift is perpendicular to it (tilted by AoA in the body Y-Z plane).
  const vb = airflow.velBody ?? { x: 0, y: 0, z: 0 };
  const invV = 1 / v;
  const px = vb.x * invV;
  const py = vb.y * invV;
  const pz = vb.z * invV;

  // Fuselage/body drag on perpendicular airflow: this is what rotates the
  // velocity vector toward the nose (speed stability). Without it, aoa/slip
  // are undamped and flight paths drift.
  const FUSE_AREA_M2 = 2;
  const fuseDragX = -0.5 * rho * Math.abs(vb.x) * vb.x * FUSE_AREA_M2;
  const fuseDragY = -0.5 * rho * Math.abs(vb.y) * vb.y * FUSE_AREA_M2;

  const forceBody = {
    x: -px * dragN + fuseDragX,
    y: liftN * Math.cos(aoaRad) - py * dragN + fuseDragY,
    z: -liftN * Math.sin(aoaRad) - pz * dragN,
  };

  // --- Torques (body frame: x pitch, y yaw, z roll) -----------------------
  const aoaOff = (airflow.aoaDeg - c.trimAoADeg) * DEG2RAD; // restore trim, not zero
  const slipOff = airflow.slipDeg * DEG2RAD;
  const pitchStabTorque = -qBarRaw * c.pitchStab * aoaOff; // +AoA -> nose down
  const yawStabTorque = qBarRaw * c.yawStab * slipOff; // +slip (wind from right) -> yaw right, reduces slip

  // Full throw retains authority beyond critical AoA; damping limits the
  // transient rate, not the attainable AoA (maneuver / stab * gain).
  const CTRL_GAIN = 0.15;
  const pitchCtrlTorque = qBar * c.pitchManeuver * (controls.elevator ?? 0) * CTRL_GAIN;
  const rollCtrlTorque = qBar * c.rollManeuver * (controls.aileron ?? 0) * CTRL_GAIN;
  const yawCtrlTorque = qBar * c.yawManeuver * (controls.rudder ?? 0) * CTRL_GAIN;

  // Rotational damping (FLT-312 analog): opposes angular rates.
  // Pitch rate damping uses normalized angular rate ~rate/V: a rotating
  // tail's incidence changes with rate/V, so its damping moment scales with V,
  // not V². Cap the speed at the same authority limit as control qBar. This
  // algebraic form is finite at rest and does not invent static aero torque.
  const dampingSpeed = Math.min(v, Math.sqrt((2 * c.qBarCapPa) / rho));
  const pitchDampPressure = 0.5 * rho * dampingSpeed * PITCH_DAMP_REFERENCE_SPEED_M_S;
  const pitchDampTorque = -pitchDampPressure * c.pitchDamp * (rates.pitchRateRadS ?? 0);
  const yawDampTorque = -qBar * c.yawDamp * (rates.yawRateRadS ?? 0);
  const rollDampTorque = -qBar * c.rollDamp * (rates.rollRateRadS ?? 0);

  return {
    forceBody,
    dragN,
    liftN,
    torqueBody: {
      x: pitchStabTorque + pitchCtrlTorque + pitchDampTorque,
      y: yawStabTorque + yawCtrlTorque + yawDampTorque,
      z: rollCtrlTorque + rollDampTorque,
    },
    qBar,
    cl,
    cd,
  };
}
